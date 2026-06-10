'use server'

import { isValidMediaUrl } from '@/lib/product-media'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from './_guards'
import type {
  WholesaleTier,
  ProductSubmittedVia,
  ProductApprovalStatus,
  ProductAvailabilityType,
  ProductOriginDetail,
  PlatformMarginType,
  MediaItem,
  ImportPricingMode,
  ImportPriceUnit,
  TariffMode,
  ImportShippingMode,
} from '@/types/database'

function shippingModeToUnit(mode: ImportShippingMode | null): ImportPriceUnit {
  return mode === 'sea_volume_cbm' ? 'cbm' : 'kg'
}
import { calculatePlatformPrice, calculateNetAffiliateCommission } from '@/lib/utils'
import { getRateToMad } from '@/lib/fx'

export type ProductFormState = { error: string | null }

// ─── Upsert (create or update) ────────────────────────────────────────────────

/**
 * Create or update a product.
 * Pass a hidden `id` field to update; omit it to create.
 *
 * Business rules applied here:
 *  1. purchase_price_mad = local → purchase_price; imported → price × exchange_rate
 *  2. calculated_sale_price_mad = purchase_price_mad × (1 + margin / 100)
 *  3. active is forced to false whenever approval_status !== 'approved'
 *  4. approved_by and approved_at are auto-set when status flips to 'approved'
 *  5. submitted_by is set to the current user on create; preserved on update
 */
