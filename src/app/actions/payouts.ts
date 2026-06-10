'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'

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

  revalidatePath('/admin/payouts')
  revalidatePath('/admin/commissions')
  revalidatePath('/admin/dashboard')
  revalidatePath('/affiliate/commissions')

  return { error: null, success: true, payoutId: payout.id, amount: Number(payout.amount) }
}
