import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Notification « paiement affilié » (module Livreurs, Lot F).
 *
 * Émise APRÈS la création réussie d'un payout + son relevé figé. BEST-EFFORT TOTAL :
 * ne throw JAMAIS — un échec de notif ne doit jamais faire échouer le paiement (déjà
 * écrit au grand livre). Calque le patron Lot E (courier-events).
 *
 * Destinataire : l'AFFILIÉ concerné UNIQUEMENT (sa propre rémunération). Le payload
 * ne contient QUE des champs sûrs {amountMad, reference} — aucune marge, aucun coût,
 * aucune donnée d'un autre affilié. In-app seulement (pas de Telegram : non critique).
 */
export interface NotifyPayoutPaidInput {
  affiliateId: string
  payoutId: string
  amountMad: number
  reference?: string | null
}

export async function notifyPayoutPaid(input: NotifyPayoutPaidInput): Promise<void> {
  try {
    const { affiliateId, payoutId, amountMad, reference } = input
    if (!affiliateId) return
    const admin = createAdminClient()

    const payload: { amountMad: number; reference?: string; payoutId: string } = {
      amountMad,
      payoutId,
    }
    if (reference) payload.reference = reference

    // Dédup par (recipient, event, payoutId) — un rejeu idempotent du payout ne crée
    // pas de doublon de cloche. Pas d'index unique dédié : on vérifie l'existant.
    const { data: existing } = (await admin
      .from('notifications')
      .select('id')
      .eq('recipient_id', affiliateId)
      .eq('event', 'payout_paid')
      .contains('payload', { payoutId })
      .limit(1)) as { data: { id: string }[] | null }
    if (existing && existing.length > 0) return

    await admin.from('notifications').insert({
      recipient_id: affiliateId,
      event: 'payout_paid',
      payload,
      channels: ['in_app'],
    })
  } catch (e) {
    console.error('notifyPayoutPaid', e)
  }
}
