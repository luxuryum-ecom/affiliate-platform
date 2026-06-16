'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from './_guards'
import { getRateToMad, getClientCurrency } from '@/lib/fx'
import { parseMoneyInput } from '@/lib/money'
import { parseRateInput } from '@/lib/rate'
import type { QuoteRequest, Product, QuoteRequestStatus } from '@/types/database'

export type QuoteRequestFormState = { error: string | null; success?: boolean }
export type PrepareQuoteFormState = { error: string | null; success?: boolean }
export type ConvertQuoteFormState = { error: string | null }
export type QuoteDecisionFormState = { error: string | null; success?: boolean }

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

// ─── Prepare formal quote document (admin) ────────────────────────────────────

export async function prepareQuote(
  _prev: PrepareQuoteFormState,
  formData: FormData,
): Promise<PrepareQuoteFormState> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Erreur.' }

  const requestId = (formData.get('request_id') as string)?.trim()
  if (!requestId) return { error: 'Identifiant manquant.' }

  // ── Multi-devise : prix marchandise saisi en devise SOURCE → converti en MAD ──
  // Pivot interne = MAD. Le taux (central ou override) est FIGÉ sur le devis.
  const sourceCurrency = (formData.get('source_currency') as string)?.trim().toUpperCase() || 'MAD'
  // PRIX UNITAIRE SOURCE — validé en CHAÎNE décimale stricte (money.ts), chaîne verbatim
  // stockée : zéro parseFloat. Number() dérivé pour la conversion FX (= ancien parseFloat).
  const sourceUnitPriceR = parseMoneyInput(formData.get('quoted_unit_price_source'))
  const sourceUnitPriceStr = sourceUnitPriceR.ok ? sourceUnitPriceR.value : null
  const sourceUnitPrice = sourceUnitPriceR.ok ? Number(sourceUnitPriceR.value) : NaN
  const quantity = parseInt(formData.get('quoted_quantity') as string, 10)
  // RÈGLE ARGENT n°4 — frais de transport (MAD) validés en CHAÎNE décimale stricte
  // (money.ts), passés verbatim à la colonne numeric : zéro parseFloat. Vide ou
  // négatif reste rejeté comme avant (l'ancien `isNaN || < 0`).
  const transportRaw = formData.get('quoted_transport_total_mad')
  const transportStr = typeof transportRaw === 'string' ? transportRaw.trim() : ''
  const transportTotalR = parseMoneyInput(transportStr)

  // TAUX override — validé en CHAÎNE décimale stricte (rate.ts, ≤8 déc, > 0) ; valeur
  // numérique dérivée (Number) pour la résolution fxRate. Vide → null (repli central) ;
  // fourni mais invalide → erreur (comme l'ancien `isNaN || <= 0`).
  const fxOverrideRaw = formData.get('fx_rate_override')
  const fxOverrideStr = typeof fxOverrideRaw === 'string' ? fxOverrideRaw.trim() : ''
  const fxOverrideR = fxOverrideStr !== '' ? parseRateInput(fxOverrideStr) : null
  const fxOverride = fxOverrideR && fxOverrideR.ok ? Number(fxOverrideR.value) : null

  if (isNaN(sourceUnitPrice) || sourceUnitPrice <= 0) return { error: 'Prix unitaire invalide.' }
  if (isNaN(quantity) || quantity < 1) return { error: 'Quantité invalide.' }
  if (transportStr === '' || !transportTotalR.ok) return { error: 'Frais de transport invalides.' }
  if (fxOverrideR !== null && !fxOverrideR.ok) {
    return { error: 'Taux de change override invalide (doit être > 0).' }
  }

  // Résolution du taux source→MAD : MAD=1, sinon override, sinon taux central.
  let fxRate: number
  if (sourceCurrency === 'MAD') {
    fxRate = 1
  } else if (fxOverride !== null) {
    fxRate = fxOverride
  } else {
    const central = await getRateToMad(supabase, sourceCurrency)
    if (central === null) {
      return { error: `Aucun taux de change disponible pour ${sourceCurrency}. Renseignez le taux ou utilisez l'override.` }
    }
    fxRate = central
  }

  // CONVERSION FX — half-up centimes (validé @finance + GO Abdou, lot FX). Bascule
  // depuis toFixed(2) : ±1 ct sur ~0,1 % des devis, à la (re-)préparation uniquement.
  const unitPriceMad = Math.round(sourceUnitPrice * fxRate * 100) / 100

  // Devise d'affichage = devise du pays destination (figée avec son taux).
  const { data: q } = (await supabase
    .from('quote_requests')
    .select('destination_country')
    .eq('id', requestId)
    .single()) as { data: { destination_country: string | null } | null; error: unknown }

  const { currency: displayCurrency, rate: displayRate } = await getClientCurrency(
    supabase,
    q?.destination_country,
  )

  const shippingMode = (formData.get('quoted_shipping_mode') as string)?.trim() || null
  const deliveryDelay = (formData.get('quoted_delivery_delay') as string)?.trim() || null
  const validityDate = (formData.get('quote_validity_date') as string)?.trim() || null
  const publicNote = (formData.get('quote_public_note') as string)?.trim() || null

  const { error: dbError } = await supabase
    .from('quote_requests')
    .update({
      status:                     'quote_prepared',
      quoted_unit_price_mad:      unitPriceMad,
      quoted_unit_price_source:   sourceUnitPriceStr,
      source_currency:            sourceCurrency,
      fx_rate_source_to_mad:      fxRate,
      display_currency:           displayCurrency,
      fx_rate_display_vs_mad:     displayRate,
      quoted_quantity:            quantity,
      quoted_transport_total_mad: transportTotalR.value,
      quoted_shipping_mode:       shippingMode,
      quoted_delivery_delay:      deliveryDelay,
      quote_validity_date:        validityDate || null,
      quote_public_note:          publicNote,
      quote_prepared_at:          new Date().toISOString(),
    })
    .eq('id', requestId)

  if (dbError) return { error: dbError.message }

  revalidatePath('/admin/quote-requests')
  revalidatePath(`/admin/quote-requests/${requestId}`)
  revalidatePath('/wholesale/quote-requests')
  revalidatePath(`/wholesale/quote-requests/${requestId}`)
  return { error: null, success: true }
}

