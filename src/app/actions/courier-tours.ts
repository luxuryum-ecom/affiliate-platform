'use server'

// ─── Tournées + scan ramassage + retours 3 cas (module Livreurs, Lot D) ──────
//
// Chaîne de garde (verrouillée, cf. CLAUDE.md / LIVRABLE_MODULE_LIVREURS.md §🔒) :
// le pickup (record_pickup_scan) est un TRANSFERT DE GARDE dépôt→livreur, ZÉRO
// écriture ledger. Un retour déclaré (declare_courier_return, cf. courier-scan.ts)
// N'AFFECTE NI orders.status NI le ledger tant qu'un salarié/admin ne l'a pas
// confirmé (DOUBLE CONFIRMATION : confirm_return_depot / confirm_return_company).
// La confirmation passe orders.status='returned' et RÉUTILISE le trigger EXISTANT
// handle_order_status_reversal (mig 122, EN PROD, INCHANGÉ) pour la contre-
// passation du grand livre — aucune écriture ledger n'est faite ici. La perte
// (mark_return_lost) crée une créance PRODUIT (courier_product_debts, mig 126,
// append-only), déjà sommée par v_courier_balances.
//
// Toutes les écritures passent par les RPC SECURITY DEFINER de la mig 128
// (REVOKE public/anon/authenticated, GRANT service_role) — appelées via
// service_role APRÈS la garde admin/staff, jamais exposées au client.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireCapability } from './_guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCourierEvent } from '@/lib/notifications/courier-events'
import type { Database } from '@/types/supabase-generated'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Notifs livreur (best-effort, cœur notifications Lot E) ──────────────────
// RÈGLE ABSOLUE (CLAUDE.md) : notifs émises APRÈS le succès de la RPC, JAMAIS
// dans une transaction financière, JAMAIS bloquantes. Le try/catch englobe
// aussi les lectures légères (nom livreur / ville / montant) : un échec de
// lecture ne doit jamais faire échouer l'action.
async function notifyCourierEventSafe(
  admin: SupabaseClient,
  params: {
    event: Parameters<typeof notifyCourierEvent>[0]['event']
    orderId?: string
    courierId?: string
  },
): Promise<void> {
  try {
    const { event, orderId, courierId } = params
    let courierName: string | undefined
    let city: string | undefined
    let amountMad: number | undefined

    if (courierId) {
      const { data: courier } = await admin.from('couriers').select('name').eq('id', courierId).maybeSingle()
      courierName = (courier as { name: string } | null)?.name ?? undefined
    }
    if (orderId) {
      const { data: order } = await admin
        .from('orders')
        .select('customer_city, total_amount')
        .eq('id', orderId)
        .maybeSingle()
      const o = order as { customer_city: string | null; total_amount: number | string | null } | null
      city = o?.customer_city ?? undefined
      amountMad = o?.total_amount != null ? Number(o.total_amount) : undefined
    }

    await notifyCourierEvent({
      event,
      orderId,
      courierId,
      courierName,
      reference: orderId ? orderId.slice(0, 8) : undefined,
      city,
      amountMad,
    })
  } catch (e) {
    console.error('notifyCourierEventSafe', e)
  }
}

type CourierTourRow = Database['public']['Tables']['courier_tours']['Row']
type CourierReturnRow = Database['public']['Tables']['courier_returns']['Row']
type CourierRow = Database['public']['Tables']['couriers']['Row']

// ─── recordPickupScan ─────────────────────────────────────────────────────────

const RecordPickupScanSchema = z.object({
  orderId: z.string().uuid({ message: 'Commande invalide.' }),
  courierId: z.string().uuid({ message: 'Livreur invalide.' }),
  tourId: z.string().uuid({ message: 'Tournée invalide.' }).optional(),
})

export type RecordPickupScanInput = z.infer<typeof RecordPickupScanSchema>

export interface RecordPickupScanResult {
  error: string | null
  orderId: string | null
  courierId: string | null
  tourId: string | null
}

/**
 * Scan ramassage dépôt : transfert de garde dépôt→livreur (orders.courier_id).
 * ZÉRO écriture ledger (décision verrouillée §🔒). Réservé staff dépôt
 * (capacité `depot_supervision`, admin passe automatiquement — requireCapability).
 */
