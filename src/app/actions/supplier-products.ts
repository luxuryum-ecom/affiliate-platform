'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type {
  SupplierProduct,
  SupplierProductStatus,
  SupplierProductMoqTier,
  PlatformMarginType,
  SupplierType,
} from '@/types/database'
import { isBuyerPurchaseProfile, isBuyerVolumeTier } from '@/lib/rfq-buyer-intake'
import { moderateSupplierProduct, type ModerationInput } from '@/lib/supplier-product-moderation'

export type SupplierProductState = { error: string | null; success?: boolean }

function parseMoqTiersFromForm(formData: FormData): Array<{ min_quantity: number; unit_price_usd: number }> {
  const tiers: Array<{ min_quantity: number; unit_price_usd: number }> = []
  for (let i = 1; i <= 4; i++) {
    const qty = parseInt(formData.get(`tier_${i}_qty`) as string, 10)
    const price = parseFloat(formData.get(`tier_${i}_price`) as string)
    if (!isNaN(qty) && qty > 0 && !isNaN(price) && price > 0) {
      tiers.push({ min_quantity: qty, unit_price_usd: price })
    }
  }
  return tiers.sort((a, b) => a.min_quantity - b.min_quantity)
}

async function runAndStoreModeration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  input: ModerationInput
) {
  const result = moderateSupplierProduct(input)
  await supabase
    .from('supplier_products')
    .update({
      moderation_flag: result.moderation_flag,
      ai_risk_score: result.ai_risk_score,
      moderation_reason: result.moderation_reason,
      moderation_signals: result.moderation_signals,
    })
    .eq('id', productId)
}

// ── Supplier: submit a new product ────────────────────────────────────────────

export async function submitSupplierProduct(
  _prevState: SupplierProductState,
  formData: FormData
): Promise<SupplierProductState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const product_name = (formData.get('product_name') as string)?.trim()
  const category = (formData.get('category') as string)?.trim() ?? ''
  const niche = (formData.get('niche') as string)?.trim() ?? ''
  const description = (formData.get('description') as string)?.trim() || null
  const photosRaw = (formData.get('photos') as string)?.trim() || ''
  const photos = photosRaw ? photosRaw.split('\n').map((u) => u.trim()).filter(Boolean) : []
  const min_quantity = parseInt(formData.get('min_quantity') as string, 10) || 1
  const origin_country = (formData.get('origin_country') as string)?.trim() ?? ''
  const supplier_type = (formData.get('supplier_type') as string) || 'morocco'
  const availability_type = (formData.get('availability_type') as string) || 'local_stock'
  const target_buyer_type = (formData.get('target_buyer_type') as string) || 'wholesaler'
  const suggested_price = parseFloat(formData.get('suggested_wholesale_price_mad') as string)
  const supplier_private_notes = (formData.get('supplier_private_notes') as string)?.trim() || null
  const stockRaw = parseInt(formData.get('stock_quantity') as string, 10)
  const leadRaw = parseInt(formData.get('lead_time_days') as string, 10)
  const moqTiers = parseMoqTiersFromForm(formData)

  if (!product_name) return { error: 'Le nom du produit est requis.' }
  if (!origin_country) return { error: "Le pays d'origine est requis." }

  const { data: product, error } = await supabase
    .from('supplier_products')
    .insert({
      supplier_id: user.id,
      supplier_type: supplier_type as SupplierType,
      product_name,
      category,
      niche,
      description,
      photos,
      min_quantity,
      origin_country,
      availability_type: availability_type as SupplierProduct['availability_type'],
      target_buyer_type: target_buyer_type as SupplierProduct['target_buyer_type'],
      suggested_wholesale_price_mad: isNaN(suggested_price) ? null : suggested_price,
      supplier_private_notes,
      approval_status: 'pending_review' as SupplierProductStatus,
      stock_quantity: isNaN(stockRaw) ? null : stockRaw,
      lead_time_days: isNaN(leadRaw) ? null : leadRaw,
    })
    .select('id')
    .single()

  if (error || !product) return { error: error?.message ?? 'Erreur lors de la soumission.' }

  const productId = (product as { id: string }).id

  if (moqTiers.length > 0) {
    const tierRows: Omit<SupplierProductMoqTier, 'id' | 'created_at'>[] = moqTiers.map((t) => ({
      supplier_product_id: productId,
      min_quantity: t.min_quantity,
      unit_price_usd: t.unit_price_usd,
    }))
    const { error: tierErr } = await supabase.from('supplier_product_moq_tiers').insert(tierRows)
    if (tierErr) return { error: tierErr.message }
  }

  await runAndStoreModeration(supabase, productId, {
    product_name,
    description,
    photos,
    category,
    min_quantity,
    stock_quantity: isNaN(stockRaw) ? null : stockRaw,
    lead_time_days: isNaN(leadRaw) ? null : leadRaw,
    suggested_wholesale_price_mad: isNaN(suggested_price) ? null : suggested_price,
    supplier_unit_price_usd: null,
    moq_tier_count: moqTiers.length,
  })

  redirect('/supplier/products')
}

