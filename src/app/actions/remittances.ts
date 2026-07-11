'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from './_guards'
import { notifyCourierEvent } from '@/lib/notifications/courier-events'

/**
 * P0 réconciliation livreur — couche données.
 *
 * Consomme l'EXISTANT (mig 121-124, cf. CLAUDE.md) : la vue `v_courier_remittance_pending`
 * (mig 125, lecture seule) et la RPC SECURITY DEFINER `reconcile_courier_remittance`
 * (mig 122) qui crée le bordereau + lie les commandes + poste au grand livre + déclenche
 * l'auto-approbation des commissions (garde N1, mig 123). Aucune nouvelle logique
 * financière ici — uniquement l'orchestration serveur + validation zod.
 *
 * Réservé admin (allowAgent: false) — cockpit trésorerie/réconciliation = décision
 * financière (CLAUDE.md règle 5 : circuit @finance + @security-reviewer + Abdou).
 */

// ─── Types de sortie ──────────────────────────────────────────────────────────

export interface PendingRemittanceOrder {
  orderId: string
  reference: string | null
  expectedAmountMad: number
  courierCode: string | null
  courierZone: string | null
  city: string | null
  deliveredAt: string | null
  affiliateCommissionMad: number
  affiliateId: string | null
  affiliateName: string | null
}

export interface PendingRemittanceGroup {
  courierCode: string
  ordersCount: number
  totalExpectedMad: number
}

export interface ListPendingRemittancesResult {
  error: string | null
  orders: PendingRemittanceOrder[]
  groups: PendingRemittanceGroup[]
}

/**
 * Commandes COD livrées pas encore couvertes par un bordereau réconcilié
 * (à verser par le livreur), regroupées par transporteur.
 */
export async function listPendingRemittances(): Promise<ListPendingRemittancesResult> {
  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', orders: [], groups: [] }

  const { data: rows, error: viewErr } = await supabase
    .from('v_courier_remittance_pending')
    .select(
      'order_id, reference, expected_amount_mad, courier_code, courier_zone, city, delivered_at, affiliate_commission_mad, affiliate_id',
    )
    .order('delivered_at', { ascending: true })

  if (viewErr) return { error: viewErr.message, orders: [], groups: [] }

  const affiliateIds = Array.from(
    new Set((rows ?? []).map((r) => r.affiliate_id).filter((id): id is string => !!id)),
  )

  let namesById = new Map<string, string>()
  if (affiliateIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', affiliateIds)
    namesById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null] as const)
      .filter((entry): entry is [string, string] => !!entry[1]))
  }

  const orders: PendingRemittanceOrder[] = (rows ?? []).map((r) => ({
    orderId: r.order_id as string,
    reference: r.reference,
    expectedAmountMad: Number(r.expected_amount_mad ?? 0),
    courierCode: r.courier_code,
    courierZone: r.courier_zone,
    city: r.city,
    deliveredAt: r.delivered_at,
    affiliateCommissionMad: Number(r.affiliate_commission_mad ?? 0),
    affiliateId: r.affiliate_id,
    affiliateName: r.affiliate_id ? (namesById.get(r.affiliate_id) ?? null) : null,
  }))

  const groupMap = new Map<string, { ordersCount: number; totalExpectedMad: number }>()
  for (const o of orders) {
    const key = o.courierCode ?? 'inconnu'
    const g = groupMap.get(key) ?? { ordersCount: 0, totalExpectedMad: 0 }
    g.ordersCount += 1
    g.totalExpectedMad += o.expectedAmountMad
    groupMap.set(key, g)
  }
  const groups: PendingRemittanceGroup[] = Array.from(groupMap.entries()).map(
    ([courierCode, g]) => ({ courierCode, ordersCount: g.ordersCount, totalExpectedMad: g.totalExpectedMad }),
  )

  return { error: null, orders, groups }
}

// ─── reconcileRemittance ──────────────────────────────────────────────────────

const ReconcileRemittanceSchema = z.object({
  courierName: z.string().trim().min(1, { message: 'Nom du livreur requis.' }),
  receivedAmount: z.number().min(0, { message: 'Montant reçu invalide.' }),
  orderIds: z.array(z.string().uuid({ message: 'ID commande invalide.' })).min(1, {
    message: 'Au moins une commande requise.',
  }),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  courierId: z.string().uuid().optional(),
})

export type ReconcileRemittanceInput = z.infer<typeof ReconcileRemittanceSchema>

export interface ReconcileRemittanceResult {
  error: string | null
  remittanceId: string | null
}

/**
 * Clé d'idempotence DÉTERMINISTE côté serveur : dérivée du nom du livreur + des
 * commandes couvertes (triées), jamais du client. Un rejeu (double-clic, retry
 * réseau) avec le même jeu de commandes retombe sur le MÊME bordereau — la RPC
 * `reconcile_courier_remittance` (mig 122) retourne l'id existant sans dupliquer.
 */
function buildIdempotencyKey(courierName: string, orderIds: string[]): string {
  const sorted = [...orderIds].sort()
  const raw = `${courierName.trim().toLowerCase()}:${sorted.join(',')}`
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  return `remit:${hash}`
}

