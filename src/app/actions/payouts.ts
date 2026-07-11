'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { notifyPayoutPaid } from '@/lib/notifications/payout-paid'

// Méthodes de règlement acceptées (métadonnée descriptive, cf. mig 130). Toute
// autre valeur est ignorée (payment_method reste NULL).
const PAYMENT_METHODS = new Set(['virement', 'cash', 'cheque', 'autre'])

export interface CreatePayoutState {
  error: string | null
  success: boolean
  payoutId: string | null
  amount: number | null
}

/**
 * Crée un paiement pour un affilié via la RPC atomique + idempotente `create_payout`.
 *
 * Le montant N'EST PAS saisi par l'admin : il est DÉRIVÉ côté serveur = somme des
 * commissions `approved` non reversées de l'affilié. L'admin ne fait que VALIDER.
 *
 * Sécurité : tout (insert payout + maj commissions 'paid' + écriture ledger) se fait
 * dans UNE transaction atomique côté Postgres. Le double-clic / rejeu est neutralisé
 * par `p_idempotency_key` (clé stable générée par le formulaire). Un second appel avec
 * la même clé renvoie le même payout — jamais un double versement.
 */
export async function createPayout(
  _prev: CreatePayoutState,
  formData: FormData
): Promise<CreatePayoutState> {
  const affiliateId    = (formData.get('affiliateId') as string)?.trim()
  const idempotencyKey = (formData.get('idempotencyKey') as string)?.trim()
  const reference      = (formData.get('reference') as string)?.trim() || null
  const notes          = (formData.get('notes') as string)?.trim() || null
  const rawMethod      = (formData.get('paymentMethod') as string)?.trim() || ''
  const paymentMethod  = PAYMENT_METHODS.has(rawMethod) ? rawMethod : null

  if (!affiliateId)
    return { error: 'Affilié requis.', success: false, payoutId: null, amount: null }
  if (!idempotencyKey)
    return { error: 'Clé de sécurité manquante — rechargez la page.', success: false, payoutId: null, amount: null }

  // Garde admin côté serveur (la RPC re-vérifie aussi le rôle en défense en profondeur).
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId)
    return { error: error ?? 'Erreur.', success: false, payoutId: null, amount: null }

  // Appel unique à la RPC : montant dérivé, atomique, idempotent.
  const { data, error: rpcErr } = await supabase.rpc('create_payout', {
    p_affiliate_id: affiliateId,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_notes: notes,
  })

  if (rpcErr)
    return { error: rpcErr.message, success: false, payoutId: null, amount: null }

  // La fonction RETURNS public.payouts → ligne unique (objet, ou tableau selon PostgREST).
  const payout = (Array.isArray(data) ? data[0] : data) as { id: string; amount: number } | null
  if (!payout)
    return { error: 'Erreur lors de la création du paiement.', success: false, payoutId: null, amount: null }

  // ── Après le paiement (money déjà écrit au grand livre) : figer le relevé PDF +
  //    notifier l'affilié. Best-effort — un échec ici NE FAIT PAS échouer le paiement
  //    (déjà atomique/idempotent). Le relevé est régénérable (RPC idempotente).
  try {
    // 1) Méthode de règlement (métadonnée) — posée seulement si pas déjà fixée
    //    (rejeu idempotent → on ne réécrit pas). RLS : policy "payouts: admin update".
    if (paymentMethod) {
      await supabase
        .from('payouts')
        .update({ payment_method: paymentMethod })
        .eq('id', payout.id)
        .is('payment_method', null)
    }
    // 2) Figer le relevé depuis le grand livre (RPC admin-only, idempotente 1/payout).
    const { error: stmtErr } = await supabase.rpc('generate_payout_statement', {
      p_payout_id: payout.id,
    })
    if (stmtErr) console.error('generate_payout_statement:', stmtErr.message)
  } catch (e) {
    console.error('payout statement post-processing:', e instanceof Error ? e.message : e)
  }

  // 3) Notifier l'affilié (best-effort, in-app, cloisonné à SA rémunération).
  //    notifyPayoutPaid ne throw jamais (try/catch interne) ; double filet ici pour
  //    garantir qu'aucune erreur de notif ne transforme un paiement COMMITÉ en faux
  //    échec côté admin (@finance P3-1).
  try {
    await notifyPayoutPaid({
      affiliateId,
      payoutId: payout.id,
      amountMad: Number(payout.amount),
      reference,
    })
  } catch (e) {
    console.error('notifyPayoutPaid (payout créé):', e instanceof Error ? e.message : e)
  }

  revalidatePath('/admin/payouts')
  revalidatePath('/affiliate/statements')
  revalidatePath('/admin/commissions')
  revalidatePath('/admin/dashboard')
  revalidatePath('/affiliate/commissions')

  return { error: null, success: true, payoutId: payout.id, amount: Number(payout.amount) }
}
