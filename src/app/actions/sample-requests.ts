'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type { SampleRequestType, SampleRequestStatus } from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const ok: ActionResult = { error: null, success: true }
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

// ── Wholesaler: submit sample request ─────────────────────────────────────────

export async function submitSampleRequest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'wholesaler') return fail('Accès réservé aux grossistes.')

  const supplierProductId = (formData.get('supplier_product_id') as string)?.trim()
  const requestType       = (formData.get('request_type') as string)?.trim() as SampleRequestType
  const message           = (formData.get('message') as string | null)?.trim() || null

  if (!supplierProductId) return fail('Produit requis.')
  if (!requestType)       return fail('Type de demande requis.')

  // Check no duplicate pending request
  const { data: existing } = await supabase
    .from('sample_requests')
    .select('id')
    .eq('wholesaler_id', user.id)
    .eq('supplier_product_id', supplierProductId)
    .eq('request_type', requestType)
    .in('status', ['pending', 'supplier_reply', 'approved'])
    .maybeSingle()

  if (existing) return fail('Une demande similaire est déjà en cours pour ce produit.')

  const { error } = await supabase.from('sample_requests').insert({
    wholesaler_id:       user.id,
    supplier_product_id: supplierProductId,
    request_type:        requestType,
    message,
  })

  if (error) return fail('Erreur lors de la soumission.')

  revalidatePath('/wholesale/samples')
  revalidatePath(`/wholesale/marketplace/${supplierProductId}`)
  return ok
}

// ── Supplier: upload reply files ───────────────────────────────────────────────

export async function uploadSampleReplyFile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const sampleRequestId = (formData.get('sample_request_id') as string)?.trim()
  const file = formData.get('file') as File | null

  if (!sampleRequestId || !file) return fail('Données manquantes.')

  // Verify supplier owns the product linked to this request
  const { data: req } = await supabase
    .from('sample_requests')
    .select('id, supplier_product_id')
    .eq('id', sampleRequestId)
    .single() as { data: { id: string; supplier_product_id: string } | null; error: unknown }
  if (!req) return fail('Demande introuvable.')

  const { data: product } = await supabase
    .from('supplier_products')
    .select('id')
    .eq('id', req.supplier_product_id)
    .eq('supplier_id', user.id)
    .single()
  if (!product) return fail('Accès refusé.')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fileType: 'image' | 'video' | 'pdf' =
    ['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' :
    ['mp4','webm','mov'].includes(ext) ? 'video' : 'pdf'

  const arrayBuffer = await file.arrayBuffer()
  const storagePath = `${sampleRequestId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: uploadErr } = await supabase.storage
    .from('sample-files')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadErr) return fail('Erreur lors de l\'upload.')

  const { error: dbErr } = await supabase.from('sample_request_files').insert({
    sample_request_id: sampleRequestId,
    uploader_role:     'supplier',
    filename:          file.name,
    storage_path:      storagePath,
    file_type:         fileType,
    file_size:         file.size,
    admin_approved:    false,
  })

  if (dbErr) return fail('Erreur lors de l\'enregistrement.')

  // Update request status to supplier_reply
  await supabase
    .from('sample_requests')
    .update({ status: 'supplier_reply' as SampleRequestStatus })
    .eq('id', sampleRequestId)
    .eq('status', 'pending')

  revalidatePath('/supplier/samples')
  return ok
}

// ── Admin: update sample request status ───────────────────────────────────────

export async function updateSampleStatus(
  requestId: string,
  status: SampleRequestStatus,
  adminNotes?: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const patch: Record<string, unknown> = { status }
  if (adminNotes !== undefined) patch.admin_notes = adminNotes

  const { error: dbErr } = await supabase
    .from('sample_requests')
    .update(patch)
    .eq('id', requestId)

  if (dbErr) return fail('Erreur lors de la mise à jour.')

  revalidatePath('/admin/samples')
  return ok
}

// ── Admin: approve/reject sample file ─────────────────────────────────────────

export async function updateSampleFileApproval(
  fileId: string,
  approved: boolean,
  notes?: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const { error: dbErr } = await supabase
    .from('sample_request_files')
    .update({ admin_approved: approved, admin_notes: notes ?? null })
    .eq('id', fileId)

  if (dbErr) return fail('Erreur.')
  revalidatePath('/admin/samples')
  return ok
}
