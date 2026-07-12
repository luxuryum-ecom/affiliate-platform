'use server'

// ─── Digest quotidien livreurs (module Livreurs, cœur notifications Lot E) ───
//
// Couche DONNÉES uniquement — l'envoi (email/Telegram récap) est fait ailleurs.
// Lecture pure sur l'EXISTANT (v_courier_balances mig 126, courier_returns/
// courier_product_debts mig 126/128, scan_events mig 100/128) — AUCUNE nouvelle
// table, AUCUNE écriture. Colonnes non sensibles uniquement (jamais marge/coût
// d'achat/commission). Réservé admin (allowAgent: false, cf. remittances.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from './_guards'

const NEAR_CAP_RATIO = 0.8

export interface DigestReturnPending {
  orderId: string
  courierName: string
  declaredAt: string | null
  ageDays: number
}

export interface DigestCourierCapEntry {
  name: string
  totalBalanceMad: number
  capMad: number
}

export interface DigestLossDebt {
  courierName: string
  amountMad: number
}

// Agent Gardien (Lot G) : alertes ouvertes agrégées par type + gravité.
export interface DigestGuardianAlert {
  alertType: string
  severity: string
  count: number
}

export interface CourierDailyDigest {
  returnsPending: DigestReturnPending[]
  couriersOverCap: DigestCourierCapEntry[]
  couriersNearCap: DigestCourierCapEntry[]
  totalOutstandingMad: number
  lossDebtsToday: DigestLossDebt[]
  pickedUpNotResolved: { count: number }[]
  guardianAlerts: DigestGuardianAlert[]
}

export interface GetCourierDailyDigestResult {
  error: string | null
  digest: CourierDailyDigest | null
}