export async function recordPickupScan(input: RecordPickupScanInput): Promise<RecordPickupScanResult> {
  const parsed = RecordPickupScanSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Données invalides.',
      orderId: null,
      courierId: null,
      tourId: null,
    }
  }
  const { orderId, courierId, tourId } = parsed.data

  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.', orderId: null, courierId: null, tourId: null }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('record_pickup_scan', {
    p_order_id: orderId,
    p_courier_id: courierId,
    p_tour_id: tourId ?? null,
  })
  if (rpcErr) return { error: rpcErr.message, orderId: null, courierId: null, tourId: null }

  const res = (data ?? {}) as { order_id?: string; courier_id?: string; tour_id?: string | null }
  revalidatePath('/admin/couriers')

  const finalOrderId = res.order_id ?? orderId
  const finalCourierId = res.courier_id ?? courierId
  await notifyCourierEventSafe(admin, { event: 'courier_pickup', orderId: finalOrderId, courierId: finalCourierId })

  return {
    error: null,
    orderId: finalOrderId,
    courierId: finalCourierId,
    tourId: res.tour_id ?? tourId ?? null,
  }
}

// ─── listActiveCouriersForDepot ───────────────────────────────────────────────

export interface DepotCourierOption {
  id: string
  name: string
  courierType: string
}

export interface ListActiveCouriersForDepotResult {
  error: string | null
  couriers: DepotCourierOption[]
}

/**
 * Livreurs actifs, pour le sélecteur de la page scan ramassage dépôt. `couriers`
 * est en RLS admin-only (mig 126) : un salarié dépôt (capacité `depot_supervision`)
 * ne peut PAS lire la table directement → cette action passe par service_role
 * APRÈS la garde, et ne renvoie QUE {id, name, courierType} — zéro solde, zéro
 * donnée sensible (le salarié n'a pas à voir les encours/plafonds).
 */
export async function listActiveCouriersForDepot(): Promise<ListActiveCouriersForDepotResult> {
  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.', couriers: [] }

  const admin = createAdminClient()
  const { data, error: listErr } = await admin
    .from('couriers')
    .select('id, name, courier_type')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (listErr) return { error: listErr.message, couriers: [] }

  const couriers: DepotCourierOption[] = (
    (data ?? []) as Pick<CourierRow, 'id' | 'name' | 'courier_type'>[]
  ).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    courierType: c.courier_type ?? '',
  }))

  return { error: null, couriers }
}

// ─── createTour ───────────────────────────────────────────────────────────────

const CreateTourSchema = z.object({
  courierId: z.string().uuid({ message: 'Livreur invalide.' }),
  tourDate: z.string().trim().min(1, { message: 'Date de tournée requise.' }),
  orderIds: z.array(z.string().uuid({ message: 'Commande invalide.' })).min(1, { message: 'Au moins une commande.' }),
})

export type CreateTourInput = z.infer<typeof CreateTourSchema>

export interface CreateTourResult {
  error: string | null
  tourId: string | null
}

/** Crée une tournée et y lie les commandes fournies. Réservé admin. */
export async function createTour(input: CreateTourInput): Promise<CreateTourResult> {
  const parsed = CreateTourSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', tourId: null }
  }
  const { courierId, tourDate, orderIds } = parsed.data

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', tourId: null }

  const admin = createAdminClient()
  const { data: tour, error: insertErr } = await admin
    .from('courier_tours')
    .insert({ courier_id: courierId, tour_date: tourDate, created_by: userId })
    .select('id')
    .single()
  if (insertErr || !tour) return { error: insertErr?.message ?? 'Erreur lors de la création.', tourId: null }

  const tourId = (tour as { id: string }).id

  const { error: linkErr } = await admin
    .from('courier_tour_orders')
    .insert(orderIds.map((orderId) => ({ tour_id: tourId, order_id: orderId })))
  if (linkErr) return { error: linkErr.message, tourId }

  revalidatePath('/admin/couriers')
  return { error: null, tourId }
}

// ─── listCourierTours ─────────────────────────────────────────────────────────

export interface CourierTourSummary {
  id: string
  courierId: string
  tourDate: string
  status: string
  notes: string | null
  createdAt: string
}

export interface ListCourierToursResult {
  error: string | null
  tours: CourierTourSummary[]
}

/** Tournées d'un livreur, triées par date décroissante. Réservé admin. */
export async function listCourierTours(courierId: string): Promise<ListCourierToursResult> {
  const parsedId = z.string().uuid().safeParse(courierId?.trim())
  if (!parsedId.success) return { error: 'Livreur non spécifié.', tours: [] }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', tours: [] }

  const { data, error: listErr } = await supabase
    .from('courier_tours')
    .select('id, courier_id, tour_date, status, notes, created_at')
    .eq('courier_id', parsedId.data)
    .order('tour_date', { ascending: false })
  if (listErr) return { error: listErr.message, tours: [] }

  const tours: CourierTourSummary[] = ((data ?? []) as CourierTourRow[]).map((t) => ({
    id: t.id,
    courierId: t.courier_id,
    tourDate: t.tour_date,
    status: t.status,
    notes: t.notes,
    createdAt: t.created_at,
  }))

  return { error: null, tours }
}

