'use server'

import { revalidatePath } from 'next/cache'
import type { CommissionStatus, ProofType } from '@/types/database'
import { requireAdmin } from './_guards'

export async function updateCommissionStatus(
  commissionId: string,
  newStatus: CommissionStatus
): Promise<{ error: string | null }> {
  if (!['approved', 'paid', 'pending'].includes(newStatus)) {
    return { error: 'Statut invalide.' }
  }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: true })
  if (error || !userId) return { error: error ?? 'Erreur.' }

  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'paid') {
    update.paid_at = new Date().toISOString()
  }

  const { error: updateErr } = await supabase
    .from('commissions')
    .update(update)
    .eq('id', commissionId)

  if (updateErr) return { error: updateErr.message }

  revalidatePath('/admin/orders')
  revalidatePath('/admin/commissions')
  revalidatePath('/admin/dashboard')
  return { error: null }
}

export async function addOrderProof(formData: FormData): Promise<{ error: string | null }> {
  const orderId = (formData.get('orderId') as string)?.trim()
  const proofType = formData.get('proofType') as ProofType
  const fileUrl = (formData.get('fileUrl') as string)?.trim()
  const notes = ((formData.get('notes') as string)?.trim()) || null

  if (!orderId || !fileUrl) return { error: 'Commande et URL du fichier requis.' }

  const validTypes: ProofType[] = [
    'bank_receipt',
    'transfer_proof',
    'delivery_receipt',
    'return_receipt',
    'stock_reception_proof',
    'other',
  ]
  if (!validTypes.includes(proofType)) return { error: 'Type de preuve invalide.' }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: true })
  if (error || !userId) return { error: error ?? 'Erreur.' }

  const { error: insertErr } = await supabase.from('order_proofs').insert({
    proof_type: proofType,
    file_url: fileUrl,
    uploaded_by: userId,
    related_order_id: orderId,
    notes,
  })

  if (insertErr) return { error: insertErr.message }

  revalidatePath(`/admin/orders/${orderId}`)
  return { error: null }
}
