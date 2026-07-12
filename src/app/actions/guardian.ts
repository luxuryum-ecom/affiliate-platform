'use server'

// ─── Agent Gardien anti-collusion (module Livreurs, Lot G) ───────────────────
//
// COUCHE ORCHESTRATION. La logique de sécurité/finance vit dans les RPC SECURITY
// DEFINER (mig 131) : record_depot_reception (RÈGLE DU PORTEUR), confirm_cash_receipt
// (double confirmation), detect_*, evaluate_courier_block. Ici : garde d'auth,
// validation zod, appel via service_role APRÈS la garde, notif best-effort APRÈS
// succès (jamais dans une transaction financière — règle Lot E).
//
// TRAÇABILITÉ : les RPC reçoivent `p_actor_id = userId` (dérivé de requireAdmin/
// requireCapability, NON falsifiable par le client) car auth.uid() est NULL via le
// client service_role. C'est le socle de la détection de collusion (qui a scanné).
//
// FINANCIER : `confirmCashReceipt` est le SEUL point où la dette d'un livreur tombe
// (il appelle reconcile_courier_remittance mig 122, inchangée) → admin-only. Aucun
// auto-encaissement. Circuit @finance + @security-reviewer (CLAUDE.md règle 5).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireCapability } from './_guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCourierEvent } from '@/lib/notifications/courier-events'

const uuid = z.string().uuid({ message: 'Identifiant invalide.' })

// ─── Réception au dépôt — RÈGLE DU PORTEUR (porteur imposé) ──────────────────

const ReceptionSchema = z.object({
  orderId: uuid,
  // Porteur AFFICHÉ à l'écran, renvoyé pour anti-tamper (le serveur revérifie).
  confirmedCourierId: uuid.optional(),
  transporterNote: z.string().trim().max(200).optional(),
})
export type RecordDepotReceptionInput = z.infer<typeof ReceptionSchema>

export interface RecordDepotReceptionResult {
  error: string | null
  /** Code de refus gardien pour affichage 🚨 ('ghost_parcel' | 'cross_imputation'). */
  refusal?: 'ghost_parcel' | 'cross_imputation'
  reception?: {
    orderId: string
    bearerId: string
    bearerName: string
    amountMad: number
    path: 'nominal' | 'collusion_flagged' | 'already_received'
  }
}

/**
 * Réception guidée au dépôt. Le salarié NE CHOISIT JAMAIS le livreur : le porteur
 * est déduit du scan de ramassage. Colis jamais ramassé → refus (colis fantôme).
 * Porteur confirmé ≠ porteur réel → refus (imputation croisée). Réception sans
 * déclaration → alerte collusion + dette gelée. Les refus sont tracés en alerte.
 */
export async function recordDepotReception(
  input: RecordDepotReceptionInput,
): Promise<RecordDepotReceptionResult> {
  const parsed = ReceptionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.' }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('record_depot_reception', {
    p_order_id: parsed.data.orderId,
    p_actor_id: userId,
    p_confirmed_courier_id: parsed.data.confirmedCourierId ?? undefined,
    p_transporter_note: parsed.data.transporterNote ?? undefined,
  })

  if (rpcErr) {
    const msg = rpcErr.message ?? ''
    // Refus bloquant tracé : le RAISE a annulé la transaction → on journalise
    // l'alerte séparément (committée) pour l'audit anti-fraude.
    if (msg.includes('ghost_parcel')) {
      await admin.rpc('record_guardian_alert', {
        p_alert_type: 'ghost_parcel', p_severity: 'critical',
        p_order_id: parsed.data.orderId, p_staff_id: userId,
        p_details: { reason: 'reception_sans_ramassage' },
      })
      await notifyGuardianSafe(admin, { event: 'guardian_ghost_parcel', orderId: parsed.data.orderId })
      return { error: 'errors.ghost_parcel', refusal: 'ghost_parcel' }
    }
    if (msg.includes('cross_imputation')) {
      // Porteur réel (pour l'alerte) — lecture seule.
      const { data: realBearer } = await admin.rpc('resolve_parcel_bearer', { p_order_id: parsed.data.orderId })
      await admin.rpc('record_guardian_alert', {
        p_alert_type: 'cross_imputation', p_severity: 'critical',
        p_order_id: parsed.data.orderId, p_staff_id: userId,
        p_courier_id: (realBearer as string | null) ?? undefined,
        p_related_courier_id: parsed.data.confirmedCourierId ?? undefined,
        p_details: { attempted_courier_id: parsed.data.confirmedCourierId ?? null },
      })
      await notifyGuardianSafe(admin, { event: 'guardian_cross_imputation', orderId: parsed.data.orderId })
      return { error: 'errors.cross_imputation', refusal: 'cross_imputation' }
    }
    return { error: msg || 'Erreur de réception.' }
  }

  const r = data as {
    order_id: string; bearer_id: string; bearer_name: string
    amount_mad: number | string; path: 'nominal' | 'collusion_flagged' | 'already_received'
  }

  // Notif Abdou : collusion (réception sans déclaration) = 🚨 immédiat.
  if (r.path === 'collusion_flagged') {
    await notifyGuardianSafe(admin, {
      event: 'guardian_collusion', orderId: r.order_id,
      courierId: r.bearer_id, courierName: r.bearer_name,
      amountMad: r.amount_mad != null ? Number(r.amount_mad) : undefined,
    })
  }

  revalidatePath('/admin/guardian')
  revalidatePath('/admin/couriers/reception')
  return {
    error: null,
    reception: {
      orderId: r.order_id,
      bearerId: r.bearer_id,
      bearerName: r.bearer_name,
      amountMad: r.amount_mad != null ? Number(r.amount_mad) : 0,
      path: r.path,
    },
  }
}

