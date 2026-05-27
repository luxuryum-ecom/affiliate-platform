'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getWholesaleTier } from '@/lib/utils'
import type {
  OrderStatus,
  WholesaleOrderStatus,
  WholesaleCartItemWithProduct,
} from '@/types/database'

// ─── Re-export types (defined in src/types/orders.ts to avoid 'use server' restrictions) ─
export type { ActionState, OrderFormState } from '@/types/orders'
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
  const affiliateId = (formData.get('affiliateId') as string)?.trim() || null
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

  // ── Fetch product ─────────────────────────────────────────────────────────
  const { data: product } = (await supabase
    .from('products')
    .select('id, sell_price, commission_amount, stock_count, active, approval_status, name')
    .eq('id', productId)
    .single()) as { data: {
      id: string
      sell_price: number
      commission_amount: number
      stock_count: number
      active: boolean
      approval_status: string
      name: string
    } | null; error: unknown }

  if (!product) return { error: 'Produit non disponible.', success: false, orderId: null }
  if (!product.active || product.approval_status !== 'approved')
    return { error: 'Ce produit n\'est plus disponible.', success: false, orderId: null }
  if (product.stock_count < quantity)
    return { error: `Stock insuffisant (${product.stock_count} unités disponibles).`, success: false, orderId: null }

  // ── Validate affiliate ID if provided ────────────────────────────────────
  // Silently drop invalid affiliate refs — customer shouldn't see an error for this
  let validatedAffiliateId: string | null = null
  if (affiliateId) {
    const { data: affiliate } = (await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', affiliateId)
      .single()) as { data: { id: string; role: string; status: string } | null; error: unknown }

    if (affiliate?.role === 'affiliate' && affiliate.status === 'approved') {
      validatedAffiliateId = affiliate.id
    }
  }

  const totalAmount      = parseFloat((product.sell_price * quantity).toFixed(2))
  const commissionAmount = validatedAffiliateId
    ? parseFloat((product.commission_amount * quantity).toFixed(2))
    : 0

  // ── Insert order ──────────────────────────────────────────────────────────
  const { data: order, error: insertError } = (await supabase
    .from('orders')
    .insert({
      affiliate_id:     validatedAffiliateId,
      product_id:       productId,
      customer_name:    customerName,
      customer_phone:   customerPhone,
      customer_city:    customerCity,
      customer_address: customerAddress,
      quantity,
      total_amount:     totalAmount,
      commission_amount: commissionAmount,
      cod_expected:     totalAmount,
      status:           'pending',
      notes,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insertError || !order) {
    console.error('placeOrder insert error:', insertError)
    return { error: 'Erreur lors de la commande. Veuillez réessayer.', success: false, orderId: null }
  }

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
  const supabase = await createClient()

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
  const needsReserve     = newStatus === 'confirmed' && prev === 'pending'
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

  if (newStatus === 'confirmed')  update.confirmed_at = now
  if (newStatus === 'shipped')    update.shipped_at   = now
  if (newStatus === 'delivered')  update.delivered_at = now
  if (newStatus === 'returned')   update.returned_at  = now

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
  const supabase = await createClient()
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
  const supabase = await createClient()

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