// ─── getTourDetail ────────────────────────────────────────────────────────────

export interface TourDetailOrder {
  orderId: string
  totalAmount: number
  status: string
  customerCity: string | null
}

export interface TourDetail {
  tour: CourierTourSummary
  orders: TourDetailOrder[]
}

export interface GetTourDetailResult {
  error: string | null
  detail: TourDetail | null
}

/**
 * Détail d'une tournée : entête + commandes liées. Colonnes NON sensibles
 * uniquement (aucun coût/marge). Réservé admin.
 */
export async function getTourDetail(tourId: string): Promise<GetTourDetailResult> {
  const parsedId = z.string().uuid().safeParse(tourId?.trim())
  if (!parsedId.success) return { error: 'Tournée non spécifiée.', detail: null }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', detail: null }

  const { data: tourRow, error: tourErr } = await supabase
    .from('courier_tours')
    .select('id, courier_id, tour_date, status, notes, created_at')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (tourErr) return { error: tourErr.message, detail: null }
  if (!tourRow) return { error: 'Tournée introuvable.', detail: null }
  const tour = tourRow as CourierTourRow

  const { data: linkRows, error: linkErr } = await supabase
    .from('courier_tour_orders')
    .select('order_id')
    .eq('tour_id', parsedId.data)
  if (linkErr) return { error: linkErr.message, detail: null }

  const orderIds = ((linkRows ?? []) as { order_id: string }[]).map((r) => r.order_id)
  let orders: TourDetailOrder[] = []
  if (orderIds.length > 0) {
    const { data: orderRows, error: ordersErr } = await supabase
      .from('orders')
      .select('id, total_amount, status, customer_city')
      .in('id', orderIds)
    if (ordersErr) return { error: ordersErr.message, detail: null }
    orders = (orderRows ?? []).map((o) => ({
      orderId: o.id as string,
      totalAmount: Number(o.total_amount ?? 0),
      status: o.status as string,
      customerCity: o.customer_city as string | null,
    }))
  }

  return {
    error: null,
    detail: {
      tour: {
        id: tour.id,
        courierId: tour.courier_id,
        tourDate: tour.tour_date,
        status: tour.status,
        notes: tour.notes,
        createdAt: tour.created_at,
      },
      orders,
    },
  }
}

// ─── listCourierReturns ───────────────────────────────────────────────────────

export interface CourierReturnEntry {
  id: string
  orderId: string
  courierId: string
  state: string
  declaredAt: string | null
  confirmedAt: string | null
  companyRef: string | null
  notes: string | null
}

export interface ListCourierReturnsResult {
  error: string | null
  returns: CourierReturnEntry[]
}

/** Retours d'un livreur (toutes états) — lecture, réservé admin. */
export async function listCourierReturns(courierId: string): Promise<ListCourierReturnsResult> {
  const parsedId = z.string().uuid().safeParse(courierId?.trim())
  if (!parsedId.success) return { error: 'Livreur non spécifié.', returns: [] }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', returns: [] }

  const { data, error: listErr } = await supabase
    .from('courier_returns')
    .select('id, order_id, courier_id, state, declared_at, confirmed_at, company_ref, notes')
    .eq('courier_id', parsedId.data)
    .order('declared_at', { ascending: false })
  if (listErr) return { error: listErr.message, returns: [] }

  const returns: CourierReturnEntry[] = ((data ?? []) as CourierReturnRow[]).map((r) => ({
    id: r.id,
    orderId: r.order_id,
    courierId: r.courier_id,
    state: r.state,
    declaredAt: r.declared_at,
    confirmedAt: r.confirmed_at,
    companyRef: r.company_ref,
    notes: r.notes,
  }))

  return { error: null, returns }
}

// ─── confirmReturnDepot ───────────────────────────────────────────────────────

export interface ConfirmReturnResult {
  error: string | null
  orderId: string | null
  state: string | null
}

/**
 * CAS 1 — confirmation du retour par un salarié/admin dépôt (DOUBLE
 * CONFIRMATION §🔒). Passe orders.status='returned' → le trigger EXISTANT
 * (mig 122) contre-passe le ledger si la commande était 'delivered'.
 */
export async function confirmReturnDepot(orderId: string): Promise<ConfirmReturnResult> {
  const parsed = z.string().uuid({ message: 'Commande invalide.' }).safeParse(orderId?.trim())
  if (!parsed.success) return { error: 'Commande invalide.', orderId: null, state: null }

  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.', orderId: null, state: null }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('confirm_return_depot', { p_order_id: parsed.data })
  if (rpcErr) return { error: rpcErr.message, orderId: null, state: null }

  const res = (data ?? {}) as { order_id?: string; state?: string }
  revalidatePath('/admin/couriers')

  const finalOrderId = res.order_id ?? parsed.data
  const { data: ret } = await admin.from('courier_returns').select('courier_id').eq('order_id', finalOrderId).maybeSingle()
  await notifyCourierEventSafe(admin, {
    event: 'courier_return_confirmed',
    orderId: finalOrderId,
    courierId: (ret as { courier_id: string } | null)?.courier_id,
  })

  return { error: null, orderId: finalOrderId, state: res.state ?? null }
}