function ageInDays(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Digest quotidien livreurs : retours en attente de confirmation, livreurs
 * over-cap / near-cap (>80% du plafond), encours total, pertes du jour,
 * colis ramassés non résolus (livrés/retournés). Réservé admin.
 */
export async function getCourierDailyDigest(): Promise<GetCourierDailyDigestResult> {
  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', digest: null }
  return computeCourierDigest(supabase)
}

/**
 * Calcul PUR du digest à partir d'un client Supabase. L'autorisation est faite
 * par l'appelant : `getCourierDailyDigest` (requireAdmin) OU la route cron
 * `/api/cron/courier-digest` (service_role, sécurisée par CRON_SECRET). Lecture
 * seule, colonnes non sensibles.
 */
export async function computeCourierDigest(
  supabase: SupabaseClient,
): Promise<GetCourierDailyDigestResult> {
  // ── 1. Retours déclarés non confirmés (chaîne de garde §🔒) ─────────────────
  const { data: pendingReturns, error: retErr } = await supabase
    .from('courier_returns')
    .select('order_id, courier_id, declared_at')
    .eq('state', 'declared')
    .order('declared_at', { ascending: true })
  if (retErr) return { error: retErr.message, digest: null }

  const courierIds = Array.from(
    new Set(
      (pendingReturns ?? [])
        .map((r) => r.courier_id as string | null)
        .filter((id): id is string => !!id),
    ),
  )

  let courierNamesById = new Map<string, string>()
  if (courierIds.length > 0) {
    const { data: couriers, error: courierErr } = await supabase
      .from('couriers')
      .select('id, name')
      .in('id', courierIds)
    if (courierErr) return { error: courierErr.message, digest: null }
    courierNamesById = new Map((couriers ?? []).map((c) => [c.id as string, c.name as string]))
  }

  const returnsPending: DigestReturnPending[] = (pendingReturns ?? []).map((r) => ({
    orderId: r.order_id as string,
    courierName: courierNamesById.get(r.courier_id as string) ?? '—',
    declaredAt: r.declared_at as string | null,
    ageDays: ageInDays(r.declared_at as string | null),
  }))

  // ── 2. Soldes livreurs (v_courier_balances, mig 126) ─────────────────────────
  const { data: balances, error: balErr } = await supabase
    .from('v_courier_balances')
    .select('name, total_balance_mad, balance_cap_mad, over_cap')
  if (balErr) return { error: balErr.message, digest: null }

  const balanceRows = (balances ?? []) as {
    name: string
    total_balance_mad: number | string
    balance_cap_mad: number | string
    over_cap: boolean
  }[]

  const couriersOverCap: DigestCourierCapEntry[] = balanceRows
    .filter((b) => b.over_cap)
    .map((b) => ({ name: b.name, totalBalanceMad: Number(b.total_balance_mad), capMad: Number(b.balance_cap_mad) }))

  const couriersNearCap: DigestCourierCapEntry[] = balanceRows
    .filter((b) => {
      const cap = Number(b.balance_cap_mad)
      const total = Number(b.total_balance_mad)
      return !b.over_cap && cap > 0 && total > cap * NEAR_CAP_RATIO
    })
    .map((b) => ({ name: b.name, totalBalanceMad: Number(b.total_balance_mad), capMad: Number(b.balance_cap_mad) }))

  const totalOutstandingMad = balanceRows.reduce((sum, b) => sum + Number(b.total_balance_mad), 0)

  // ── 3. Pertes constatées AUJOURD'HUI (courier_product_debts, mig 126) ────────
  const { data: debts, error: debtErr } = await supabase
    .from('courier_product_debts')
    .select('courier_id, amount_mad, created_at')
    .gte('created_at', startOfTodayIso())
    .gt('amount_mad', 0) // exclut les lignes de contre-passation (négatives)
  if (debtErr) return { error: debtErr.message, digest: null }

  const debtCourierIds = Array.from(
    new Set((debts ?? []).map((d) => d.courier_id as string).filter(Boolean)),
  )
  let debtNamesById = courierNamesById
  const missingIds = debtCourierIds.filter((id) => !debtNamesById.has(id))
  if (missingIds.length > 0) {
    const { data: extraCouriers, error: extraErr } = await supabase
      .from('couriers')
      .select('id, name')
      .in('id', missingIds)
    if (extraErr) return { error: extraErr.message, digest: null }
    debtNamesById = new Map(debtNamesById)
    for (const c of extraCouriers ?? []) debtNamesById.set(c.id as string, c.name as string)
  }

  const lossDebtsToday: DigestLossDebt[] = (debts ?? []).map((d) => ({
    courierName: debtNamesById.get(d.courier_id as string) ?? '—',
    amountMad: Number(d.amount_mad),
  }))

  // ── 4. Colis ramassés (pickup_dispatch) non résolus (ni livré ni retourné) ──
  const { data: pickupScans, error: scanErr } = await supabase
    .from('scan_events')
    .select('order_id')
    .eq('scan_type', 'pickup_dispatch')
  if (scanErr) return { error: scanErr.message, digest: null }

  const pickedUpOrderIds = Array.from(
    new Set((pickupScans ?? []).map((s) => s.order_id as string).filter(Boolean)),
  )

  let pickedUpNotResolvedCount = 0
  if (pickedUpOrderIds.length > 0) {
    const { data: unresolvedOrders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, status')
      .in('id', pickedUpOrderIds)
      .not('status', 'in', '(delivered,returned,cancelled)')
    if (ordersErr) return { error: ordersErr.message, digest: null }
    pickedUpNotResolvedCount = unresolvedOrders?.length ?? 0
  }

  // ── 5. Alertes Agent Gardien OUVERTES (Lot G, mig 131) — agrégées ───────────
  const { data: alertRows, error: alertErr } = await supabase
    .from('guardian_alerts')
    .select('alert_type, severity')
    .eq('status', 'open')
  if (alertErr) return { error: alertErr.message, digest: null }

  const alertMap = new Map<string, DigestGuardianAlert>()
  for (const a of alertRows ?? []) {
    const key = `${a.alert_type}|${a.severity}`
    const cur = alertMap.get(key)
    if (cur) cur.count += 1
    else alertMap.set(key, { alertType: a.alert_type as string, severity: a.severity as string, count: 1 })
  }
  // Tri : critical d'abord, puis par nombre décroissant.
  const guardianAlerts = Array.from(alertMap.values()).sort(
    (x, y) => (x.severity === 'critical' ? 0 : 1) - (y.severity === 'critical' ? 0 : 1) || y.count - x.count,
  )

  return {
    error: null,
    digest: {
      returnsPending,
      couriersOverCap,
      couriersNearCap,
      totalOutstandingMad,
      lossDebtsToday,
      pickedUpNotResolved: [{ count: pickedUpNotResolvedCount }],
      guardianAlerts,
    },
  }
}

