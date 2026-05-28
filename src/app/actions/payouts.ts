'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'

export interface CreatePayoutState {
  error: string | null
  success: boolean
  payoutId: string | null
}

/**
 * Creates a payout for one affiliate and marks all their approved commissions as paid.
 * The payout amount is whatever the admin enters — it reflects what was actually transferred.
 */
export async function createPayout(
  _prev: CreatePayoutState,
  formData: FormData
): Promise<CreatePayoutState> {
  const affiliateId = (formData.get('affiliateId') as string)?.trim()
  const amountRaw   = (formData.get('amount') as string)?.trim()
  const reference   = (formData.get('reference') as string)?.trim() || null
  const notes       = (formData.get('notes') as string)?.trim() || null

  if (!affiliateId) return { error: 'Affilié requis.', success: false, payoutId: null }

  const amount = parseFloat(amountRaw)
  if (!amountRaw || isNaN(amount) || amount <= 0)
    return { error: 'Montant invalide.', success: false, payoutId: null }

  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Erreur.', success: false, payoutId: null }

  // Fetch all approved commissions for this affiliate
  const { data: commissions, error: fetchErr } = await supabase
    .from('commissions')
    .select('id')
    .eq('affiliate_id', affiliateId)
    .eq('status', 'approved')

  if (fetchErr) return { error: fetchErr.message, success: false, payoutId: null }
  if (!commissions || commissions.length === 0)
    return { error: 'Aucune commission approuvée pour cet affilié.', success: false, payoutId: null }

  // Create the payout record
  const { data: payout, error: payoutErr } = await supabase
    .from('payouts')
    .insert({
      affiliate_id: affiliateId,
      amount,
      status: 'paid',
      reference,
      notes,
      paid_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (payoutErr || !payout) return { error: payoutErr?.message ?? 'Erreur création paiement.', success: false, payoutId: null }

  // Mark all approved commissions as paid
  const commissionIds = commissions.map((c) => c.id)
  const { error: updateErr } = await supabase
    .from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', commissionIds)

  if (updateErr) return { error: updateErr.message, success: false, payoutId: payout.id }

  revalidatePath('/admin/payouts')
  revalidatePath('/admin/commissions')
  revalidatePath('/admin/dashboard')
  revalidatePath('/affiliate/commissions')

  return { error: null, success: true, payoutId: payout.id }
}