// ─── Wholesaler accepts or rejects a prepared quote ───────────────────────────

export async function respondToQuote(
  _prev: QuoteDecisionFormState,
  formData: FormData,
): Promise<QuoteDecisionFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const requestId = (formData.get('request_id') as string)?.trim()
  if (!requestId) return { error: 'Identifiant manquant.' }

  const decision = formData.get('decision') as string
  if (decision !== 'accepted_by_client' && decision !== 'rejected_by_client') {
    return { error: 'Décision invalide.' }
  }

  // Verify current status before updating (gives a clear error if already decided)
  const { data: existing } = await supabase
    .from('quote_requests')
    .select('status')
    .eq('id', requestId)
    .eq('buyer_id', user.id)
    .single()

  if (!existing) return { error: 'Devis introuvable.' }
  if (existing.status !== 'quote_prepared') {
    return { error: 'Ce devis ne peut plus être modifié.' }
  }

  const { error: dbError } = await supabase
    .from('quote_requests')
    .update({ status: decision, client_decision_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('buyer_id', user.id)

  if (dbError) return { error: dbError.message }

  revalidatePath('/wholesale/quote-requests')
  revalidatePath(`/wholesale/quote-requests/${requestId}`)
  revalidatePath(`/wholesale/quote-requests/${requestId}/quote`)
  revalidatePath('/admin/quote-requests')
  revalidatePath(`/admin/quote-requests/${requestId}`)
  return { error: null, success: true }
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

  // ── M-1 (fix) — facturer le PRIX DE DEVIS NÉGOCIÉ figé, jamais recalculer sur les
  // paliers. Fail-closed : sans prix de devis valide (> 0), on REFUSE la conversion
  // (plus de `tier?.price_per_unit ?? 0` → plus de commande à 0 MAD si aucun palier
  // ne matche). Audit @finance M-1, GO Abdou 2026-06-16.
  const quotedUnitPrice = quote.quoted_unit_price_mad
  const quotedQty = quote.quoted_quantity ?? quote.quantity_requested
  if (quotedUnitPrice == null || quotedUnitPrice <= 0) {
    return { error: 'Aucun prix de devis valide n\'est figé sur cette demande. Préparez le devis (prix unitaire) avant de convertir.' }
  }
  if (quotedQty == null || quotedQty <= 0) {
    return { error: 'Quantité de devis invalide. Préparez le devis avant de convertir.' }
  }
  const unitPrice = quotedUnitPrice
  const tierLabel = 'Prix de devis négocié'
  // Arrondi half-up centimes (convention unique du chantier). unitPrice (numeric ≤2 déc)
  // × quantité entière = exact ; on facture exactement le devis figé.
  const subtotal = Math.round(unitPrice * quotedQty * 100) / 100

  // Propagation du snapshot de taux figé du devis vers la commande (traçabilité argent).
  // NB : total_amount reste calculé sur les tiers MAD (comportement existant inchangé) ;
  // ces champs sont une métadonnée d'origine, à réconcilier au branchement ledger multi-devise.
  const fxQuote = quote as unknown as {
    source_currency: string | null
    fx_rate_source_to_mad: number | null
    quoted_unit_price_source: number | null
  }
  // Montant source de traçabilité — échelle 4 décimales conservée, arrondi half-up
  // (no-op vs l'ancien toFixed(4) : source × qty entier ; basculé pour cohérence).
  const merchandiseSourceAmount =
    fxQuote.quoted_unit_price_source != null
      ? Math.round(fxQuote.quoted_unit_price_source * quotedQty * 10000) / 10000
      : null

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
      source_currency:         fxQuote.source_currency ?? null,
      fx_rate_source_to_mad:   fxQuote.fx_rate_source_to_mad ?? null,
      merchandise_source_amount: merchandiseSourceAmount,
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
    quantity:            quotedQty,
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
