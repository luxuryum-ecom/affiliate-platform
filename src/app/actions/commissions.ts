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

/**
 * Bulk-approve all commissions whose IDs are provided and whose current status is 'pending'.
 * Only 'pending' rows are touched — already-approved or paid commissions are skipped.
 * Returns the count of rows actually updated.
 */
export async function bulkApproveCommissions(
  commissionIds: string[]
): Promise<{ updated: number; error: string | null }> {
  if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
    return { updated: 0, error: null }
  }

  const { supabase, error } = await requireAdmin({ allowAgent: false })
  if (error) return { updated: 0, error }

  const { data, error: updateErr } = await supabase
    .from('commissions')
    .update({ status: 'approved' as CommissionStatus })
    .in('id', commissionIds)
    .eq('status', 'pending')
    .select('id')

  if (updateErr) return { updated: 0, error: updateErr.message }

  revalidatePath('/admin/commissions')
  revalidatePath('/admin/dashboard')
  revalidatePath('/affiliate/commissions')
  return { updated: data?.length ?? 0, error: null }
}

export async function addOrderProof(formData: FormData): Promise<{ error: string | null }> {
  const orderId = (formData.get('orderId') as string)?.trim()
  const proofType = formData.get('proofType') as ProofType
  const notes = ((formData.get('notes') as string)?.trim()) || null

  if (!orderId) return { error: 'Commande non spécifiée.' }

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

  // File upload path (priority) — falls back to URL field
  const file = formData.get('file') as File | null
  let resolvedUrl: string | null = null

  if (file && file.size > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const storagePath = `${orderId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('order-proofs')
      .upload(storagePath, arrayBuffer, { contentType: file.type || `application/${ext}`, upsert: false })

    if (uploadErr) return { error: `Erreur upload : ${uploadErr.message}` }

    const { data: urlData } = supabase.storage.from('order-proofs').getPublicUrl(storagePath)
    resolvedUrl = urlData.publicUrl
  } else {
    const fallbackUrl = (formData.get('fileUrl') as string)?.trim()
    if (!fallbackUrl) return { error: 'Fichier ou URL requis.' }
    resolvedUrl = fallbackUrl
  }

  const { error: insertErr } = await supabase.from('order_proofs').insert({
    proof_type: proofType,
    file_url: resolvedUrl,
    uploaded_by: userId,
    related_order_id: orderId,
    notes,
  })

  if (insertErr) return { error: insertErr.message }

  revalidatePath(`/admin/orders/${orderId}`)
  return { error: null }
}