// ─── confirmReturnCompany ─────────────────────────────────────────────────────

const ConfirmReturnCompanySchema = z.object({
  orderId: z.string().uuid({ message: 'Commande invalide.' }),
  companyRef: z.string().trim().min(1, { message: 'Référence transporteur requise.' }).max(200),
})

export type ConfirmReturnCompanyInput = z.infer<typeof ConfirmReturnCompanySchema>

/**
 * CAS 2 — confirmation manuelle du retour par la société de transport, validée
 * par un admin (DOUBLE CONFIRMATION §🔒). Réservé admin.
 */
export async function confirmReturnCompany(input: ConfirmReturnCompanyInput): Promise<ConfirmReturnResult> {
  const parsed = ConfirmReturnCompanySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', orderId: null, state: null }
  }
  const { orderId, companyRef } = parsed.data

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', orderId: null, state: null }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('confirm_return_company', {
    p_order_id: orderId,
    p_company_ref: companyRef,
  })
  if (rpcErr) return { error: rpcErr.message, orderId: null, state: null }

  const res = (data ?? {}) as { order_id?: string; state?: string }
  revalidatePath('/admin/couriers')

  const finalOrderId = res.order_id ?? orderId
  const { data: ret } = await admin.from('courier_returns').select('courier_id').eq('order_id', finalOrderId).maybeSingle()
  await notifyCourierEventSafe(admin, {
    event: 'courier_return_confirmed',
    orderId: finalOrderId,
    courierId: (ret as { courier_id: string } | null)?.courier_id,
  })

  return { error: null, orderId: finalOrderId, state: res.state ?? null }
}

// ─── markReturnLost ───────────────────────────────────────────────────────────

const MarkReturnLostSchema = z.object({
  orderId: z.string().uuid({ message: 'Commande invalide.' }),
  amountMad: z.number().positive({ message: 'Montant invalide.' }),
  quantity: z.number().int().positive({ message: 'Quantité invalide.' }).default(1),
})

export type MarkReturnLostInput = z.infer<typeof MarkReturnLostSchema>

export interface MarkReturnLostResult {
  error: string | null
  orderId: string | null
  state: string | null
  debtMad: number | null
}

/**
 * CAS 3 — perte constatée sur un retour déclaré non produit (admin uniquement).
 * Crée une créance PRODUIT (courier_product_debts, append-only) — AUCUNE
 * écriture ledger globale (question ouverte @finance, non codée ici).
 */
export async function markReturnLost(input: MarkReturnLostInput): Promise<MarkReturnLostResult> {
  const parsed = MarkReturnLostSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Données invalides.',
      orderId: null,
      state: null,
      debtMad: null,
    }
  }
  const { orderId, amountMad, quantity } = parsed.data

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', orderId: null, state: null, debtMad: null }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('mark_return_lost', {
    p_order_id: orderId,
    p_amount_mad: amountMad,
    p_quantity: quantity,
  })
  if (rpcErr) return { error: rpcErr.message, orderId: null, state: null, debtMad: null }

  const res = (data ?? {}) as { order_id?: string; state?: string; debt_mad?: number }
  revalidatePath('/admin/couriers')

  const finalOrderId = res.order_id ?? orderId
  const finalDebtMad = res.debt_mad != null ? Number(res.debt_mad) : amountMad

  try {
    const { data: ret } = await admin.from('courier_returns').select('courier_id').eq('order_id', finalOrderId).maybeSingle()
    const lostCourierId = (ret as { courier_id: string } | null)?.courier_id
    await notifyCourierEventSafe(admin, {
      event: 'courier_return_lost',
      orderId: finalOrderId,
      courierId: lostCourierId,
    })

    // Vérifie over_cap APRÈS la perte (v_courier_balances déjà à jour, mig 126).
    if (lostCourierId) {
      const { data: bal } = await admin
        .from('v_courier_balances')
        .select('over_cap')
        .eq('id', lostCourierId)
        .maybeSingle()
      if ((bal as { over_cap: boolean } | null)?.over_cap) {
        await notifyCourierEventSafe(admin, { event: 'courier_over_cap', courierId: lostCourierId })
      }
    }
  } catch (e) {
    console.error('markReturnLost notif', e)
  }

  return {
    error: null,
    orderId: finalOrderId,
    state: res.state ?? null,
    debtMad: finalDebtMad,
  }
}