/**
 * Réconcilie un versement livreur : crée le bordereau `reconciled`, lie les
 * commandes couvertes, poste au grand livre (platform_cash ← cash_in_transit_courier)
 * et déclenche l'auto-approbation des commissions couvertes (garde N1, mig 123).
 *
 * Toute la logique financière vit dans la RPC SECURITY DEFINER `reconcile_courier_remittance`
 * (mig 122) — cette action ne fait que valider l'entrée et l'appeler.
 */
export async function reconcileRemittance(
  input: ReconcileRemittanceInput,
): Promise<ReconcileRemittanceResult> {
  const parsed = ReconcileRemittanceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.', remittanceId: null }
  }
  const { courierName, receivedAmount, orderIds, reference, notes, courierId } = parsed.data

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', remittanceId: null }

  // Durcissement (@security P2-3) : n'accepter QUE des commandes réellement « à verser »
  // (livrées ET pas déjà réconciliées). La vue v_courier_remittance_pending porte ce filtre
  // + le rempart staff → un admin ne peut pas réconcilier une commande non livrée ou déjà soldée.
  const { data: eligible, error: eligibleErr } = await supabase
    .from('v_courier_remittance_pending')
    .select('order_id')
    .in('order_id', orderIds)
  if (eligibleErr) return { error: eligibleErr.message, remittanceId: null }
  const eligibleIds = new Set((eligible ?? []).map((r) => r.order_id as string))
  const invalid = orderIds.filter((id) => !eligibleIds.has(id))
  if (invalid.length > 0) {
    return {
      error: `Commande(s) non éligible(s) à la réconciliation (non livrée ou déjà réconciliée) : ${invalid.length}.`,
      remittanceId: null,
    }
  }

  const idempotencyKey = buildIdempotencyKey(courierName, orderIds)

  const { data, error: rpcErr } = await supabase.rpc('reconcile_courier_remittance', {
    p_courier_name: courierName,
    p_received_amount: receivedAmount,
    p_order_ids: orderIds,
    p_idempotency_key: idempotencyKey,
    p_reference: reference ?? null,
    p_notes: notes ?? null,
    p_courier_id: courierId ?? null,
  })

  if (rpcErr) return { error: rpcErr.message, remittanceId: null }

  revalidatePath('/admin/remittances')
  revalidatePath('/admin/treasury')
  revalidatePath('/admin/commissions')

  const remittanceId = (data as string) ?? null

  // Notif best-effort (cœur notifications Lot E) — APRÈS le succès de la RPC,
  // jamais bloquant. Ne bloque jamais le retour de l'action.
  try {
    await notifyCourierEvent({
      event: 'courier_remittance',
      courierId: courierId,
      courierName: courierName,
      reference: remittanceId ? remittanceId.slice(0, 8) : undefined,
      amountMad: receivedAmount,
    })
  } catch (e) {
    console.error('reconcileRemittance notif', e)
  }

  return { error: null, remittanceId }
}

// ─── listRemittanceHistory ─────────────────────────────────────────────────────

export interface RemittanceHistoryEntry {
  id: string
  courierName: string
  expectedAmountMad: number
  receivedAmountMad: number
  status: string
  reference: string | null
  reconciledAt: string | null
  createdAt: string
  ordersCount: number
}

export interface ListRemittanceHistoryResult {
  error: string | null
  history: RemittanceHistoryEntry[]
}

/** Historique des bordereaux (les plus récents d'abord), avec nb de commandes liées. */
export async function listRemittanceHistory(limit = 50): Promise<ListRemittanceHistoryResult> {
  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.', history: [] }

  const safeLimit = Math.min(Math.max(1, Math.trunc(limit) || 50), 200)

  const { data: remittances, error: remitErr } = await supabase
    .from('courier_remittances')
    .select('id, courier_name, expected_amount_mad, received_amount_mad, status, reference, reconciled_at, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (remitErr) return { error: remitErr.message, history: [] }

  const ids = (remittances ?? []).map((r) => r.id)
  let countByRemittance = new Map<string, number>()
  if (ids.length > 0) {
    const { data: links, error: linksErr } = await supabase
      .from('courier_remittance_orders')
      .select('remittance_id')
      .in('remittance_id', ids)
    if (linksErr) return { error: linksErr.message, history: [] }
    countByRemittance = new Map()
    for (const link of links ?? []) {
      const id = link.remittance_id as string
      countByRemittance.set(id, (countByRemittance.get(id) ?? 0) + 1)
    }
  }

  const history: RemittanceHistoryEntry[] = (remittances ?? []).map((r) => ({
    id: r.id,
    courierName: r.courier_name,
    expectedAmountMad: Number(r.expected_amount_mad ?? 0),
    receivedAmountMad: Number(r.received_amount_mad ?? 0),
    status: r.status,
    reference: r.reference,
    reconciledAt: r.reconciled_at,
    createdAt: r.created_at,
    ordersCount: countByRemittance.get(r.id) ?? 0,
  }))

  return { error: null, history }
}
