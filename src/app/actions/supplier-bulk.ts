'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseCsvText } from '@/lib/bulk-import'
import { moderateSupplierProduct } from '@/lib/supplier-product-moderation'
import { requireAdmin } from './_guards'
import type {
  SupplierProductStatus,
  BulkImportReportRow,
  SupplierProductVariant,
  SupplierProductMoqTier,
} from '@/types/database'

type ActionResult = { error: string | null; success: boolean; importId?: string }
const ok = (importId?: string): ActionResult => ({ error: null, success: true, importId })
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

// ─── Supplier: validate CSV upload ────────────────────────────────────────────

export async function validateBulkImport(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult & { report?: BulkImportReportRow[]; rowsValid?: number; rowsInvalid?: number; rowsTotal?: number; importId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const file = formData.get('file') as File | null
  if (!file) return fail('Fichier requis.')

  const filename = file.name
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext !== 'csv') return fail('Seuls les fichiers CSV sont supportés. Convertissez votre XLSX en CSV avant import.')

  const text = await file.text()
  const { report, rowsValid, rowsInvalid, rowsTotal } = parseCsvText(text, filename)

  const { data: importRow, error: insErr } = await supabase
    .from('supplier_bulk_imports')
    .insert({
      supplier_id:   user.id,
      filename,
      rows_total:    rowsTotal,
      rows_valid:    rowsValid,
      rows_invalid:  rowsInvalid,
      rows_imported: 0,
      status:        'validated',
      report:        report as unknown as never,
    })
    .select('id')
    .single()

  if (insErr || !importRow) return fail('Erreur lors de la sauvegarde du rapport.')

  revalidatePath('/supplier/products/import')

  return {
    error: null,
    success: true,
    importId: (importRow as { id: string }).id,
    report,
    rowsValid,
    rowsInvalid,
    rowsTotal,
  }
}

// ─── Supplier: publish validated rows ─────────────────────────────────────────

export async function publishBulkImport(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const importId  = formData.get('import_id') as string
  const csvText   = formData.get('csv_text') as string
  const filename  = formData.get('filename') as string

  if (!importId || !csvText) return fail('Données manquantes.')

  const { rows } = parseCsvText(csvText, filename ?? 'import.csv')

  let imported = 0

  for (const row of rows) {
    const { data: product, error: pErr } = await supabase
      .from('supplier_products')
      .insert({
        supplier_id:              user.id,
        product_name:             row.product_name,
        category:                 row.category,
        description:              row.description || null,
        min_quantity:             row.moq,
        unit:                     row.unit,
        supplier_unit_price_usd:  row.supplier_unit_price_usd,
        stock_quantity:           row.stock_quantity,
        origin_country:           row.export_country,
        export_countries:         [row.export_country],
        lead_time_days:           row.lead_time_days,
        photos:                   row.photos,
        niche:                    '',
        supplier_type:            'international',
        availability_type:        'import_on_demand',
        target_buyer_type:        'wholesaler',
        approval_status:          'pending_review',
      })
      .select('id')
      .single()

    if (pErr || !product) continue

    const productId = (product as { id: string }).id

    const mod = moderateSupplierProduct({
      product_name: row.product_name,
      description: row.description,
      photos: row.photos,
      category: row.category,
      min_quantity: row.moq,
      stock_quantity: row.stock_quantity,
      lead_time_days: row.lead_time_days,
      suggested_wholesale_price_mad: null,
      supplier_unit_price_usd: row.supplier_unit_price_usd,
      moq_tier_count: row.moq_tiers.length,
    })
    await supabase
      .from('supplier_products')
      .update({
        moderation_flag: mod.moderation_flag,
        ai_risk_score: mod.ai_risk_score,
        moderation_reason: mod.moderation_reason,
        moderation_signals: mod.moderation_signals,
      })
      .eq('id', productId)

    if (row.variants.length > 0) {
      const variantRows: Omit<SupplierProductVariant, 'id' | 'created_at'>[] = row.variants.map((v) => ({
        supplier_product_id: productId,
        color: v.color ?? null,
        size:  v.size  ?? null,
        model: v.model ?? null,
        stock_quantity:      null,
        price_adjustment_usd: 0,
      }))
      await supabase.from('supplier_product_variants').insert(variantRows)
    }

    if (row.moq_tiers.length > 0) {
      const tierRows: Omit<SupplierProductMoqTier, 'id' | 'created_at'>[] = row.moq_tiers.map((t) => ({
        supplier_product_id: productId,
        min_quantity:        t.min_quantity,
        unit_price_usd:      t.unit_price_usd,
      }))
      await supabase.from('supplier_product_moq_tiers').insert(tierRows)
    }

    imported++
  }

  await supabase
    .from('supplier_bulk_imports')
    .update({ status: 'imported', rows_imported: imported })
    .eq('id', importId)

  revalidatePath('/supplier/products')
  revalidatePath('/supplier/products/import')

  return ok(importId)
}

// ─── Admin: bulk approve ──────────────────────────────────────────────────────

export async function bulkApproveProducts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const ids = (formData.get('product_ids') as string ?? '').split(',').filter(Boolean)
  if (ids.length === 0) return fail('Aucun produit sélectionné.')

  const { error: dbErr } = await supabase
    .from('supplier_products')
    .update({
      approval_status: 'approved' as SupplierProductStatus,
      moderation_flag: 'approved',
      approved_by:     userId,
      approved_at:     new Date().toISOString(),
      rejected_at:     null,
      archived_at:     null,
    })
    .in('id', ids)

  if (dbErr) return fail('Erreur lors de l\'approbation.')

  revalidatePath('/admin/supplier-products')
  return ok()
}

// ─── Admin: bulk reject ───────────────────────────────────────────────────────

export async function bulkRejectProducts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const ids = (formData.get('product_ids') as string ?? '').split(',').filter(Boolean)
  if (ids.length === 0) return fail('Aucun produit sélectionné.')

  const { error: dbErr } = await supabase
    .from('supplier_products')
    .update({
      approval_status: 'blocked' as SupplierProductStatus,
      moderation_flag: 'blocked',
      rejected_at:     new Date().toISOString(),
      approved_at:     null,
      approved_by:     null,
    })
    .in('id', ids)

  if (dbErr) return fail('Erreur lors du rejet.')

  revalidatePath('/admin/supplier-products')
  return ok()
}

// ─── Admin: bulk archive ──────────────────────────────────────────────────────

export async function bulkArchiveProducts(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const ids = (formData.get('product_ids') as string ?? '').split(',').filter(Boolean)
  if (ids.length === 0) return fail('Aucun produit sélectionné.')

  const { error: dbErr } = await supabase
    .from('supplier_products')
    .update({ archived_at: new Date().toISOString() })
    .in('id', ids)

  if (dbErr) return fail('Erreur lors de l\'archivage.')

  revalidatePath('/admin/supplier-products')
  return ok()
}