export async function upsertProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Erreur.' }

  // ── Basic fields ──────────────────────────────────────────────────────────

  const id = (formData.get('id') as string) || null
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string)?.trim()) || null

  // ── Availability (migration 007) ──────────────────────────────────────────

  const availability_type = (formData.get('availability_type') as string) || 'local_stock'
  const origin_detail_raw = (formData.get('origin_detail') as string) || null
  // import_on_demand has no local origin detail
  const origin_detail: string | null =
    availability_type === 'import_on_demand' ? null : origin_detail_raw

  // affiliate_enabled is forced false for import_on_demand
  const affiliate_enabled_raw = formData.get('affiliate_enabled') === 'on'
  const affiliate_enabled = availability_type === 'import_on_demand' ? false : affiliate_enabled_raw

  // ── Sourcing ──────────────────────────────────────────────────────────────

  const supplier_name = ((formData.get('supplier_name') as string)?.trim()) || null
  const origin_country = ((formData.get('origin_country') as string)?.trim()) || null
  const source_notes = ((formData.get('source_notes') as string)?.trim()) || null
  const submitted_via = (formData.get('submitted_via') as string) || 'admin_dashboard'

  // ── Cost & margin ─────────────────────────────────────────────────────────

  const purchase_price_raw = formData.get('purchase_price') as string
  const purchase_price = purchase_price_raw ? parseFloat(purchase_price_raw) : null

  const purchase_currency = (formData.get('purchase_currency') as string) || 'MAD'
  // Réconciliation Étape 2 : exchange_rate_to_mad devient un OVERRIDE manuel.
  // S'il est fourni (> 0) on le respecte ; sinon, pour une devise ≠ MAD on prend le
  // taux central (current_exchange_rates) ; MAD ⇒ 1. Le calcul aval est inchangé.
  const exchange_rate_raw = formData.get('exchange_rate_to_mad') as string
  const exchange_rate_explicit =
    exchange_rate_raw && !isNaN(parseFloat(exchange_rate_raw)) ? parseFloat(exchange_rate_raw) : null
  const exchange_rate_to_mad =
    exchange_rate_explicit !== null && exchange_rate_explicit > 0
      ? exchange_rate_explicit
      : purchase_currency !== 'MAD'
        ? (await getRateToMad(supabase, purchase_currency)) ?? 1
        : 1

  // platform_margin_type: 'percentage' | 'fixed'
  // Accept both the new field name and legacy 'margin_percentage' form field.
  const platform_margin_type = (
    (formData.get('platform_margin_type') as string) || 'percentage'
  ) as PlatformMarginType

  // platform_margin_value: preferred new field; fall back to legacy margin_percentage
  const margin_value_raw =
    formData.get('platform_margin_value') ?? formData.get('margin_percentage')
  const platform_margin_value = parseFloat(margin_value_raw as string) || 30

  // Keep margin_percentage in sync for backward compat with any legacy reads
  const margin_percentage = platform_margin_type === 'percentage' ? platform_margin_value : 0

  const confirmation_fee_mad = parseFloat(formData.get('confirmation_fee_mad') as string) || 10
  const packaging_fee_mad = parseFloat(formData.get('packaging_fee_mad') as string) || 10
  const delivery_fee_mad = parseFloat(formData.get('delivery_fee_mad') as string) || 0

  // ── Computed pricing ──────────────────────────────────────────────────────
  // locally_produced → price is already in MAD
  // imported_but_in_morocco_stock | import_on_demand → price needs conversion

  const needsConversion =
    origin_detail === 'imported_but_in_morocco_stock' ||
    availability_type === 'import_on_demand'

  let purchase_price_mad: number | null = null
  let calculated_sale_price_mad: number | null = null

  if (purchase_price !== null && !isNaN(purchase_price)) {
    purchase_price_mad = needsConversion
      ? parseFloat((purchase_price * exchange_rate_to_mad).toFixed(2))
      : purchase_price

    calculated_sale_price_mad = calculatePlatformPrice(
      purchase_price_mad,
      platform_margin_type,
      platform_margin_value
    )
  }

  // ── Factory cost (migration 016) — explicit MAD cost set by admin ────────

  const factory_cost_mad_raw = formData.get('factory_cost_mad') as string
  // Fall back to computed purchase_price_mad when not explicitly set
  const factory_cost_mad: number | null =
    factory_cost_mad_raw && !isNaN(parseFloat(factory_cost_mad_raw))
      ? parseFloat(factory_cost_mad_raw)
      : purchase_price_mad

  // ── Sales fields ──────────────────────────────────────────────────────────

  const sell_price = parseFloat(formData.get('sell_price') as string)
  const wholesale_min_qty = parseInt(formData.get('wholesale_min_qty') as string) || 1
  const stock_count = parseInt(formData.get('stock_count') as string) || 0

  // ── Auto-compute commission from cost formula ─────────────────────────────
  // commission = sell_price − factory_cost − platform_margin − delivery_fee − confirmation_fee − packaging_fee
  // Returns 0 when affiliate is disabled or factory_cost_mad is not set yet.

  const commission_amount: number = (() => {
    if (!affiliate_enabled || factory_cost_mad === null) return 0
    const raw = calculateNetAffiliateCommission({
      affiliateSellPrice: sell_price,
      factoryCostMad: factory_cost_mad,
      marginType: platform_margin_type,
      marginValue: platform_margin_value,
      packagingFee: packaging_fee_mad,
      deliveryFee: delivery_fee_mad,
      confirmationFee: confirmation_fee_mad,
      quantity: 1,
    })
    return Math.max(0, raw)
  })()

  // ── Import-on-demand display fields (migrations 019 + 020) ──────────────
  // Only stored when availability_type = 'import_on_demand'; cleared otherwise.

  const estimated_delivery_days_raw = formData.get('estimated_delivery_days') as string
  const estimated_delivery_days: number | null =
    availability_type === 'import_on_demand' && estimated_delivery_days_raw
      ? parseInt(estimated_delivery_days_raw) || null
      : null

  // ── Tariff mode (migration 021) ───────────────────────────────────────────
  const tariff_mode_raw = (formData.get('tariff_mode') as string) || 'global'
  const tariff_mode: TariffMode =
    availability_type === 'import_on_demand' &&
    (tariff_mode_raw === 'global' || tariff_mode_raw === 'custom')
      ? tariff_mode_raw
      : 'global'

  // ── Import shipping mode (migration 022) — must be declared before import_price_unit ──
  const import_shipping_mode_raw = (formData.get('import_shipping_mode') as string) || null
  const import_shipping_mode: ImportShippingMode | null =
    availability_type === 'import_on_demand' &&
    import_shipping_mode_raw !== null &&
    ['air_door_to_door_kg', 'sea_textile_kg', 'sea_volume_cbm'].includes(import_shipping_mode_raw)
      ? (import_shipping_mode_raw as ImportShippingMode)
      : null

  // ── Migration 020 — import cost model (legacy fields kept for backward compat) ──
  const estimated_import_price_mad_raw = formData.get('estimated_import_price_mad') as string
  const estimated_import_price_mad: number | null =
    availability_type === 'import_on_demand' && estimated_import_price_mad_raw
      ? parseFloat(estimated_import_price_mad_raw) || null
      : null

  // Unit auto-derived from shipping mode
  const import_price_unit: ImportPriceUnit | null =
    availability_type === 'import_on_demand' && import_shipping_mode !== null
      ? shippingModeToUnit(import_shipping_mode)
      : null

  const import_notes_raw = ((formData.get('import_notes') as string) || '').trim()
  const import_notes: string | null =
    availability_type === 'import_on_demand' && import_notes_raw ? import_notes_raw : null

  // Keep estimated_cost_mad in sync with estimated_import_price_mad for backward compat
  const estimated_cost_mad: number | null = estimated_import_price_mad

  // ── Approval ──────────────────────────────────────────────────────────────

  const approval_status = (formData.get('approval_status') as string) || 'draft'
  const active_raw = formData.get('active') === 'on'

  // Gate: active only allowed when approved
  const active = approval_status === 'approved' ? active_raw : false

  // ── Validation ────────────────────────────────────────────────────────────

  if (!name) return { error: 'Le nom du produit est requis.' }
  if (!['local_stock', 'import_on_demand'].includes(availability_type))
    return { error: 'Type de disponibilité invalide.' }
  if (
    availability_type === 'local_stock' &&
    origin_detail &&
    !['locally_produced', 'imported_but_in_morocco_stock'].includes(origin_detail)
  )
    return { error: "Origine du produit invalide." }
  if (!['draft', 'pending_review', 'approved', 'rejected'].includes(approval_status))
    return { error: "Statut d'approbation invalide." }
  if (!['admin_dashboard', 'telegram_future', 'supplier_future'].includes(submitted_via))
    return { error: 'Canal de soumission invalide.' }
  if (!['MAD', 'USD', 'AED'].includes(purchase_currency))
    return { error: 'Devise invalide. Utilisez MAD, USD ou AED.' }
  if (isNaN(sell_price) || sell_price <= 0)
    return { error: 'Le prix de vente doit être supérieur à 0 MAD.' }
  if (factory_cost_mad !== null && factory_cost_mad < 0)
    return { error: 'Le coût usine ne peut pas être négatif.' }
  if (wholesale_min_qty < 1) return { error: 'La quantité minimale doit être ≥ 1.' }
  if (stock_count < 0) return { error: 'Le stock ne peut pas être négatif.' }
  if (exchange_rate_to_mad <= 0)
    return { error: "Le taux de change doit être supérieur à 0." }
  if (!['percentage', 'fixed'].includes(platform_margin_type))
    return { error: 'Type de marge invalide. Utilisez percentage ou fixed.' }
  if (platform_margin_value < 0) return { error: 'La marge ne peut pas être négative.' }
  if (margin_percentage < 0) return { error: 'La marge ne peut pas être négative.' }

  // ── Parse JSON fields ─────────────────────────────────────────────────────

  let wholesale_tiers: WholesaleTier[] = []
  try {
    wholesale_tiers = JSON.parse((formData.get('wholesale_tiers') as string) || '[]')
  } catch {
    return { error: 'Format des paliers de prix invalide.' }
  }

  // media — new JSONB array [{url, type}]
  let media: MediaItem[] = []
  try {
    const parsed = JSON.parse((formData.get('media') as string) || '[]') as MediaItem[]
    media = parsed.filter((m) => {
      if (!m?.url?.trim()) return false
      return isValidMediaUrl(m.url)
    })
  } catch {
    media = []
  }

  // legacy images — derive from media for backward compat with any pages still using images[]
  const images = media.filter((m) => m.type === 'image').map((m) => m.url)

  // ── Build payload ─────────────────────────────────────────────────────────

  const now = new Date().toISOString()

  const base = {
    name,
    description,
    availability_type: availability_type as ProductAvailabilityType,
    origin_detail: origin_detail as ProductOriginDetail | null,
    affiliate_enabled,
    supplier_name,
    origin_country,
    submitted_via: submitted_via as ProductSubmittedVia,
    source_notes,
    purchase_price,
    purchase_currency,
    exchange_rate_to_mad,
    purchase_price_mad,
    margin_percentage,
    calculated_sale_price_mad,
    platform_margin_type,
    platform_margin_value,
    factory_cost_mad,
    confirmation_fee_mad,
    packaging_fee_mad,
    delivery_fee_mad,
    approval_status: approval_status as ProductApprovalStatus,
    active,
    sell_price,
    commission_amount,
    wholesale_min_qty,
    wholesale_tiers,
    stock_count,
    media,
    images,
    estimated_cost_mad: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_cost_mad,
    estimated_delivery_days: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_delivery_days,
    import_pricing_mode: null as ImportPricingMode | null,
    estimated_import_price_mad: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : estimated_import_price_mad,
    import_price_unit: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : import_price_unit,
    import_notes: tariff_mode === 'global' && availability_type === 'import_on_demand' ? null : import_notes,
    tariff_mode,
    import_shipping_mode: availability_type === 'import_on_demand' ? import_shipping_mode : null,
  }

  if (id) {
    // ── Update ──────────────────────────────────────────────────────────────

    // Fetch current record to check previous approval_status
    const { data: existing } = await supabase
      .from('products')
      .select('approval_status, approved_by, approved_at, submitted_by')
      .eq('id', id)
      .single() as {
        data: {
          approval_status: string
          approved_by: string | null
          approved_at: string | null
          submitted_by: string | null
        } | null
        error: unknown
      }

    const wasApproved = existing?.approval_status === 'approved'
    const isNowApproved = approval_status === 'approved'

    const updatePayload = {
      ...base,
      // Set approved_by/at when transitioning to approved
      approved_by:
        isNowApproved && !wasApproved
          ? userId
          : isNowApproved
          ? (existing?.approved_by ?? userId)
          : null,
      approved_at:
        isNowApproved && !wasApproved
          ? now
          : isNowApproved
          ? (existing?.approved_at ?? now)
          : null,
    }

    const { error } = await supabase.from('products').update(updatePayload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    // ── Create ──────────────────────────────────────────────────────────────

    const insertPayload = {
      ...base,
      submitted_by: userId,
      approved_by: approval_status === 'approved' ? userId : null,
      approved_at: approval_status === 'approved' ? now : null,
    }

    const { error } = await supabase.from('products').insert(insertPayload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}

// ─── Toggle active ────────────────────────────────────────────────────────────

/**
 * Toggle active flag.
 * Refuses to activate a product that is not yet approved.
 */
export async function toggleProductActive(id: string, newActive: boolean): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  if (newActive) {
    // Guard: only allow activation if product is approved
    const { data } = await supabase
      .from('products')
      .select('approval_status')
      .eq('id', id)
      .single() as { data: { approval_status: string } | null; error: unknown }

    if (data?.approval_status !== 'approved') return
  }

  await supabase.from('products').update({ active: newActive }).eq('id', id)
  revalidatePath('/admin/products')
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteProduct(id: string): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase.from('products').delete().eq('id', id)
  revalidatePath('/admin/products')
}
