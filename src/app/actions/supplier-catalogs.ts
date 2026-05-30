'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type { CatalogFileType, AttachmentType, AttachmentAdminStatus } from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const ok: ActionResult = { error: null, success: true }
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

function detectCatalogType(filename: string): CatalogFileType | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf')  return 'pdf'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (ext === 'zip')  return 'zip'
  return null
}

function detectAttachmentType(filename: string): AttachmentType | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return null
  if (['jpg','jpeg','png','webp','gif'].includes(ext)) return 'image'
  if (['mp4','webm','mov'].includes(ext))              return 'video'
  if (ext === 'pdf') return 'pdf_datasheet'
  return null
}

// ── Supplier: upload company catalog ──────────────────────────────────────────

export async function uploadSupplierCatalog(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const file = formData.get('file') as File | null
  if (!file) return fail('Fichier requis.')

  const fileType = detectCatalogType(file.name)
  if (!fileType) return fail('Format non supporté. Utilisez PDF, XLSX ou ZIP.')

  const arrayBuffer = await file.arrayBuffer()
  const storagePath = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: uploadErr } = await supabase.storage
    .from('supplier-catalogs')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadErr) return fail('Erreur lors de l\'upload.')

  const { error: dbErr } = await supabase.from('supplier_catalogs').insert({
    supplier_id:  user.id,
    filename:     file.name,
    storage_path: storagePath,
    file_type:    fileType,
    file_size:    file.size,
  })

  if (dbErr) return fail('Erreur lors de l\'enregistrement.')

  revalidatePath('/supplier/catalogs')
  return ok
}

// ── Supplier: upload product attachment ───────────────────────────────────────

export async function uploadProductAttachment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const file              = formData.get('file') as File | null
  const supplierProductId = (formData.get('supplier_product_id') as string)?.trim()
  const attachmentTypeOverride = (formData.get('attachment_type') as string | null)?.trim() as AttachmentType | null

  if (!file || !supplierProductId) return fail('Données manquantes.')

  // Verify supplier owns the product
  const { data: product } = await supabase
    .from('supplier_products')
    .select('id')
    .eq('id', supplierProductId)
    .eq('supplier_id', user.id)
    .single()
  if (!product) return fail('Produit introuvable.')

  const attachmentType = attachmentTypeOverride ?? detectAttachmentType(file.name)
  if (!attachmentType) return fail('Format non supporté.')

  const arrayBuffer = await file.arrayBuffer()
  const storagePath = `${user.id}/${supplierProductId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: uploadErr } = await supabase.storage
    .from('supplier-attachments')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadErr) return fail('Erreur lors de l\'upload.')

  const { error: dbErr } = await supabase.from('supplier_product_attachments').insert({
    supplier_product_id: supplierProductId,
    filename:            file.name,
    storage_path:        storagePath,
    attachment_type:     attachmentType,
    file_size:           file.size,
  })

  if (dbErr) return fail('Erreur lors de l\'enregistrement.')

  revalidatePath(`/supplier/products`)
  return ok
}

// ── Admin: update catalog/attachment status ────────────────────────────────────

export async function updateCatalogStatus(
  catalogId: string,
  status: AttachmentAdminStatus,
  notes?: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const { error: dbErr } = await supabase
    .from('supplier_catalogs')
    .update({ admin_status: status, admin_notes: notes ?? null })
    .eq('id', catalogId)

  if (dbErr) return fail('Erreur.')
  revalidatePath('/admin/samples')
  return ok
}

export async function updateAttachmentStatus(
  attachmentId: string,
  status: AttachmentAdminStatus,
  notes?: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const { error: dbErr } = await supabase
    .from('supplier_product_attachments')
    .update({ admin_status: status, admin_notes: notes ?? null })
    .eq('id', attachmentId)

  if (dbErr) return fail('Erreur.')
  revalidatePath('/admin/samples')
  return ok
}
