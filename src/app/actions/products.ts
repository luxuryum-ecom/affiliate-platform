'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
  WholesaleTier,
  ProductSourceType,
  ProductSubmittedVia,
  ProductApprovalStatus,
} from '@/types/database'

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
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  // ── Basic fields ──────────────────────────────────────────────────────────

  const id = (formData.get('id') as string) || null
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string)?.trim()) || null

  // ── Sourcing ──────────────────────────────────────────────────────────────

  const source_type = (formData.get('source_type') as string) || 'local_production'
  const supplier_name = ((formData.get('supplier_name') as string)?.trim()) || null
  const origin_country = ((formData.get('origin_country') as string)?.trim()) || null
  const source_notes = ((formData.get('source_notes') as string)?.trim()) || null
  const submitted_via = (formData.get('submitted_via') as string) || 'admin_dashboard'

  // ── Cost & margin ─────────────────────────────────────────────────────────

  const purchase_price_raw = formData.get('purchase_price') as string
  const purchase_price = purchase_price_raw ? parseFloat(purchase_price_raw) : null

  const purchase_currency = (formData.get('purchase_currency') as string) || 'MAD'
  const exchange_rate_to_mad = parseFloat(formData.get('exchange_rate_to_mad') as string) || 1
  const margin_percentage = parseFloat(formData.get('margin_percentage') as string) || 30

  // ── Computed pricing ──────────────────────────────────────────────────────

  let purchase_price_mad: number | null = null
  let calculated_sale_price_mad: number | null = null

  if (purchase_price !== null && !isNaN(purchase_price)) {
    purchase_price_mad =
      source_type === 'local_production'
        ? purchase_price
        : parseFloat((purchase_price * exchange_rate_to_mad).toFixed(2))

    calculated_sale_price_mad = parseFloat(
      (purchase_price_mad * (1 + margin_percentage / 100)).toFixed(2)
    )
  }

  // ── Sales fields ──────────────────────────────────────────────────────────

  const sell_price = parseFloat(formData.get('sell_price') as string)
  const commission_amount = parseFloat(formData.get('commission_amount') as string) || 0
  const wholesale_min_qty = parseInt(formData.get('wholesale_min_qty') as string) || 1
  const stock_count = parseInt(formData.get('stock_count') as string) || 0

  // ── Approval ──────────────────────────────────────────────────────────────

  const approval_status = (formData.get('approval_status') as string) || 'draft'
  const active_raw = formData.get('active') === 'on'

  // Gate: active only allowed when approved
  const active = approval_status === 'approved' ? active_raw : false

  // ── Validation ────────────────────────────────────────────────────────────

  if (!name) return { error: 'Le nom du produit est requis.' }
  if (!['local_production', 'imported'].includes(source_type))
    return { error: 'Type de source invalide.' }
  if (!['draft', 'pending_review', 'approved', 'rejected'].includes(approval_status))
    return { error: "Statut d'approbation invalide." }
  if (!['admin_dashboard', 'telegram_future', 'supplier_future'].includes(submitted_via))
    return { error: 'Canal de soumission invalide.' }
  if (isNaN(sell_price) || sell_price <= 0)
    return { error: 'Le prix de vente doit être supérieur à 0 MAD.' }
  if (commission_amount < 0) return { error: 'La commission ne peut pas être négative.' }
  if (wholesale_min_qty < 1) return { error: 'La quantité minimale doit être ≥ 1.' }
  if (stock_count < 0) return { error: 'Le stock ne peut pas être négatif.' }
  if (exchange_rate_to_mad <= 0)
    return { error: "Le taux de change doit être supérieur à 0." }
  if (margin_percentage < 0) return { error: 'La marge ne peut pas être négative.' }

  // ── Parse JSON fields ─────────────────────────────────────────────────────

  let wholesale_tiers: WholesaleTier[] = []
  try {
    wholesale_tiers = JSON.parse((formData.get('wholesale_tiers') as string) || '[]')
  } catch {
    return { error: 'Format des paliers de prix invalide.' }
  }

  let images: string[] = []
  try {
    images = (JSON.parse((formData.get('images') as string) || '[]') as string[]).filter(
      (u) => u.trim().length > 0
    )
  } catch {
    images = []
  }

  // ── Build payload ─────────────────────────────────────────────────────────

  const now = new Date().toISOString()

  const base = {
    name,
    description,
    source_type: source_type as ProductSourceType,
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
    approval_status: approval_status as ProductApprovalStatus,
    active,
    sell_price,
    commission_amount,
    wholesale_min_qty,
    wholesale_tiers,
    stock_count,
    images,
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
          ? user.id
          : isNowApproved
          ? (existing?.approved_by ?? user.id)
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
      submitted_by: user.id,
      approved_by: approval_status === 'approved' ? user.id : null,
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
  const supabase = await createClient()

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
  const supabase = await createClient()
  await supabase.from('products').delete().eq('id', id)
  revalidatePath('/admin/products')
}