// ── Admin: approve a supplier product ─────────────────────────────────────────

export async function approveSupplierProduct(
  _prevState: SupplierProductState,
  formData: FormData
): Promise<SupplierProductState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Non authentifié.' }

  const id = formData.get('id') as string
  const public_name = (formData.get('public_name') as string)?.trim() || null
  const public_description = (formData.get('public_description') as string)?.trim() || null
  const platform_margin_type = (formData.get('platform_margin_type') as string) || 'percentage'
  const platform_margin_value = parseFloat(formData.get('platform_margin_value') as string)
  const admin_notes = (formData.get('admin_notes') as string)?.trim() || null

  const { error } = await supabase
    .from('supplier_products')
    .update({
      approval_status: 'approved' as SupplierProductStatus,
      moderation_flag: 'approved',
      public_name,
      public_description,
      platform_margin_type: platform_margin_type as PlatformMarginType,
      platform_margin_value: isNaN(platform_margin_value) ? null : platform_margin_value,
      admin_notes,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejected_at: null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/supplier-products')
  revalidatePath(`/admin/supplier-products/${id}`)
  revalidatePath('/wholesale/marketplace')
  return { error: null, success: true }
}

// ── Admin: reject a supplier product ──────────────────────────────────────────

export async function rejectSupplierProduct(
  _prevState: SupplierProductState,
  formData: FormData
): Promise<SupplierProductState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Non authentifié.' }

  const id = formData.get('id') as string
  const admin_notes = (formData.get('admin_notes') as string)?.trim() || null

  const { error } = await supabase
    .from('supplier_products')
    .update({
      approval_status: 'blocked' as SupplierProductStatus,
      moderation_flag: 'blocked',
      admin_notes,
      rejected_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/supplier-products')
  revalidatePath(`/admin/supplier-products/${id}`)
  return { error: null, success: true }
}

// ── Wholesaler: request a quote for a supplier marketplace product ─────────────

export async function requestSupplierProductQuote(
  _prevState: SupplierProductState,
  formData: FormData
): Promise<SupplierProductState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const supplier_product_id = formData.get('supplier_product_id') as string
  const quantity_requested = parseInt(formData.get('quantity_requested') as string, 10)
  const destination_country = (formData.get('destination_country') as string)?.trim() || 'Maroc'
  const destination_city = (formData.get('destination_city') as string)?.trim() || null
  const buyer_notes = (formData.get('buyer_notes') as string)?.trim() || null
  const whatsapp_number = (formData.get('whatsapp_number') as string)?.trim() || ''
  const buyer_purchase_profile = (formData.get('buyer_purchase_profile') as string)?.trim() || ''
  const buyer_volume_tier = (formData.get('buyer_volume_tier') as string)?.trim() || ''

  if (!supplier_product_id) return { error: 'Produit introuvable.' }
  if (!quantity_requested || quantity_requested < 1) return { error: 'Quantité invalide.' }
  if (!isBuyerPurchaseProfile(buyer_purchase_profile)) {
    return { error: 'Sélectionnez votre profil d\'achat.' }
  }
  if (!isBuyerVolumeTier(buyer_volume_tier)) {
    return { error: 'Sélectionnez un volume estimé.' }
  }
  if (!whatsapp_number) return { error: 'Numéro WhatsApp requis.' }

  const { error } = await supabase.from('supplier_quote_requests').insert({
    supplier_product_id,
    buyer_id: user.id,
    quantity_requested,
    buyer_purchase_profile,
    buyer_volume_tier,
    destination_country,
    destination_city,
    buyer_notes,
    whatsapp_number,
  })

  if (error) return { error: error.message }
  return { error: null, success: true }
}
