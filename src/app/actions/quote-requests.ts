'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from './_guards'
import { getWholesaleTier } from '@/lib/utils'
import type { QuoteRequest, Product, QuoteRequestStatus } from '@/types/database'

export type QuoteRequestFormState = { error: string | null; success?: boolean }
export type ConvertQuoteFormState = { error: string | null }

// ─── Submit quote request (wholesaler) ────────────────────────────────────────

export async function submitQuoteRequest(
  _prev: QuoteRequestFormState,
  formData: FormData,
): Promise<QuoteRequestFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const quantity = parseInt(formData.get('quantity_requested') as string, 10)
  if (!quantity || quantity < 1) return { error: 'Quantité invalide.' }

  const destination_country = (formData.get('destination_country') as string)?.trim()
  if (!destination_country) return { error: 'Pays de destination requis.' }

  const whatsapp_number = (formData.get('whatsapp_number') as string)?.trim()
  if (!whatsapp_number) return { error: 'Numéro WhatsApp requis.' }

  const product_id = (formData.get('product_id') as string)?.trim()
  if (!product_id) return { error: 'Produit manquant.' }

  const { error } = await supabase.from('quote_requests').insert({
    buyer_id: user.id,
    product_id,
    quantity_requested: quantity,
    destination_country,
    destination_city: (formData.get('destination_city') as string)?.trim() || null,
    preferred_shipping_mode: (formData.get('preferred_shipping_mode') as string)?.trim() || null,
    colors_or_variants: (formData.get('colors_or_variants') as string)?.trim() || null,
    sizes: (formData.get('sizes') as string)?.trim() || null,
    buyer_notes: (formData.get('buyer_notes') as string)?.trim() || null,
    whatsapp_number,
  })

  if (error) return { error: error.message }

  revalidatePath('/wholesale/quote-requests')
  return { error: null, success: true }
}

// ─── Update quote request status (admin) ──────────────────────────────────────

export async function updateQuoteRequestStatus(
  requestId: string,
  status: QuoteRequestStatus,
  adminNotes: string | undefined,
  adminNotesPublic: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { success: false, error: error ?? 'Erreur.' }

  const update: Record<string, unknown> = { status, admin_notes_public: adminNotesPublic }
  if (adminNotes !== undefined) update.admin_notes = adminNotes || null

  const { error: dbError } = await supabase
    .from('quote_requests')
    .update(update)
    .eq('id', requestId)

  if (dbError) return { success: false, error: dbError.message }

  revalidatePath('/admin/quote-requests')
  revalidatePath(`/admin/quote-requests/${requestId}`)
  revalidatePath('/wholesale/quote-requests')
  return { success: true }
}

// ─── Convert approved quote to wholesale order (admin) ────────────────────────

type QuoteWithProduct = QuoteRequest & {
  product: Pick<Product, 'id' | 'name' | 'wholesale_tiers' | 'wholesale_min_qty'>
}

export async function convertQuoteToOrder(
  _prev: ConvertQuoteFormState,
  formData: FormData,
): Promise<ConvertQuoteFormState> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Erreur.' }

  const requestId = (formData.get('request_id') as string)?.trim()
  if (!requestId) return { error: 'Identifiant manquant.' }

  const { data: raw } = await supabase
    .from('quote_requests')
    .select('*, product:products!product_id(id,name,wholesale_tiers,wholesale_min_qty)')
    .eq('id', requestId)
    .single()

  const quote = raw as unknown as QuoteWithProduct | null
  if (!quote) return { error: 'Demande introuvable.' }
  if (quote.status !== 'approved') return { error: 'La demande doit être approuvée avant conversion.' }

  const tier = getWholesaleTier(quote.product.wholesale_tiers ?? [], quote.quantity_requested)
  const unitPrice = tier?.price_per_unit ?? 0
  const tierLabel = tier?.label ?? 'Prix à définir'
  const subtotal = parseFloat((unitPrice * quote.quantity_requested).toFixed(2))

  const { data: newOrder, error: orderErr } = (await supabase
    .from('wholesale_orders')
    .insert({
      buyer_id:            quote.buyer_id,
      status:              'pending',
      delivery_preference: 'delivery',
      city:                quote.destination_city ?? null,
      address:             quote.destination_country,
      buyer_notes:         quote.buyer_notes ?? null,
      total_amount:        subtotal,
      delivery_cost:       0,
      quote_request_id:    requestId,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (orderErr || !newOrder) {
    const msg = (orderErr as { message?: string } | null)?.message
    return { error: msg ?? 'Erreur lors de la création de la commande.' }
  }

  const { error: itemErr } = await supabase.from('wholesale_order_items').insert({
    order_id:            newOrder.id,
    product_id:          quote.product_id,
    quantity:            quote.quantity_requested,
    unit_price_snapshot: unitPrice,
    subtotal,
    tier_label_snapshot: tierLabel,
  })

  if (itemErr) {
    await supabase.from('wholesale_orders').delete().eq('id', newOrder.id)
    return { error: itemErr.message }
  }

  await supabase
    .from('quote_requests')
    .update({ status: 'converted_to_order' })
    .eq('id', requestId)

  revalidatePath('/admin/quote-requests')
  revalidatePath(`/admin/quote-requests/${requestId}`)
  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${newOrder.id}`)
  revalidatePath('/wholesale/quote-requests')
  revalidatePath(`/wholesale/quote-requests/${requestId}`)
  revalidatePath(`/wholesale/orders/${newOrder.id}`)

  redirect(`/admin/wholesale-orders/${newOrder.id}`)
}
