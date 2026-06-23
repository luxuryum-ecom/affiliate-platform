'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calculateNetAffiliateCommission, getWholesaleTier, DELIVERY_PROVISION_MAD } from '@/lib/utils'
import { getLogisticsSettings } from './logistics'
import { requireAdmin } from './_guards'
import { isFsmTransitionAllowed } from '@/lib/wholesale-fsm'
import { parseMoneyInput } from '@/lib/money'
import { computeSupplierCostMad } from '@/lib/supplier-mirror'
import { notifyOrderAssigned } from '@/lib/notifications/order-assigned'
import {
  scoreDuplicateOrder,
  scoreFraudOrder,
  scoreSpamOrder,
} from '@/lib/order-analytics'
import type {
  OrderStatus,
  OrderSource,
  WholesaleOrderStatus,
  WholesaleImportStatus,
  WholesalePaymentStatus,
  WholesaleCartItemWithProduct,
  SupplierResponse,
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
  // COD public flow — no session. Use service_role to bypass anon RLS policies.
  const supabase = createAdminClient()

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
      'id, sell_price, stock_count, active, approval_status, affiliate_enabled, availability_type, name, confirmation_fee_mad, packaging_fee_mad, delivery_fee_mad, factory_cost_mad, purchase_price_mad, platform_margin_type, platform_margin_value'
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
      factory_cost_mad: number | null
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

  // Validate attribution click belongs to this affiliate + product — reject tampered click IDs.
  let validatedClickId: string | null = null
  if (attributionClickId && validatedAffiliateId) {
    const { data: clickRow } = (await supabase
      .from('affiliate_clicks')
      .select('id')
      .eq('id', attributionClickId)
      .eq('affiliate_id', validatedAffiliateId)
      .eq('product_id', productId)
      .maybeSingle()) as { data: { id: string } | null; error: unknown }
    validatedClickId = clickRow?.id ?? null
  }

  // ── Resolve logistics settings (return fee only) ─────────────────────────
  // La livraison COD affilié est couverte par la provision fixe dans le capital.
  // resolveDeliveryFeeByCity n'est plus utilisé dans ce flux.
  const logisticsSettings = await getLogisticsSettings()
  const returnFeeResolved = logisticsSettings
    ? Number(logisticsSettings.return_fee_mad)
    : 10

  // ── Garde : coût usine obligatoire pour calculer la commission affilié ────
  // Fail closed (@finance) : si factory_cost_mad est null ET qu'un affilié est
  // attribué, on refuse la commande plutôt que de calculer sur 0.
  if (validatedAffiliateId && product.factory_cost_mad == null) {
    return {
      error: 'Produit incomplet (coût usine manquant) — commande impossible.',
      success: false,
      orderId: null,
    }
  }

  // Total = prix × quantité en CENTIMES ENTIERS (zéro flottant) → chaîne pour numeric.
  // unitPrice vient de la DB (numeric ≤ 2 décimales), donc Math.round(prix*100) est exact.
  const totalAmountCents = Math.round(unitPrice * 100) * quantity
  const totalAmount = (totalAmountCents / 100).toFixed(2)
  const commissionAmount = validatedAffiliateId
    ? calculateNetAffiliateCommission({
        affiliateSellPrice: unitPrice,
        // factory_cost_mad est non-null garanti par la garde ci-dessus.
        factoryCostMad: product.factory_cost_mad as number,
        marginType: product.platform_margin_type,
        marginValue: product.platform_margin_value ?? 0,
        // Livraison = provision fixe incluse dans le capital → une seule déduction.
        deliveryFee: DELIVERY_PROVISION_MAD,
        confirmationFee: product.confirmation_fee_mad ?? 10,
        packagingFee: product.packaging_fee_mad ?? 10,
        quantity,
      })
    : 0

  // D4 / flux PUBLIC (audit @finance + @security) : on NE bloque PAS le client.
  // Si la commission serait négative, elle est ramenée à 0 plus bas (Math.max),
  // la vente passe et la plateforme encaisse ; l'affilié touche simplement 0.
  // Le blocage strict n'a lieu que côté affilié (createAffiliateOrder).

  // delivery_fee_snapshot = provision fixe (cohérence avec le capital).
  const deliveryFeeSnapshot = DELIVERY_PROVISION_MAD
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
      commission_amount: Math.max(0, commissionAmount),
      product_price_snapshot: unitPrice,
      affiliate_commission_mad_snapshot: Math.max(0, commissionAmount),
      delivery_fee_snapshot: deliveryFeeSnapshot,
      packaging_fee_snapshot: packagingFeeSnapshot,
      confirmation_fee_snapshot: confirmationFeeSnapshot,
      return_fee_snapshot: returnFeeResolved,
      attribution_click_id: validatedClickId,
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
      is_pre_confirmed: false, // Option A — flux public : jamais pré-confirmé
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
// AFFILIATE — SELF-ORDER ENTRY
// =============================================================================

/**
 * Affiliate manually creates a COD order from their own account.
 * affiliate_id is always set to the authenticated user — never from the form.
 * Sell price is provided by the affiliate (their own customer price).
 * Commission is calculated using the same formula as placeOrder.
 * Status starts as 'pending_confirmation'.
 */
export async function createAffiliateOrder(
  _prevState: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.', success: false, orderId: null }

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()) as { data: { role: string; status: string } | null; error: unknown }

  if (profile?.role !== 'affiliate' || profile?.status !== 'approved') {
    return { error: 'Accès réservé aux affiliés approuvés.', success: false, orderId: null }
  }

  const productId      = (formData.get('product_id') as string)?.trim()
  const quantity       = parseInt(formData.get('quantity') as string, 10)
  const sellPriceResult = parseMoneyInput(formData.get('sell_price'))
  const customerName   = (formData.get('customer_name') as string)?.trim()
  const customerPhone  = (formData.get('customer_phone') as string)?.trim()
  const customerCity   = (formData.get('customer_city') as string)?.trim()
  const customerAddress = (formData.get('customer_address') as string)?.trim()
  const notes          = ((formData.get('notes') as string)?.trim()) || null
  const orderSource    = ((formData.get('order_source') as string)?.trim() || 'manual') as OrderSource
  // Anti-coercion : formData.get() renvoie une string. "false" est truthy en JS —
  // NE JAMAIS faire Boolean(formData.get(...)). Comparaison stricte === 'true' uniquement.
  // Défaut false sur tout le reste (absent, null, "false", toute autre string).
  const isPreConfirmed = formData.get('is_pre_confirmed') === 'true'

  if (!productId)                     return { error: 'Produit requis.', success: false, orderId: null }
  if (isNaN(quantity) || quantity < 1) return { error: 'Quantité invalide.', success: false, orderId: null }
  if (!sellPriceResult.ok)
    return { error: 'Prix de vente invalide.', success: false, orderId: null }
  // RÈGLE ARGENT n°4 — montant validé en CHAÎNE décimale exacte (money.ts), stockée
  // verbatim ; on dérive un `number` UNIQUEMENT pour les comparaisons/calculs — exact
  // car MONEY_REGEX garantit ≤ 2 décimales (jamais un parseFloat sur entrée libre).
  const sellPrice = sellPriceResult.value
  const sellPriceNum = Number(sellPrice)
  if (sellPriceNum <= 0)
    return { error: 'Prix de vente invalide.', success: false, orderId: null }
  if (!customerName)   return { error: 'Nom du client requis.', success: false, orderId: null }
  if (!customerPhone)  return { error: 'Téléphone du client requis.', success: false, orderId: null }
  if (!customerCity)   return { error: 'Ville du client requise.', success: false, orderId: null }
  if (!customerAddress) return { error: 'Adresse du client requise.', success: false, orderId: null }
  if (!['whatsapp', 'phone', 'manual', 'sheet_import', 'api'].includes(orderSource))
    return { error: 'Source invalide.', success: false, orderId: null }

  // DETTE 073 — coût/marge (factory_cost_mad, platform_margin_*) lus via service_role
  // server-side UNIQUEMENT pour le calcul de commission ; jamais renvoyés au client.
  // Calcul de commission INCHANGÉ. (La policy base-table devient admin-only, mig 091.)
  const { data: product } = (await createAdminClient()
    .from('products')
    .select(
      'id, sell_price, stock_count, active, approval_status, affiliate_enabled, availability_type, name, confirmation_fee_mad, packaging_fee_mad, delivery_fee_mad, factory_cost_mad, platform_margin_type, platform_margin_value'
    )
    .eq('id', productId)
    .single()) as {
    data: {
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
      factory_cost_mad: number | null
      platform_margin_type: 'percentage' | 'fixed'
      platform_margin_value: number | null
    } | null
    error: unknown
  }

  if (!product)
    return { error: 'Produit introuvable.', success: false, orderId: null }
  if (!product.active || product.approval_status !== 'approved')
    return { error: 'Ce produit n\'est plus disponible.', success: false, orderId: null }
  if (!product.affiliate_enabled || product.availability_type === 'import_on_demand')
    return { error: 'Ce produit n\'est pas disponible à la vente COD.', success: false, orderId: null }
  if (product.stock_count < quantity)
    return { error: `Stock insuffisant (${product.stock_count} unités disponibles).`, success: false, orderId: null }
  if (sellPriceNum < product.sell_price)
    return {
      error: `Le prix de vente doit être ≥ ${product.sell_price} MAD (prix de base).`,
      success: false,
      orderId: null,
    }

  // ── Garde : coût usine obligatoire (fail closed, @finance) ──────────────
  if (product.factory_cost_mad == null) {
    return {
      error: 'Produit incomplet (coût usine manquant) — commande impossible.',
      success: false,
      orderId: null,
    }
  }

  const logisticsSettings = await getLogisticsSettings()
  const returnFeeResolved = logisticsSettings ? Number(logisticsSettings.return_fee_mad) : 10

  // Total = prix × quantité en CENTIMES ENTIERS (arithmétique exacte, zéro flottant),
  // puis chaîne décimale pour la colonne numeric (cf. stratégie B chantier money).
  const totalAmountCents = Math.round(sellPriceNum * 100) * quantity
  const totalAmount = (totalAmountCents / 100).toFixed(2)
  const commissionAmount = calculateNetAffiliateCommission({
    affiliateSellPrice: sellPriceNum,
    // factory_cost_mad est non-null garanti par la garde ci-dessus.
    factoryCostMad: product.factory_cost_mad,
    marginType: product.platform_margin_type,
    marginValue: product.platform_margin_value ?? 0,
    // Livraison = provision fixe incluse dans le capital → une seule déduction.
    deliveryFee: DELIVERY_PROVISION_MAD,
    confirmationFee: product.confirmation_fee_mad ?? 10,
    packagingFee: product.packaging_fee_mad ?? 10,
    quantity,
  })

  // D4 — l'affilié maîtrise son prix : refuser une commande à commission négative
  // (coûts + livraison supérieurs au prix de vente). Il doit augmenter son prix.
  if (commissionAmount < 0) {
    return {
      error: 'Prix de vente trop bas : la commission serait négative (coûts et livraison supérieurs au prix). Augmentez votre prix de vente.',
      success: false,
      orderId: null,
    }
  }

  const { data: order, error: insertError } = (await supabase
    .from('orders')
    .insert({
      affiliate_id:          user.id,
      product_id:            productId,
      customer_name:         customerName,
      customer_phone:        customerPhone,
      customer_city:         customerCity,
      customer_address:      customerAddress,
      quantity,
      total_amount:          totalAmount,
      commission_amount:     Math.max(0, commissionAmount),
      product_price_snapshot: sellPrice,
      affiliate_commission_mad_snapshot: Math.max(0, commissionAmount),
      delivery_fee_snapshot:   DELIVERY_PROVISION_MAD,
      packaging_fee_snapshot:  product.packaging_fee_mad ?? 10,
      confirmation_fee_snapshot: product.confirmation_fee_mad ?? 10,
      return_fee_snapshot:     returnFeeResolved,
      cod_expected:            totalAmount,
      order_source:            orderSource,
      status:                  'pending_confirmation',
      notes,
      is_pre_confirmed:        isPreConfirmed,
      fraud_score:             0,
      duplicate_risk_score:    0,
      spam_score:              0,
      signals_metadata:        { source: 'affiliate_manual_entry' },
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  if (insertError || !order) {
    console.error('createAffiliateOrder insert error:', insertError)
    return { error: 'Erreur lors de la création de la commande.', success: false, orderId: null }
  }

  revalidatePath('/affiliate/orders')
  revalidatePath('/admin/orders')
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
    /** Montant COD encaissé — CHAÎNE brute validée serveur (parseMoneyInput). */
    codReceived?: string
    returnReason?: string
  }
): Promise<ActionState> {
  const { supabase, error: authError, userId } = await requireAdmin({ allowAgent: true })
  if (authError || !userId) return fail(authError ?? 'Non authentifié.')

  // ── DURCISSEMENT NON-ADMIN ────────────────────────────────────────────────
  // Un agent (role='agent') qui appelle cette action ne peut PAS passer un statut
  // financier ou critique. Il doit passer par confirmOrderAsSupervisor à la place.
  // L'admin (isAdmin via requireAdmin) a un accès 100 % inchangé.
  const { data: callerProfile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()) as { data: { role: string } | null; error: unknown }

  const isAdmin = callerProfile?.role === 'admin'

  if (!isAdmin) {
    // Les non-admins ne peuvent ni atteindre delivered (déclencheur commission), ni
    // écrire cod_received, ni shipped, ni returned, ni cancelled via cette action large.
    // Ils DOIVENT utiliser confirmOrderAsSupervisor (action étroite gated par capacité).
    const FORBIDDEN_FOR_NON_ADMIN: string[] = [
      'delivered', 'shipped', 'returned', 'cancelled',
    ]
    if (FORBIDDEN_FOR_NON_ADMIN.includes(newStatus)) {
      return fail('Accès refusé : cette transition est réservée aux administrateurs.')
    }
    if (options?.codReceived != null) {
      return fail('Accès refusé : l\'encaissement COD est réservé aux administrateurs.')
    }
    // Seul newStatus = 'confirmed' depuis pending_confirmation reste possible pour
    // un non-admin, via la capacité confirm_cod_orders / confirm_affiliate_orders.
    // On délègue la vérification de capacité à confirmOrderAsSupervisor ; si quelqu'un
    // appelle updateOrderStatus directement avec confirmed, on bloque aussi ici pour
    // forcer l'usage de l'action étroite (garde-fou de surface d'attaque).
    return fail('Accès refusé : utilisez l\'action de confirmation superviseur.')
  }

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

  // RÈGLE ARGENT n°4 — cash COD encaissé validé en CHAÎNE décimale stricte (money.ts),
  // passé verbatim à la colonne numeric : zéro parseFloat. Validé AVANT toute écriture
  // ou opération de stock (pas d'effet de bord sur une saisie invalide).
  let codReceivedValue: string | undefined
  if (options?.codReceived != null) {
    const r = parseMoneyInput(options.codReceived)
    if (!r.ok) return fail('Montant COD encaissé invalide.')
    codReceivedValue = r.value
  }

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
  if (codReceivedValue != null) update.cod_received = codReceivedValue
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
  // Accumulation en CENTIMES ENTIERS (zéro flottant), conversion en chaîne une
  // seule fois à la fin (invariant @finance pour les sommes multi-lignes).
  let totalCents = 0
  const lineItems = cartItems.map((item) => {
    const tier          = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice     = tier ? tier.price_per_unit : item.product.sell_price
    const subtotalCents = Math.round(unitPrice * 100) * item.quantity
    totalCents         += subtotalCents
    return {
      product_id:          item.product_id,
      quantity:            item.quantity,
      unit_price_snapshot: unitPrice,
      subtotal:            (subtotalCents / 100).toFixed(2),
      tier_label_snapshot: tier ? tier.label : 'Prix standard',
    }
  })

  const total = (totalCents / 100).toFixed(2)

  // C-B1 — coût fournisseur pré-rempli = Σ(factory_cost_mad × qty), centimes entiers.
  // Évite un gross_profit faux + un payout fournisseur à 0 sur les commandes directes
  // (miroirs auto-provisionnés). Modifiable ensuite par l'admin (updateWholesaleOrderCosts).
  const supplierCost = computeSupplierCostMad(
    cartItems.map((i) => ({ factory_cost_mad: i.product.factory_cost_mad, quantity: i.quantity })),
  )

  // ── Create wholesale_order ─────────────────────────────────────────────────
  const { data: newOrder, error: orderErr } = (await supabase
    .from('wholesale_orders')
    .insert({
      buyer_id:            buyerId,
      total_amount:        total,
      supplier_cost_mad:   supplierCost,
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
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, status, wholesale_access')
    .eq('id', user.id)
    .single()) as { data: { role: string; status: string; wholesale_access: boolean } | null; error: unknown }

  const hasWholesaleAccess = profile?.role === 'wholesaler' || profile?.wholesale_access === true
  if (!hasWholesaleAccess || profile?.status !== 'approved') {
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
    if (
      item.product.availability_type === 'local_stock' &&
      item.quantity > item.product.stock_count
    ) {
      return fail(
        `« ${item.product.name} » — Stock insuffisant — ${item.product.stock_count} unités disponibles.`
      )
    }
  }

  // Accumulation en CENTIMES ENTIERS (zéro flottant), conversion en chaîne une
  // seule fois à la fin (invariant @finance pour les sommes multi-lignes).
  let totalCents = 0
  const lineItems = cartItems.map((item) => {
    const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
    const subtotalCents = Math.round(unitPrice * 100) * item.quantity
    totalCents += subtotalCents
    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_snapshot: unitPrice,
      subtotal: (subtotalCents / 100).toFixed(2),
      tier_label_snapshot: tier ? tier.label : 'Prix standard',
    }
  })

  const total = (totalCents / 100).toFixed(2)

  const city         = ((formData.get('city') as string)?.trim()) || null
  const address      = ((formData.get('address') as string)?.trim()) || null
  const buyer_notes  = ((formData.get('buyer_notes') as string)?.trim()) || null

  // C-B1 — coût fournisseur pré-rempli = Σ(factory_cost_mad × qty), centimes entiers (idem ci-dessus).
  const supplierCost = computeSupplierCostMad(
    cartItems.map((i) => ({ factory_cost_mad: i.product.factory_cost_mad, quantity: i.quantity })),
  )

  const { data: newOrder, error: orderErr } = (await supabase
    .from('wholesale_orders')
    .insert({
      buyer_id: user.id,
      total_amount: total,
      supplier_cost_mad: supplierCost,
      status: 'pending',
      delivery_preference: 'delivery',
      city,
      address,
      buyer_notes,
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
  redirect(`/wholesale/orders/${newOrder.id}?submitted=1`)
}

// =============================================================================
// ADMIN — UPDATE WHOLESALE ORDER COST BREAKDOWN
// =============================================================================

/**
 * Admin updates the import cost breakdown for a wholesale order.
 * The trigger compute_wholesale_order_costs auto-derives total_cost_mad,
 * gross_profit_mad and gross_margin_percent on UPDATE.
 */
export async function updateWholesaleOrderCosts(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const orderId = (formData.get('orderId') as string)?.trim()
  if (!orderId) return fail('Commande non spécifiée.')

  // RÈGLE ARGENT n°4 — coûts validés en CHAÎNE décimale stricte (money.ts), passés
  // verbatim aux colonnes numeric ; le trigger 025 recalcule la marge en SQL.
  // parseMoneyInput rejette les négatifs (vs l'ancien Math.max(0,…) qui les masquait).
  const supplierCostR  = parseMoneyInput(formData.get('supplier_cost_mad'))
  const transportR     = parseMoneyInput(formData.get('transport_customs_cost_mad'))
  const additionalR    = parseMoneyInput(formData.get('additional_cost_mad'))

  if (!supplierCostR.ok || !transportR.ok || !additionalR.ok) {
    return fail('Valeurs invalides — saisir des montants numériques.')
  }

  const supplier_cost_mad          = supplierCostR.value
  const transport_customs_cost_mad = transportR.value
  const additional_cost_mad        = additionalR.value

  const { error } = await supabase
    .from('wholesale_orders')
    .update({ supplier_cost_mad, transport_customs_cost_mad, additional_cost_mad })
    .eq('id', orderId)

  if (error) return fail(error.message)

  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath('/admin/wholesale-orders')
  revalidatePath('/admin/analytics')
  return ok
}

// FSM — la table de transitions vit dans `@/lib/wholesale-fsm` (module pur).
// Un fichier « use server » ne peut exporter que des fonctions async, pas une
// constante objet → la FSM est déportée et importée ici (et réutilisable au front).

// =============================================================================
// ADMIN — UPDATE WHOLESALE ORDER STATUS
// =============================================================================

/**
 * Update a wholesale order's status.
 * Enforces FSM transitions (server authority — LOT 2 M-1 fix).
 * Handles stock reserve/restore and audit trail in wholesale_order_status_history.
 *
 * On FSM violation the action returns { error: 'errors.fsm_transition_invalid' }
 * so callers can map the key to their i18n namespace.
 */
export async function updateWholesaleOrderStatus(
  orderId: string,
  newStatus: WholesaleOrderStatus,
  notes?: string
): Promise<ActionState> {
  const { supabase, error: authError, userId } = await requireAdmin({ allowAgent: true })
  if (authError || !userId) return fail(authError ?? 'errors.unauthenticated')

  // ── DURCISSEMENT NON-ADMIN ────────────────────────────────────────────────
  // Un agent (role='agent') ne peut PAS appeler cette action large — il doit passer
  // par confirmWholesaleAsSupervisor (action étroite gated par confirm_wholesale_orders).
  // L'admin a un accès 100 % inchangé.
  const { data: callerProfileWs } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()) as { data: { role: string } | null; error: unknown }

  if (callerProfileWs?.role !== 'admin') {
    return fail('errors.admin_only')
  }

  // ── FSM guard côté action (fail-fast UX) — le RPC re-valide côté DB ──────
  // On lit le statut courant pour fournir un retour rapide avant le round-trip RPC.
  const { data: order } = (await supabase
    .from('wholesale_orders')
    .select('status')
    .eq('id', orderId)
    .single()) as { data: { status: WholesaleOrderStatus } | null; error: unknown }

  if (!order) return fail('errors.order_not_found')
  if (order.status === newStatus) return fail('errors.status_already_set')

  // ── FSM guard (M-1) — validé côté action ET côté RPC (defence in depth) ──
  if (!isFsmTransitionAllowed(order.status, newStatus)) {
    return fail('errors.fsm_transition_invalid')
  }

  // ── Délégation atomique au RPC Postgres (migration 061) ───────────────────
  // Le RPC exécute en une seule transaction : verrou FOR UPDATE, stock
  // reserve/restore, UPDATE commande (timestamps inclus), INSERT history.
  // AUCUNE colonne financière touchée — trigger compute_wholesale_order_costs intangible.
  const { error: rpcErr } = await supabase.rpc('transition_wholesale_order_status', {
    p_order_id:   orderId,
    p_new_status: newStatus,
    p_notes:      notes ?? null,
  })

  if (rpcErr) {
    const msg = rpcErr.message ?? 'errors.update_failed'
    const key = msg.match(/errors\.[a-z_]+/)?.[0] ?? 'errors.update_failed'
    return fail(key)
  }

  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath(`/wholesale/orders`)
  return ok
}

// =============================================================================
// ADMIN / AGENT — ASSIGN WHOLESALE ORDER (LOT 2)
// =============================================================================

/**
 * Assign a wholesale order to a field agent (or re-assign).
 *
 * Guard: caller must be admin OR a team_members active member with
 * assign_orders=true (checked via SQL helper can_assign_orders).
 *
 * FSM: only transitions to 'assigned' when the current status allows it
 * (pending, confirmed — see WHOLESALE_ORDER_FSM). If the order is already
 * 'assigned' to a different agent, the order is re-assigned without FSM
 * re-transition (agent_id + assigned_at are updated, no duplicate history row
 * for the status if it's already 'assigned').
 *
 * Idempotence: re-assigning the SAME agent is a no-op (returns ok silently).
 */
export async function assignWholesaleOrder(
  orderId: string,
  assigneeId: string,
): Promise<ActionState> {
  // ── Input validation ──────────────────────────────────────────────────────
  if (!orderId?.trim())    return fail('errors.order_id_required')
  if (!assigneeId?.trim()) return fail('errors.assignee_id_required')

  const { supabase, error: authError, userId } = await requireAdmin({ allowAgent: true })
  if (authError || !userId) return fail(authError ?? 'errors.unauthenticated')

  // ── FSM guard côté action (fail-fast UX) — le RPC re-valide côté DB ──────
  // Lecture anticipée pour un retour rapide avant le round-trip RPC.
  const { data: order } = (await supabase
    .from('wholesale_orders')
    .select('status, agent_id')
    .eq('id', orderId)
    .single()) as { data: { status: WholesaleOrderStatus; agent_id: string | null } | null; error: unknown }

  if (!order) return fail('errors.order_not_found')

  // Idempotence côté action (évite un aller-retour RPC inutile)
  if (order.agent_id === assigneeId && order.status === 'assigned') {
    return ok
  }

  if (order.status !== 'assigned' && !isFsmTransitionAllowed(order.status, 'assigned')) {
    return fail('errors.fsm_transition_invalid')
  }

  // ── Délégation atomique au RPC Postgres (migration 061) ───────────────────
  // Le RPC exécute en une seule transaction : garde can_assign_orders,
  // vérification rôle assignee (IMP-1), verrou FOR UPDATE, FSM, UPDATE, INSERT history.
  const { error: rpcErr } = await supabase.rpc('assign_wholesale_order_atomic', {
    p_order_id: orderId,
    p_assignee: assigneeId,
    p_notes:    null,
  })

  if (rpcErr) {
    const msg = rpcErr.message ?? 'errors.update_failed'
    const key = msg.match(/errors\.[a-z_]+/)?.[0] ?? 'errors.update_failed'
    return fail(key)
  }

  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  return ok
}

// =============================================================================
// ADMIN — UPDATE WHOLESALE ORDER IMPORT STATUS
// =============================================================================

/**
 * Admin sets / updates the import progress status for a wholesale order.
 * Every change is appended to wholesale_order_import_history for full audit.
 */
export async function updateWholesaleImportStatus(
  orderId: string,
  importStatus: WholesaleImportStatus,
  notes?: string
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin({ allowAgent: true })
  if (authError) return fail(authError)

  const { data: { user } } = await supabase.auth.getUser()

  const { error: updateErr } = await supabase
    .from('wholesale_orders')
    .update({ import_status: importStatus })
    .eq('id', orderId)

  if (updateErr) return fail(updateErr.message)

  await supabase.from('wholesale_order_import_history').insert({
    order_id:      orderId,
    import_status: importStatus,
    changed_by:    user?.id ?? null,
    notes:         notes || null,
  })

  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/wholesale/orders/${orderId}`)
  return ok
}

// =============================================================================
// ADMIN — UPDATE WHOLESALE ORDER PAYMENT STATUS
// =============================================================================

export type PaymentFormState = { error: string | null; success?: boolean }

/**
 * Admin updates the payment tracking for a wholesale order.
 * Every change is appended to wholesale_order_payment_history.
 * Remaining balance = total_amount − deposit_received_amount (computed client-side).
 */
export async function updateWholesalePaymentStatus(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Erreur.' }

  const orderId = (formData.get('orderId') as string)?.trim()
  if (!orderId) return { error: 'Commande non spécifiée.' }

  const paymentStatus = formData.get('payment_status') as WholesalePaymentStatus
  const validStatuses: WholesalePaymentStatus[] = [
    'no_deposit', 'deposit_requested', 'deposit_received', 'fully_paid',
  ]
  if (!validStatuses.includes(paymentStatus)) {
    return { error: 'Statut de paiement invalide.' }
  }

  const notes = (formData.get('notes') as string)?.trim() || null

  // RÈGLE ARGENT n°4 — ZÉRO parseFloat sur de l'argent. Les montants sont validés
  // en CHAÎNE décimale stricte (money.ts) et passés VERBATIM aux colonnes numeric
  // (exactitude décimale, aucun arrondi flottant). Cf. LOT 4.2-B.
  //
  // deposit_amount (acompte DEMANDÉ) reste nullable : champ vide → null (pas '0',
  // car « aucun acompte demandé » ≠ « acompte de 0 »).
  const depositAmountRaw = (formData.get('deposit_amount') as string)?.trim() ?? ''
  let deposit_amount: string | null
  if (depositAmountRaw === '') {
    deposit_amount = null
  } else {
    const parsed = parseMoneyInput(depositAmountRaw)
    if (!parsed.ok) return { error: 'Montant de l\'acompte invalide.' }
    deposit_amount = parsed.value
  }

  // deposit_received_amount (montant REÇU) : champ vide → '0' (reçu nul par défaut).
  const receivedParsed = parseMoneyInput(formData.get('deposit_received_amount'))
  if (!receivedParsed.ok) return { error: 'Montant reçu invalide.' }
  const deposit_received_amount = receivedParsed.value

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    payment_status: paymentStatus,
    deposit_amount,
    deposit_received_amount,
  }

  if (paymentStatus === 'deposit_requested' || paymentStatus === 'deposit_received' || paymentStatus === 'fully_paid') {
    if (!update.deposit_requested_at) {
      // Only set if not yet set — read current value first
      const { data: current } = await supabase
        .from('wholesale_orders')
        .select('deposit_requested_at')
        .eq('id', orderId)
        .single() as { data: { deposit_requested_at: string | null } | null; error: unknown }
      if (!current?.deposit_requested_at) {
        update.deposit_requested_at = now
      }
    }
  }
  if (paymentStatus === 'deposit_received' || paymentStatus === 'fully_paid') {
    const { data: current } = await supabase
      .from('wholesale_orders')
      .select('deposit_received_at')
      .eq('id', orderId)
      .single() as { data: { deposit_received_at: string | null } | null; error: unknown }
    if (!current?.deposit_received_at) {
      update.deposit_received_at = now
    }
  }
  if (paymentStatus === 'fully_paid') {
    const { data: current } = await supabase
      .from('wholesale_orders')
      .select('fully_paid_at')
      .eq('id', orderId)
      .single() as { data: { fully_paid_at: string | null } | null; error: unknown }
    if (!current?.fully_paid_at) {
      update.fully_paid_at = now
    }
  }

  const { error: updateErr } = await supabase
    .from('wholesale_orders')
    .update(update)
    .eq('id', orderId)

  if (updateErr) return { error: updateErr.message }

  await supabase.from('wholesale_order_payment_history').insert({
    order_id:               orderId,
    payment_status:         paymentStatus,
    deposit_amount:         deposit_amount,
    deposit_received_amount: deposit_received_amount,
    changed_by:             userId,
    notes,
  })

  // ── [LOT 4.2-C] Raccord paiement → collecte cash livraison ─────────────────
  // E1-bis : collecte AUTO sur seuil, sans clic de confirmation. Le RPC (065)
  // décide SEUL en SQL si le seuil deposit >= total_amount + delivery_rebill_mad
  // est atteint (C-B1 : aucun calcul de seuil en JS). Il est idempotent (EXISTS
  // + index partiel + EXCEPTION) → chaque mise à jour paiement le re-tente.
  //
  // C-A2 / E5 — NON-FATAL : la mise à jour paiement est DÉJÀ persistée ci-dessus ;
  // un échec de collecte ne doit JAMAIS la faire échouer. On log côté serveur,
  // on n'expose rien à l'UI, on ne `return` pas. Le prochain appel rejoue.
  try {
    const { error: collectErr } = await supabase
      .rpc('try_collect_wholesale_delivery_rebill', { p_order_id: orderId })
    if (collectErr) {
      console.error('[4.2-C] try_collect_wholesale_delivery_rebill failed', {
        orderId, message: collectErr.message,
      })
    }
  } catch (e) {
    console.error('[4.2-C] try_collect_wholesale_delivery_rebill threw', {
      orderId, error: e instanceof Error ? e.message : String(e),
    })
  }

  // ── [LOT 4.2-C / E3-bis] Détection sous-collatéralisation post-collecte ────
  // Si l'admin baisse deposit_received_amount SOUS le seuil APRÈS une collecte :
  // pas de dé-collecte (ledger append-only), on ALERTE seulement. En 4.2 = log
  // serveur best-effort ; l'alerting réel (in-app + Telegram) arrive au LOT 6.
  // Le seuil est comparé EN SQL par la fonction 067 (C-B1, jamais en JS).
  try {
    const { data: under } = await supabase
      .rpc('is_wholesale_delivery_undercollateralized', { p_order_id: orderId })
    if (under === true) {
      console.warn('[4.2-C][E3-bis] under-collateralized after collection', {
        orderId, changedBy: userId,
      })
    }
  } catch (e) {
    console.error('[4.2-C][E3-bis] detection failed', {
      orderId, error: e instanceof Error ? e.message : String(e),
    })
  }

  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/wholesale/orders/${orderId}`)
  revalidatePath('/admin/analytics')
  return { error: null, success: true }
}

// =============================================================================
// ADMIN — CONFIGURER LA LIVRAISON D'UNE COMMANDE WHOLESALE (LOT 4.2-B)
// =============================================================================

// Valeurs autorisées — répliquent les CHECK de la migration 062.
const WHOLESALE_LOGISTICS_MODES = ['pickup_by_runner', 'supplier_fleet'] as const
const WHOLESALE_DELIVERY_HANDLINGS = ['rebilled_client', 'supplier_billed', 'supplier_free'] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mappe le message d'erreur d'un RPC livraison vers une clé i18n `errors.*`.
 * Les RPC (065) lèvent déjà des `errors.<clé>` ; le CHECK 062
 * (`wholesale_delivery_no_mozouna_loss`) lève un nom de contrainte qu'on traduit.
 */
function mapDeliveryRpcError(message: string | undefined): string {
  const msg = message ?? ''
  const key = msg.match(/errors\.[a-z_]+/)?.[0]
  if (key) return key
  if (msg.includes('wholesale_delivery_no_mozouna_loss')) return 'errors.rebill_below_cost'
  return 'errors.update_failed'
}

/**
 * Admin — configure le mode logistique, le traitement du coût livraison et les
 * montants (coût / refacturation) d'une commande grossiste.
 *
 * Délègue intégralement l'écriture au RPC `set_wholesale_delivery_config` (065,
 * audité @finance/@security) : config + maintien du ledger cash par DELTA, le
 * tout atomique et idempotent. AUCUNE colonne de marge touchée (trigger 025
 * intangible). Cette action n'est qu'un adaptateur typé/validé au-dessus du RPC.
 *
 * RÈGLE ARGENT : les montants sont validés en CHAÎNE décimale stricte
 * (`parseMoneyInput`, zéro `parseFloat`, condition @finance C-Z1/C4) et passés
 * verbatim au paramètre `numeric` du RPC.
 *
 * Garde : admin seul (contrat 4.2-A — config/collecte cash réservées admin). Le
 * RPC re-vérifie `my_role()='admin'` côté DB (SECURITY DEFINER bypasse RLS).
 */
export async function setWholesaleDeliveryConfig(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return fail(authError ?? 'errors.unauthenticated')

  const orderId = (formData.get('orderId') as string)?.trim()
  if (!orderId) return fail('errors.order_id_required')

  // ── Traitement du coût livraison (enum 062) ───────────────────────────────
  const handling = (formData.get('delivery_cost_handling') as string)?.trim()
  if (!(WHOLESALE_DELIVERY_HANDLINGS as readonly string[]).includes(handling)) {
    return fail('errors.invalid_delivery_handling')
  }

  // ── Mode logistique : optionnel, mais s'il est fourni il doit être valide ──
  const logisticsRaw = (formData.get('logistics_mode') as string)?.trim() || null
  if (logisticsRaw !== null && !(WHOLESALE_LOGISTICS_MODES as readonly string[]).includes(logisticsRaw)) {
    return fail('errors.invalid_logistics_mode')
  }

  // ── Montants — validation décimale stricte, ZÉRO parseFloat (C-Z1/C4) ──────
  let cost = '0'
  let rebill = '0'
  if (handling === 'rebilled_client') {
    const c = parseMoneyInput(formData.get('delivery_cost_mad'))
    if (!c.ok) return fail(c.error)
    const r = parseMoneyInput(formData.get('delivery_rebill_mad'))
    if (!r.ok) return fail(r.error)
    cost = c.value
    rebill = r.value
  }
  // supplier_billed / supplier_free : Mozouna ne paie rien et ne refacture rien.
  // On force 0/0 (le CHECK 062 l'impose) — un form obsolète ne peut pas glisser
  // un montant sous ces traitements. L'invariant rebill ≥ cost reste validé par
  // le CHECK côté DB pour le cas rebilled_client (→ errors.rebill_below_cost).

  // ── Clé d'événement (idempotence DELTA) ───────────────────────────────────
  // Neuf par soumission, STABLE au retry : si l'UI fournit un uuid caché (re-submit
  // du même formulaire) on le réutilise → ON CONFLICT DO NOTHING dédoublonne ;
  // sinon l'action en génère un frais (contrat 4.2-A).
  const eventRaw = (formData.get('cost_event_uuid') as string)?.trim() ?? ''
  const costEventUuid = UUID_RE.test(eventRaw) ? eventRaw : crypto.randomUUID()

  const { error: rpcErr } = await supabase.rpc('set_wholesale_delivery_config', {
    p_order_id:        orderId,
    p_logistics_mode:  logisticsRaw,
    p_handling:        handling,
    p_cost_mad:        cost,    // chaîne décimale exacte → numeric Postgres
    p_rebill_mad:      rebill,  // idem
    p_cost_event_uuid: costEventUuid,
  })

  if (rpcErr) return fail(mapDeliveryRpcError(rpcErr.message))

  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath('/admin/wholesale-orders')
  revalidatePath('/admin/analytics')
  return ok
}

// =============================================================================
// WHOLESALER — SOUMETTRE UN JUSTIFICATIF DE PAIEMENT
// =============================================================================

/**
 * Wholesaler submits a payment proof for one of their wholesale orders.
 * Accepts file upload to order-proofs bucket or fallback URL.
 * Ownership is verified via .eq('buyer_id', user.id) before insert.
 */
export async function addWholesaleOrderProof(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const orderId   = (formData.get('orderId') as string)?.trim()
  const proofType = (formData.get('proofType') as string)?.trim()
  const notes     = (formData.get('notes') as string)?.trim() || null

  if (!orderId)   return fail('Commande non spécifiée.')
  if (!proofType) return fail('Type de preuve requis.')

  const ALLOWED: string[] = ['bank_receipt', 'transfer_proof', 'other']
  if (!ALLOWED.includes(proofType)) return fail('Type de preuve invalide.')

  // Verrou propriété — le grossiste ne peut attacher une preuve qu'à ses propres commandes
  const { data: order } = await supabase
    .from('wholesale_orders')
    .select('id')
    .eq('id', orderId)
    .eq('buyer_id', user.id)
    .single()

  if (!order) return fail('Commande introuvable.')

  // File upload (priority) — falls back to URL field
  const file = formData.get('file') as File | null
  let resolvedUrl: string | null = null

  if (file && file.size > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const storagePath = `${orderId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('order-proofs')
      .upload(storagePath, arrayBuffer, { contentType: file.type || `application/${ext}`, upsert: false })

    if (uploadErr) return fail(`Erreur upload : ${uploadErr.message}`)

    const { data: urlData } = supabase.storage.from('order-proofs').getPublicUrl(storagePath)
    resolvedUrl = urlData.publicUrl
  } else {
    const fallbackUrl = (formData.get('fileUrl') as string)?.trim()
    if (!fallbackUrl) return fail('Fichier ou URL requis.')
    resolvedUrl = fallbackUrl
  }

  const { error } = await supabase.from('order_proofs').insert({
    related_wholesale_order_id: orderId,
    proof_type:  proofType,
    file_url:    resolvedUrl,
    uploaded_by: user.id,
    notes,
  })

  if (error) return fail(error.message)

  revalidatePath(`/wholesale/orders/${orderId}`)
  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  return ok
}

export async function cancelWholesaleOrderBuyer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const orderId = (formData.get('orderId') as string)?.trim()
  if (!orderId) return fail('Commande non spécifiée.')

  const { data: order } = await supabase
    .from('wholesale_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('buyer_id', user.id)
    .single()

  if (!order) return fail('Commande introuvable.')
  if (order.status !== 'pending') return fail('Cette commande ne peut plus être annulée.')

  const { error } = await supabase
    .from('wholesale_orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)

  if (error) return fail(error.message)

  revalidatePath(`/wholesale/orders/${orderId}`)
  revalidatePath('/wholesale/orders')
  return ok
}

export async function updateWholesaleOrderBuyerNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const orderId = (formData.get('orderId') as string)?.trim()
  const note = (formData.get('buyer_notes') as string)?.trim() || null
  if (!orderId) return fail('Commande non spécifiée.')

  const { data: order } = await supabase
    .from('wholesale_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('buyer_id', user.id)
    .single()

  if (!order) return fail('Commande introuvable.')
  if (order.status !== 'pending') return fail('Cette commande ne peut plus être modifiée.')

  const { error } = await supabase
    .from('wholesale_orders')
    .update({ buyer_notes: note })
    .eq('id', orderId)

  if (error) return fail(error.message)

  revalidatePath(`/wholesale/orders/${orderId}`)
  return ok
}

// =============================================================================
// ADMIN / AGENT — ASSIGN SUPPLIER TO WHOLESALE ORDER (LOT 3a)
// =============================================================================

/**
 * Assign a supplier profile to a wholesale order.
 * Only admin or agent-with-assign_orders permission can call this.
 *
 * Guard: requireAdmin({ allowAgent: true }) + can_assign_orders RPC (same as
 * assignWholesaleOrder). The supplier profile must exist and have role='supplier'.
 *
 * Idempotence: re-assigning the same supplier is a no-op (returns ok silently).
 *
 * Does NOT touch: status, amounts, agent_id, buyer_id, or any financial column.
 * LOT 6 : notifie le fournisseur + admin(s) (+ agent si notifyAgent) en best-effort
 * APRÈS l'update — n'altère jamais l'assignation (notif = lecture + insert + message).
 */
export async function assignSupplierToOrder(
  orderId: string,
  supplierId: string,
  opts?: { notifyAgent?: boolean },
): Promise<ActionState> {
  // ── Input validation ──────────────────────────────────────────────────────
  if (!orderId?.trim())    return fail('errors.order_id_required')
  if (!supplierId?.trim()) return fail('errors.supplier_id_required')

  const { supabase, error: authError, userId } = await requireAdmin({ allowAgent: true })
  if (authError || !userId) return fail(authError ?? 'errors.unauthenticated')

  // ── Permission guard : admin OR team member with assign_orders ────────────
  const { data: canAssign, error: permErr } = (await supabase.rpc('can_assign_orders', {
    uid: userId,
  })) as { data: boolean | null; error: unknown }

  if (permErr || !canAssign) return fail('errors.forbidden_assign_orders')

  // ── Verify supplierId exists AND has role='supplier' ──────────────────────
  // Sécurité : on n'assigne jamais un non-fournisseur comme supplier_id —
  // sinon ce profil hériterait de la policy SELECT supplier_read_own sur la
  // commande, exposant potentiellement des données sensibles.
  const { data: supplierProfile } = (await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', supplierId)
    .single()) as { data: { id: string; role: string } | null; error: unknown }

  if (!supplierProfile || supplierProfile.role !== 'supplier')
    return fail('errors.supplier_not_found')

  // ── Fetch current order state ─────────────────────────────────────────────
  const { data: order } = (await supabase
    .from('wholesale_orders')
    .select('id, supplier_id')
    .eq('id', orderId)
    .single()) as { data: { id: string; supplier_id: string | null } | null; error: unknown }

  if (!order) return fail('errors.order_not_found')

  // ── Idempotence : même fournisseur déjà assigné ──────────────────────────
  if (order.supplier_id === supplierId) {
    return ok
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('wholesale_orders')
    .update({
      supplier_id:          supplierId,
      supplier_assigned_at: now,
    })
    .eq('id', orderId)

  if (updateErr) return fail('errors.update_failed')

  // LOT 6 — notif best-effort (ne throw jamais, n'altère pas l'assignation).
  await notifyOrderAssigned(orderId, { notifyAgent: opts?.notifyAgent ?? false })

  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  return ok
}

// =============================================================================
// SUPPLIER — RESPOND TO WHOLESALE ORDER (LOT 3a)
// =============================================================================

/**
 * Supplier submits their response to an assigned wholesale order.
 * Delegates to the SECURITY DEFINER RPC respond_to_wholesale_order which
 * enforces ownership (supplier_id = auth.uid()) and writes ONLY the 3
 * response columns — never status, amounts, agent_id or any other field.
 *
 * The RPC raises named exceptions (errors.*) on validation failure; we
 * propagate them as-is so the frontend can map them to i18n keys.
 */
export async function respondToWholesaleOrder(
  orderId: string,
  response: SupplierResponse,
  leadTimeDays: number,
): Promise<ActionState> {
  // ── Input validation (server-side, before RPC) ────────────────────────────
  if (!orderId?.trim()) return fail('errors.order_id_required')

  const VALID_RESPONSES: SupplierResponse[] = ['available', 'preparing', 'on_order']
  if (!VALID_RESPONSES.includes(response)) return fail('errors.invalid_supplier_response')

  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0)
    return fail('errors.invalid_lead_time')

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('errors.unauthenticated')

  // ── Role guard : supplier only ────────────────────────────────────────────
  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null; error: unknown }

  if (profile?.role !== 'supplier') return fail('errors.forbidden_supplier_only')

  // ── Delegate to SECURITY DEFINER RPC ─────────────────────────────────────
  // The RPC re-validates ownership and columns — this is defence in depth.
  const { error: rpcErr } = await supabase.rpc('respond_to_wholesale_order', {
    p_order_id:       orderId,
    p_response:       response,
    p_lead_time_days: leadTimeDays,
  })

  if (rpcErr) {
    // RPC raises named exceptions; surface the message as an i18n key
    const msg = rpcErr.message ?? 'errors.update_failed'
    // The message may be the bare key (e.g. 'errors.order_not_found') or
    // wrapped in Postgres error text — extract the key portion.
    const key = msg.match(/errors\.[a-z_]+/)?.[0] ?? 'errors.update_failed'
    return fail(key)
  }

  revalidatePath(`/admin/wholesale-orders/${orderId}`)
  revalidatePath('/supplier/orders')
  return ok
}
