'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { parseCsvText } from '@/lib/bulk-import'
import { MAX_CSV_BYTES, looksLikeBinary } from '@/lib/csv-sanitize'
import { resolveSupplierCurrency, composePricing } from '@/lib/supplier-pricing'
import { getRateToMad } from '@/lib/fx'
import { fetchImageFromUrl } from '@/lib/image-fetch'
import {
  moderateSupplierProduct,
  validateSupplierProductReadyForApproval,
} from '@/lib/supplier-product-moderation'
import { requireAdmin } from './_guards'

const BUCKET = 'supplier-product-images'
const MAX_PHOTOS_PER_ROW = 5

/** Domaines d'images autorisés pour le re-hébergement CSV (allowlist). Vide → aucune URL externe. */
function allowedImageHosts(): string[] {
  return (process.env.CSV_IMAGE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Re-héberge des URLs d'images (anti-SSRF + magic bytes) dans notre bucket. URLs invalides ignorées. */
async function rehostPhotos(admin: AdminClient, supplierId: string, urls: string[]): Promise<string[]> {
  const hosts = allowedImageHosts()
  const out: string[] = []
  for (const url of urls.slice(0, MAX_PHOTOS_PER_ROW)) {
    const r = await fetchImageFromUrl(url, { allowedHosts: hosts })
    if (!r.ok) continue
    const path = `${supplierId}/csv_${randomUUID()}.${r.ext}`
    const { error } = await admin.storage.from(BUCKET).upload(path, r.bytes, {
      contentType: r.mediaType,
      upsert: false,
    })
    if (error && !/exist|duplicate/i.test(error.message)) continue
    out.push(admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }
  return out
}
import type {
  SupplierProductStatus,
  BulkImportReportRow,
  SupplierProductVariant,
  SupplierProductMoqTier,
  PlatformMarginType,
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

  // Borne taille AVANT lecture (anti-DoS mémoire).
  if (file.size > MAX_CSV_BYTES) return fail(`Fichier trop volumineux (max ${MAX_CSV_BYTES / 1024 / 1024} MB).`)

  const text = await file.text()
  // Vrai type : un .csv contenant du binaire (PNG/ZIP/PDF) est rejeté.
  if (looksLikeBinary(text)) return fail('Fichier invalide (contenu binaire détecté, pas un CSV texte).')

  const { report, rowsValid, rowsInvalid, rowsTotal, fatalError } = parseCsvText(text, filename)
  if (fatalError) return fail(fatalError)

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

  // Re-validation sécurité (le csv_text vient du client).
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) return fail('Fichier trop volumineux.')
  if (looksLikeBinary(csvText)) return fail('Contenu binaire détecté.')

  const { rows, fatalError } = parseCsvText(csvText, filename ?? 'import.csv')
  if (fatalError) return fail(fatalError)

  // Écriture serveur-autoritaire (verrou 055) + conversion devise (comme web/Telegram).
  const admin = createAdminClient()
  const db = admin as unknown as Parameters<typeof resolveSupplierCurrency>[0]

  // Devise du fournisseur (1 résolution pour tout l'import). Pas de pays → BLOQUÉ.
  const currency = await resolveSupplierCurrency(db, user.id)
  if (!currency) {
    return fail("Votre pays n'est pas configuré (il détermine votre devise). Contactez l'administrateur avant d'importer.")
  }
  const rate = await getRateToMad(db, currency)
  const supplier_type = currency === 'MAD' ? 'morocco' : 'international'
  const availability_type = currency === 'MAD' ? 'local_stock' : 'import_on_demand'

  let imported = 0

  for (const row of rows) {
    const pricing = composePricing(currency, rate, row.price_source)
    const photos = await rehostPhotos(admin, user.id, row.photos)

    const { data: product, error: pErr } = await admin
      .from('supplier_products')
      .insert({
        supplier_id:              user.id,
        product_name:             row.product_name,
        category:                 row.category,
        description:              row.description || null,
        min_quantity:             row.moq,
        unit:                     row.unit,
        suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
        source_currency:          pricing.source_currency,
        price_source:             pricing.price_source,
        fx_rate_source_to_mad:    pricing.fx_rate_source_to_mad,
        stock_quantity:           row.stock_quantity,
        origin_country:           row.export_country,
        export_countries:         [row.export_country],
        lead_time_days:           row.lead_time_days,
        photos,
        niche:                    '',
        supplier_type,
        availability_type,
        target_buyer_type:        'wholesaler',
        approval_status:          'pending_review',
        source:                   'bulk_csv',
      })
      .select('id')
      .single()

    if (pErr || !product) continue

    const productId = (product as { id: string }).id

    const mod = moderateSupplierProduct({
      product_name: row.product_name,
      description: row.description,
      photos,
      category: row.category,
      min_quantity: row.moq,
      stock_quantity: row.stock_quantity,
      lead_time_days: row.lead_time_days,
      suggested_wholesale_price_mad: pricing.suggested_wholesale_price_mad,
      supplier_unit_price_usd: null,
      moq_tier_count: row.moq_tiers.length,
    })
    await admin
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
      await admin.from('supplier_product_variants').insert(variantRows)
    }

    if (row.moq_tiers.length > 0) {
      const tierRows: Omit<SupplierProductMoqTier, 'id' | 'created_at'>[] = row.moq_tiers.map((t) => ({
        supplier_product_id: productId,
        min_quantity:        t.min_quantity,
        unit_price_usd:      t.unit_price_usd,
      }))
      await admin.from('supplier_product_moq_tiers').insert(tierRows)
    }

    imported++
  }

  await admin
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

  const { data: rows, error: fetchErr } = await supabase
    .from('supplier_products')
    .select(
      'id, product_name, public_name, min_quantity, suggested_wholesale_price_mad, supplier_unit_price_usd, stock_quantity, lead_time_days, platform_margin_type, platform_margin_value, supplier_product_moq_tiers(id)',
    )
    .in('id', ids)

  if (fetchErr) return fail('Impossible de charger les produits sélectionnés.')

  type Row = {
    id: string
    product_name: string
    public_name: string | null
    min_quantity: number
    suggested_wholesale_price_mad: number | null
    supplier_unit_price_usd: number | null
    stock_quantity: number | null
    lead_time_days: number | null
    platform_margin_type: string | null
    platform_margin_value: number | null
    supplier_product_moq_tiers: { id: string }[] | null
  }

  const toApprove: string[] = []
  const skipped: string[] = []

  for (const row of (rows ?? []) as Row[]) {
    const check = validateSupplierProductReadyForApproval({
      public_name: row.public_name,
      min_quantity: row.min_quantity,
      suggested_wholesale_price_mad: row.suggested_wholesale_price_mad,
      supplier_unit_price_usd: row.supplier_unit_price_usd,
      stock_quantity: row.stock_quantity,
      lead_time_days: row.lead_time_days,
      platform_margin_type: row.platform_margin_type as PlatformMarginType | null,
      platform_margin_value: row.platform_margin_value,
      moq_tier_count: row.supplier_product_moq_tiers?.length ?? 0,
    })

    if (check.ok) {
      toApprove.push(row.id)
      continue
    }

    skipped.push(`${row.product_name}: ${check.reason}`)
    await supabase
      .from('supplier_products')
      .update({
        moderation_flag: 'review_required',
        moderation_reason: check.reason,
      })
      .eq('id', row.id)
  }

  if (toApprove.length > 0) {
    const { error: dbErr } = await supabase
      .from('supplier_products')
      .update({
        approval_status: 'approved' as SupplierProductStatus,
        moderation_flag: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejected_at: null,
        archived_at: null,
      })
      .in('id', toApprove)

    if (dbErr) return fail('Erreur lors de l\'approbation.')
    revalidatePath('/wholesale/marketplace')
  }

  revalidatePath('/admin/supplier-products')

  if (toApprove.length === 0) {
    return fail(
      skipped.length > 0
        ? `Aucun produit approuvé. ${skipped.join(' ')}`
        : 'Aucun produit trouvé.',
    )
  }

  if (skipped.length > 0) {
    return {
      error: `${toApprove.length} approuvé(s). Non approuvés : ${skipped.join(' ')}`,
      success: true,
    }
  }

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
