'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdmin } from './_guards'
import type { SupplierProduct, SupplierProductStatus, PlatformMarginType, SupplierType } from '@/types/database'

export type SupplierProductState = { error: string | null; success?: boolean }

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

  if (!product_name) return { error: 'Le nom du produit est requis.' }
  if (!origin_country) return { error: "Le pays d'origine est requis." }

  const { error } = await supabase.from('supplier_products').insert({
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
  })

  if (error) return { error: error.message }

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
      approval_status: 'rejected' as SupplierProductStatus,
      admin_notes,
      rejected_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
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

  if (!supplier_product_id) return { error: 'Produit introuvable.' }
  if (!quantity_requested || quantity_requested < 1) return { error: 'Quantité invalide.' }
  if (!whatsapp_number) return { error: 'Numéro WhatsApp requis.' }

  const { error } = await supabase.from('supplier_quote_requests').insert({
    supplier_product_id,
    buyer_id: user.id,
    quantity_requested,
    destination_country,
    destination_city,
    buyer_notes,
    whatsapp_number,
  })

  if (error) return { error: error.message }
  return { error: null, success: true }
}