// ─── Double confirmation de l'argent ────────────────────────────────────────

const DeclareCashSchema = z.object({
  courierId: uuid,
  orderIds: z.array(uuid).min(1, { message: 'Au moins une commande.' }),
  amountMad: z.coerce.number().nonnegative({ message: 'Montant invalide.' }),
  method: z.enum(['cash', 'virement']),
})
export type DeclareCourierCashInput = z.infer<typeof DeclareCashSchema>

/**
 * Déclare un versement livreur → confirmation `pending`. LA DETTE NE TOMBE PAS.
 * Alerte Abdou. Aucune écriture financière ici.
 */
export async function declareCourierCash(
  input: DeclareCourierCashInput,
): Promise<{ error: string | null; confirmationId?: string }> {
  const parsed = DeclareCashSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.' }

  // @finance P0 : clé d'idempotence STABLE dérivée des entrées (un retry / double-clic
  // retombe sur la confirmation existante — jamais une 2ᵉ pending → jamais un double
  // versement). NE PAS utiliser randomUUID (défait l'idempotence UNIQUE côté RPC).
  const sortedOrderIds = [...parsed.data.orderIds].sort()
  const idempotencyKey = `cash-decl:${parsed.data.courierId}:${sortedOrderIds.join(',')}:${parsed.data.amountMad.toFixed(2)}:${parsed.data.method}`

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('declare_courier_cash', {
    p_courier_id: parsed.data.courierId,
    p_order_ids: sortedOrderIds,
    p_amount_mad: parsed.data.amountMad,
    p_method: parsed.data.method,
    p_actor_id: userId,
    p_idempotency_key: idempotencyKey,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur de déclaration.' }

  const { data: courier } = await admin.from('couriers').select('name').eq('id', parsed.data.courierId).maybeSingle()
  await notifyGuardianSafe(admin, {
    event: 'guardian_cash_pending', courierId: parsed.data.courierId,
    courierName: (courier as { name: string } | null)?.name, amountMad: parsed.data.amountMad,
  })

  revalidatePath('/admin/guardian')
  return { error: null, confirmationId: (data as { id: string } | null)?.id }
}

const ConfirmCashSchema = z.object({
  confirmationId: uuid,
  receivedAmount: z.coerce.number().nonnegative().optional(),
})

/**
 * ADMIN (Abdou) valide la réception réelle du versement → la dette du SEUL porteur
 * tombe (reconcile_courier_remittance, mig 122, inchangée). FINANCIER, admin-only.
 */
export async function confirmCashReceipt(
  input: z.infer<typeof ConfirmCashSchema>,
): Promise<{ error: string | null; remittanceId?: string }> {
  const parsed = ConfirmCashSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }

  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('confirm_cash_receipt', {
    p_confirmation_id: parsed.data.confirmationId,
    p_actor_id: userId,
    p_received_amount: parsed.data.receivedAmount ?? undefined,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur de confirmation.' }

  revalidatePath('/admin/guardian')
  revalidatePath('/admin/treasury')
  return { error: null, remittanceId: (data as { remittance_id: string } | null)?.remittance_id }
}

export async function rejectCashConfirmation(
  input: { confirmationId: string; reason: string },
): Promise<{ error: string | null }> {
  const parsed = z.object({ confirmationId: uuid, reason: z.string().trim().min(1).max(300) }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }

  const admin = createAdminClient()
  const { error: rpcErr } = await admin.rpc('reject_cash_confirmation', {
    p_confirmation_id: parsed.data.confirmationId, p_actor_id: userId, p_reason: parsed.data.reason,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  revalidatePath('/admin/guardian')
  return { error: null }
}

// ─── Blocage / déblocage (sanctions) ────────────────────────────────────────

export async function blockCourier(
  input: { courierId: string; reason: string; block: boolean },
): Promise<{ error: string | null }> {
  const parsed = z.object({ courierId: uuid, reason: z.string().trim().max(300).optional().default(''), block: z.boolean() }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }

  const admin = createAdminClient()
  const { error: rpcErr } = await admin.rpc('block_courier', {
    p_courier_id: parsed.data.courierId, p_actor_id: userId, p_reason: parsed.data.reason, p_block: parsed.data.block,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  revalidatePath('/admin/guardian')
  revalidatePath('/admin/couriers')
  return { error: null }
}

// ─── Résolution d'alertes ───────────────────────────────────────────────────

export async function resolveGuardianAlert(
  input: { alertId: string; status: 'resolved' | 'dismissed'; reason: string },
): Promise<{ error: string | null }> {
  const parsed = z.object({
    alertId: uuid, status: z.enum(['resolved', 'dismissed']), reason: z.string().trim().max(300).optional().default(''),
  }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }

  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }

  const admin = createAdminClient()
  const { error: rpcErr } = await admin.rpc('resolve_guardian_alert', {
    p_alert_id: parsed.data.alertId, p_actor_id: userId, p_status: parsed.data.status, p_reason: parsed.data.reason,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  revalidatePath('/admin/guardian')
  return { error: null }
}

// ─── Détections (déclenchables manuellement + cron) ─────────────────────────

export async function runGuardianDetections(): Promise<{
  error: string | null; ghostReturns?: number; patterns?: number; debtSpikes?: number
}> {
  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }

  const admin = createAdminClient()
  const [g, p, d] = await Promise.all([
    admin.rpc('detect_ghost_returns', { p_hours: 48 }),
    admin.rpc('detect_courier_staff_patterns', { p_window_days: 30, p_threshold: 10 }),
    admin.rpc('detect_debt_spikes', { p_threshold_mad: 5000 }),
  ])
  revalidatePath('/admin/guardian')
  return {
    error: null,
    ghostReturns: (g.data as number | null) ?? 0,
    patterns: (p.data as number | null) ?? 0,
    debtSpikes: (d.data as number | null) ?? 0,
  }
}

export async function evaluateCourierBlock(courierId: string): Promise<{ error: string | null; action?: string }> {
  const parsed = uuid.safeParse(courierId)
  if (!parsed.success) return { error: 'Identifiant invalide.' }
  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('evaluate_courier_block', { p_courier_id: parsed.data })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  const res = data as { action: string } | null
  if (res?.action === 'auto_blocked') {
    const { data: c } = await admin.from('couriers').select('name').eq('id', parsed.data).maybeSingle()
    await notifyGuardianSafe(admin, { event: 'guardian_auto_block', courierId: parsed.data, courierName: (c as { name: string } | null)?.name })
  }
  revalidatePath('/admin/guardian')
  return { error: null, action: res?.action }
}

// ─── Inventaire mensuel guidé ───────────────────────────────────────────────

export async function openInventory(periodLabel: string): Promise<{ error: string | null; snapshotId?: string }> {
  const parsed = z.string().trim().min(1).max(60).safeParse(periodLabel)
  if (!parsed.success) return { error: 'Libellé de période invalide.' }
  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('open_inventory_snapshot', { p_period_label: parsed.data, p_actor_id: userId })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  revalidatePath('/admin/couriers/inventory')
  return { error: null, snapshotId: data as string }
}

export async function recordInventoryCount(
  input: { snapshotId: string; variantId: string; countedQty: number },
): Promise<{ error: string | null }> {
  const parsed = z.object({ snapshotId: uuid, variantId: uuid, countedQty: z.coerce.number().int().nonnegative() }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Entrée invalide.' }
  const { error, userId } = await requireCapability('depot_supervision')
  if (error || !userId) return { error: error ?? 'Permission requise.' }
  const admin = createAdminClient()
  const { error: rpcErr } = await admin.rpc('record_inventory_count', {
    p_snapshot_id: parsed.data.snapshotId, p_variant_id: parsed.data.variantId,
    p_counted_qty: parsed.data.countedQty, p_actor_id: userId,
  })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  return { error: null }
}

export async function closeInventory(snapshotId: string): Promise<{ error: string | null; deltas?: number }> {
  const parsed = uuid.safeParse(snapshotId)
  if (!parsed.success) return { error: 'Identifiant invalide.' }
  const { error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Accès réservé aux administrateurs.' }
  const admin = createAdminClient()
  const { data, error: rpcErr } = await admin.rpc('close_inventory_snapshot', { p_snapshot_id: parsed.data, p_actor_id: userId })
  if (rpcErr) return { error: rpcErr.message ?? 'Erreur.' }
  revalidatePath('/admin/couriers/inventory')
  revalidatePath('/admin/guardian')
  return { error: null, deltas: (data as { deltas: number } | null)?.deltas ?? 0 }
}

// ─── Notif best-effort (jamais bloquante) ───────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourierNotificationEvent } from '@/lib/notifications/courier-events'

async function notifyGuardianSafe(
  _admin: SupabaseClient,
  params: { event: CourierNotificationEvent; orderId?: string; courierId?: string; courierName?: string; amountMad?: number },
): Promise<void> {
  try {
    await notifyCourierEvent({
      event: params.event,
      orderId: params.orderId,
      courierId: params.courierId,
      courierName: params.courierName,
      reference: params.orderId ? params.orderId.slice(0, 8) : undefined,
      amountMad: params.amountMad,
    })
  } catch (e) {
    console.error('notifyGuardianSafe', e)
  }
}
