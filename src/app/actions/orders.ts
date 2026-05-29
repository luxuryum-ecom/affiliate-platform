'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calculateNetAffiliateCommission, getWholesaleTier } from '@/lib/utils'
import { requireAdmin } from './_guards'
import {
  scoreDuplicateOrder,
  scoreFraudOrder,
  scoreSpamOrder,
} from '@/lib/order-analytics'
import type {
  OrderStatus,
  WholesaleOrderStatus,
  WholesaleCartItemWithProduct,
} from '@/types/database'

import type { ActionState, OrderFormState } from '@/types/orders'

const ok: ActionState = { error: null, success: true }
const fail = (msg: string): ActionState => ({ error: msg, success: false })

/**
 * Place a COD order from the public product page.
 * No authentication required — customer submits the form directly.
 * affiliate_id comes from the ?ref= URL param embedded in a hidden input.
 */
export async function placeOrder(
  _prevState: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const supabase = await createClient()

  const productId  = (formData.get('productId') as string)?.trim()
  const affiliateIdRaw = (formData.get('affiliateId') as string)?.trim() || null
  const attributionClickId = (formData.get('attributionClickId') as string)?.trim() || null
  const quantity   = parseInt(formData.get('quantity') as string, 10)
  const customerName    = (formData.get('customer_name') as string)?.trim()
  const customerPhone   = (formData.get('customer_phone') as string)?.trim()
  const customerCity    = (formData.get('customer_city') as string)?.trim()
  const customerAddress = (formData.get('customer_address') as string)?.trim()
  const notes           = ((formData.get('notes') as string)?.trim()) || null

  // ── Validation ────────────────────────────────────────────────────────────
  if (!productId)         return { error: 'Produit introuvable.', success: false, orderId: null }
  if (isNaN(quantity) || quantity < 1) return { error: 'Quantité invalide.', success: false, orderId: null }
  if (!customerName)      return { error: 'Votre nom est requis.', success: false, orderId: null }
  if (!customerPhone)     return { error: 'Votre téléphone est requis.', success: false, orderId: null }
  if (!customerCity)      return { error: 'Votre ville est requise.', success: false, orderId: null }
  if (!customerAddress)   return { error: 'Votre adresse est requise.', success: false, orderId: null }

  const { data: product } = (await supabase
    .from('products')
    .select(
      'id, sell_price, stock_count, active, approval_status, affiliate_enabled, availability_type, name, confirmation_fee_mad, packaging_fee_mad, delivery_fee_mad, purchase_price_mad, platform_margin_type, platform_margin_value'
    )
    .eq('id', productId)
    .single()) as { data: {
      id: string
      sell_price: number
      stock_count: number
      active: boolean
      approval_status: string
      affiliate_enabled: boolean
      availability_type: string
      name: string
      confirmation_fee_mad: number
      packaging_fee_mad: number
      delivery_fee_mad: number
      purchase_price_mad: number | null
      platform_margin_type: 'percentage' | 'fixed'
      platform_margin_value: number | null
    } | null; error: unknown }

  if (!product) return { error: 'Produit non disponible.', success: false, orderId: null }
  if (!product.active || product.approval_status !== 'approved')
    return { error: 'Ce produit n\'est plus disponible.', success: false, orderId: null }
  if (!product.affiliate_enabled || product.availability_type === 'import_on_demand')
    return { error: 'Ce produit n\'est pas disponible à la vente COD.', success: false, orderId: null }
  if (product.stock_count < quantity)
    return { error: `Stock insuffisant (${product.stock_count} unités disponibles).`, success: false, orderId: null }

  // ── Validate affiliate ID if provided ────────────────────────────────────
  let validatedAffiliateId: string | null = null
  if (affiliateIdRaw) {
    const { data: affiliate } = (await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', affiliateIdRaw)
      .single()) as { data: { id: string; role: string; status: string } | null; error: unknown }

    if (affiliate?.role === 'affiliate' && affiliate.status === 'approved') {
      validatedAffiliateId = affiliate.id
    }
  }

  // Look up affiliate's custom sell price server-side — do not trust the form value.
  let unitPrice = product.sell_price

  if (validatedAffiliateId) {
    const { data: priceRow } = (await supabase
      .from('affiliate_product_prices')
      .select('custom_sell_price_mad')
      .eq('affiliate_id', validatedAffiliateId)
      .eq('product_id', productId)
      .maybeSingle()) as { data: { custom_sell_price_mad: number } | null; error: unknown }

    if (priceRow?.custom_sell_price_mad) {
      unitPrice = Number(priceRow.custom_sell_price_mad)
    }
  }

  const totalAmount = parseFloat((unitPrice * quantity).toFixed(2))
  const commissionAmount = validatedAffiliateId
    ? calculateNetAffiliateCommission({
        affiliateSellPrice: unitPrice,
        factoryCostMad: product.purchase_price_mad ?? 0,
        marginType: product.platform_margin_type,
        marginValue: product.platform_margin_value ?? 0,
        deliveryFee: product.delivery_fee_mad ?? 0,
        confirmationFee: product.confirmation_fee_mad ?? 10,
        packagingFee: product.packaging_fee_mad ?? 10,
        quantity,
      })
    : 0

  const deliveryFeeSnapshot = product.delivery_fee_mad ?? 0
  const packagingFeeSnapshot = product.packaging_fee_mad ?? 10
  const confirmationFeeSnapshot = product.confirmation_fee_mad ?? 10

  // ── Duplicate / spam scoring (AI-ready pipeline) ─────────────────────────
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentDupes } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('customer_phone', customerPhone)
    .eq('product_id', productId)
    .gte('created_at', dayAgo)

  const duplicateScore = scoreDuplicateOrder(recentDupes ?? 0)
  const spamScore = scoreSpamOrder(customerPhone, customerName)
  const fraudScore = scoreFraudOrder({
    duplicateScore,
    spamScore,
    hasAffiliate: !!validatedAffiliateId,
  })

  // ── Insert order with immutable snapshots ─────────────────────────────────
  const { data: order, error: insertError } = (await supabase
    .from('orders')
    .insert({
      affiliate_id: validatedAffiliateId,
      product_id: productId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_city: customerCity,
      customer_address: customerAddress,
      quantity,
      total_amount: totalAmount,
      commission_amount: commissionAmount,
      product_price_snapshot: unitPrice,
      affiliate_commission_mad_snapshot: commissionAmount,
      delivery_fee_snapshot: deliveryFeeSnapshot,
      packaging_fee_snapshot: packagingFeeSnapshot,
      confirmation_fee_snapshot: confirmationFeeSnapshot,
      attribution_click_id: attributionClickId,
      fraud_score: fraudScore,
      duplicate_risk_score: duplicateScore,
      spam_score: spamScore,
      signals_metadata: {
        scoring_version: '1.0',
        recent_duplicate_count_24h: recentDupes ?? 0,
      },
      cod_expected: totalAmount,
      status: 'pending_confirmation',
      notes,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insertError || !order) {
    console.error('placeOrder insert error:', insertError)
    return { error: 'Erreur lors de la commande. Veuillez réessayer.', success: false, orderId: null }
  }

  // Persist signal records for future ML / analytics
  const signals = [
    { order_id: order.id, signal_type: 'duplicate' as const, score: duplicateScore, metadata: { window_hours: 24, count: recentDupes ?? 0 } },
    { order_id: order.id, signal_type: 'spam' as const, score: spamScore, metadata: {} },
    { order_id: order.id, signal_type: 'fraud' as const, score: fraudScore, metadata: {} },
  ]
  await supabase.from('order_signals').insert(signals)

  return { error: null, success: true, orderId: order.id }
}

// =============================================================================
// ADMIN — COD ORDER STATUS UPDATE
// =============================================================================

/**
 * Update a COD order's status.
 * Handles stock reserve / restore atomically via Postgres RPC.
 * Sets audit timestamps. Commission creation is handled by the DB trigger.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  options?: {
    deliveryCompany?: string
    trackingNumber?: string
    notes?: string
    codReceived?: number
    returnReason?: string
  }
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin({ allowAgent: true })
  if (authError) return fail(authError)

  // ── Fetch current state ───────────────────────────────────────────────────
  const { data: order } = (await supabase
    .from('orders')
    .select('status, quantity, product_id, cod_expected')
    .eq('id', orderId)
    .single()) as {
    data: {
      status: string
      quantity: number
      product_id: string
      cod_expected: number | null
    } | null
    error: unknown
  }

  if (!order) return fail('Commande introuvable.')

  const prev = order.status as OrderStatus
  if (prev === newStatus) return fail('Le statut est déjà à jour.')

  // ── Stock logic ───────────────────────────────────────────────────────────
  const wasStockReserved = ['confirmed', 'shipped', 'delivered'].includes(prev)
  const needsReserve     = newStatus === 'confirmed' && prev === 'pending_confirmation'
  const needsRestore     = ['cancelled', 'returned'].includes(newStatus) && wasStockReserved

  if (needsReserve) {
    const { data: reserved } = (await supabase.rpc('reserve_stock', {
      p_product_id: order.product_id,
      p_qty: order.quantity,
    })) as { data: boolean; error: unknown }
    if (!reserved) return fail('Stock insuffisant pour confirmer la commande.')
  }

  if (needsRestore) {
    await supabase.rpc('restore_stock', {
      p_product_id: order.product_id,
      p_qty: order.quantity,
    })
  }

  // ── Build update payload ──────────────────────────────────────────────────
  const now = new Date().toISOString()

  const update: Record<string, unknown> = {
    status: newStatus,
    notes: options?.notes ?? undefined,
  }

  if (options?.deliveryCompany) update.delivery_company = options.deliveryCompany
  if (options?.trackingNumber)  update.tracking_number  = options.trackingNumber
  if (options?.codReceived != null) update.cod_received = options.codReceived
  if (options?.returnReason)    update.return_reason    = options.returnReason

  if (newStatus === 'confirmed')  update.confirmed_at  = now
  if (newStatus === 'shipped')    update.shipped_at    = now
  if (newStatus === 'delivered')  update.delivered_at  = now
  if (newStatus === 'returned')   update.returned_at   = now
  if (newStatus === 'cancelled')  update.cancelled_at  = now

  const { error } = await supabase.from('orders').update(update).eq('id', orderId)
  if (error) return fail(error.message)

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  return ok
}

// =============================================================================
// ADMIN — CREATE WHOLESALE ORDER FROM CART
// =============================================================================

/**
 * Convert a buyer's cart to a wholesale order.
 * Creates wholesale_order + wholesale_order_items from cart items.
 * Price snapshots captured at this moment (not retroactively updated).
 * Cart is cleared after successful order creation.
 */
export async function createWholesaleOrderFromCart(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin({ allowAgent: true })
  if (authError) return fail(authError)

  const buyerId = (formData.get('buyerId') as string)?.trim()
  if (!buyerId) return fail('Acheteur non spécifié.')

  // ── Fetch cart items with products ────────────────────────────────────────
  const { data: cartItems } = (await supabase
    .from('wholesale_cart_items')
    .select('*, product:products(*)')
    .eq('buyer_id', buyerId)) as {
    data: WholesaleCartItemWithProduct[] | null
    error: unknown
  }

  if (!cartItems?.length) return fail('Le panier de cet acheteur est vide.')

  // ── Calculate total with tier pricing ─────────────────────────────────────
  let total = 0
  const lineItems = cartItems.map((item) => {
    const tier       = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice  = tier ? tier.price_per_unit : item.product.sell_price
    const subtotal   = parseFloat((unitPrice * item.quantity).toFixed(2))
    total           += subtotal
    return {
      product_id:          item.product_id,
      quantity:            item.quantity,
      unit_price_snapshot: unitPrice,
      subtotal,
      tier_label_snapshot: tier ? tier.label : 'Prix standard',
    }
  })

  total = parseFloat(total.toFixed(2))

  // ── Create wholesale_order ─────────────────────────────────────────────────
  const { data: newOrder, error: orderErr } = (await supabase
    .from('wholesale_orders')
    .insert({
      buyer_id:            buyerId,
      total_amount:        total,
      status:              'pending',
      delivery_preference: 'delivery',
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (orderErr || !newOrder) return fail('Erreur lors de la création de la commande.')

  // ── Insert order items ─────────────────────────────────────────────────────
  const items = lineItems.map((li) => ({ ...li, order_id: newOrder.id }))
  const { error: itemsErr } = await supabase.from('wholesale_order_items').insert(items)
  if (itemsErr) {
    // Roll back by deleting the order
    await supabase.from('wholesale_orders').delete().eq('id', newOrder.id)
    return fail('Erreur lors de l\'enregistrement des articles.')
  }

  // ── Clear buyer's cart ────────────────────────────────────────────────────
  await supabase.from('wholesale_cart_items').delete().eq('buyer_id', buyerId)

  revalidatePath('/admin/wholesale-orders')
  return ok
}

/**
 * Thin wrapper for direct <form action={...}> use in server components.
 * createWholesaleOrderFromCart is useActionState-style (prevState, formData).
 * This wrapper drops prevState so it can be used as a plain form action.
 */
export async function createWholesaleOrderAction(formData: FormData): Promise<void> {
  await createWholesaleOrderFromCart({ error: null, success: false }, formData)
}

// =============================================================================
// WHOLESALER — SUBMIT OWN CART AS ORDER
// =============================================================================

/**
 * Wholesaler submits their cart as a platform wholesale order.
 * Cart is cleared after successful creation; admin sees it in wholesale orders.
 */
export async function submitWholesaleOrder(
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()) as { data: { role: string; status: string } | null; error: unknown }

  if (profile?.role !== 'wholesaler' || profile?.status !== 'approved') {
    return fail('Accès réservé aux grossistes approuvés.')
  }

  const { data: cartItems } = (await supabase
    .from('wholesale_cart_items')
    .select('*, product:products(*)')
    .eq('buyer_id', user.id)) as {
    data: WholesaleCartItemWithProduct[] | null
    error: unknown
  }

  if (!cartItems?.length) return fail('Votre panier est vide.')

  for (const item of cartItems) {
    if (!item.product.active || item.product.approval_status !== 'approved') {
      return fail(`« ${item.product.name} » n'est plus disponible.`)
    }
    if (item.quantity < item.product.wholesale_min_qty) {
      return fail(
        `« ${item.product.name} » : minimum ${item.product.wholesale_min_qty} unités requises.`
      )
    }
  }

  let total = 0
  const lineItems = cartItems.map((item) => {
    const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
    const subtotal = parseFloat((unitPrice * item.quantity).toFixed(2))
    total += subtotal
    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_snapshot: unitPrice,
      subtotal,
      tier_label_snapshot: tier ? tier.label : 'Prix standard',
    }
  })

  total = parseFloat(total.toFixed(2))

  const { data: newOrder, error: orderErr } = (await supabase
    .from('wholesale_orders')
    .insert({
      buyer_id: user.id,
      total_amount: total,
      status: 'pending',
      delivery_preference: 'delivery',
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (orderErr || !newOrder) return fail('Erreur lors de la création de la commande.')

  const items = lineItems.map((li) => ({ ...li, order_id: newOrder.id }))
  const { error: itemsErr } = await supabase.from('wholesale_order_items').insert(items)
  if (itemsErr) {
    await supabase.from('wholesale_orders').delete().eq('id', newOrder.id)
    return fail('Erreur lors de l\'enregistrement des articles.')
  }

  await supabase.from('wholesale_cart_items').delete().eq('buyer_id', user.id)

  revalidatePath('/wholesale/cart')
  revalidatePath('/wholesale/orders')
  revalidatePath('/admin/wholesale-orders')
  redirect('/wholesale/orders?submitted=1')
}

// =============================================================================
// ADMIN — UPDATE WHOLESALE ORDER STATUS
// =============================================================================

/**
 * Update a wholesale order's status.
 * Handles stock reserve/restore and audit timestamps.
 */
export async function updateWholesaleOrderStatus(
  orderId: string,
  newStatus: WholesaleOrderStatus,
  notes?: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin({ allowAgent: true })
  if (authError) return fail(authError)

  const { data: order } = (await supabase
    .from('wholesale_orders')
    .select('status')
    .eq('id', orderId)
    .single()) as { data: { status: string } | null; error: unknown }

  if (!order) return fail('Commande introuvable.')
  if (order.status === newStatus) return fail('Statut déjà à jour.')

  const now = new Date().toISOString()

  const update: Record<string, unknown> = { status: newStatus }
  if (notes) update.agent_notes = notes

  if (newStatus === 'confirmed')  { update.confirmed_at = now }
  if (newStatus === 'sourcing')   { update.sourcing_at  = now }
  if (newStatus === 'shipped')    { update.shipped_at   = now }
  if (newStatus === 'delivered')  { update.delivered_at = now }
  if (newStatus === 'cancelled')  { update.cancelled_at = now }

  // ── Stock: confirmed → reserve all items; cancelled → restore ────────────
  const prev = order.status as WholesaleOrderStatus

  if (newStatus === 'confirmed' && prev === 'pending') {
    const { data: items } = (await supabase
      .from('wholesale_order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId)) as {
      data: { product_id: string; quantity: number }[] | null
      error: unknown
    }

    for (const item of items ?? []) {
      const { data: reserved } = (await supabase.rpc('reserve_stock', {
        p_product_id: item.product_id,
        p_qty: item.quantity,
      })) as { data: boolean; error: unknown }
      if (!reserved) {
        return fail('Stock insuffisant pour un ou plusieurs articles.')
      }
    }
  }

  if (newStatus === 'cancelled' && ['confirmed', 'sourcing', 'shipped'].includes(prev)) {
    const { data: items } = (await supabase
      .from('wholesale_order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId)) as {
      data: { product_id: string; quantity: number }[] | null
      error: unknown
    }
    for (const item of items ?? []) {
      await supabase.rpc('restore_stock', {
        p_product_id: item.product_id,
        p_qty: item.quantity,
      })
    }
  }

  const { error } = await supabase.from('wholesale_orders').update(update).eq('id', orderId)
  if (error) return fail(error.message)

  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath(`/wholesale/orders`)
  return ok
}
