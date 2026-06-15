'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import { findCatalogLink } from '@/lib/wholesale-catalog-link'
import type { Product } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CartState = { error: string | null; success: boolean }

// ─── Add / upsert ─────────────────────────────────────────────────────────────

/**
 * Add a product to the cart, or update quantity if already present.
 * Uses the UNIQUE(buyer_id, product_id) constraint for upsert.
 * Signature follows useActionState: (prevState, formData) => Promise<State>
 */
export async function addToCart(
  _prevState: CartState,
  formData: FormData
): Promise<CartState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.', success: false }

  const productId = (formData.get('productId') as string)?.trim()
  const quantity = parseInt(formData.get('quantity') as string, 10)

  if (!productId) return { error: 'Produit introuvable.', success: false }
  if (isNaN(quantity) || quantity < 1)
    return { error: 'Quantité invalide.', success: false }

  const { data: product } = (await supabase
    .from('products')
    .select('stock_count, availability_type')
    .eq('id', productId)
    .eq('active', true)
    .single()) as { data: { stock_count: number; availability_type: string } | null; error: unknown }

  if (!product) return { error: 'Produit introuvable.', success: false }

  // Défense en profondeur : seul le stock local est commandable en direct. L'UI
  // (/wholesale/products/[id]) gate déjà via getCatalogProductCtaMode, mais sans
  // cette garde un import_on_demand pourrait être injecté au panier par appel
  // direct de l'action, puis rejeté seulement au checkout (submitWholesaleOrder).
  // Aligne addToCart sur addMarketplaceToCart et sur la garde de soumission.
  if (product.availability_type !== 'local_stock') {
    return {
      error: 'Ce produit nécessite une demande de devis (import ou prix sur mesure).',
      success: false,
    }
  }

  if (product.availability_type === 'local_stock' && quantity > product.stock_count) {
    return {
      error: `Stock insuffisant — ${product.stock_count} unités disponibles.`,
      success: false,
    }
  }

  const { error } = await supabase.from('wholesale_cart_items').upsert(
    { buyer_id: user.id, product_id: productId, quantity },
    { onConflict: 'buyer_id,product_id' }
  )

  if (error) return { error: error.message, success: false }

  revalidatePath('/wholesale/cart')
  return { error: null, success: true }
}

/**
 * Marketplace local-stock direct order: resolves linked internal catalogue SKU, then upserts cart.
 */
export async function addMarketplaceToCart(
  _prevState: CartState,
  formData: FormData
): Promise<CartState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.', success: false }

  const supplierProductId = (formData.get('supplierProductId') as string)?.trim()
  const quantity = parseInt(formData.get('quantity') as string, 10)

  if (!supplierProductId) return { error: 'Produit introuvable.', success: false }
  if (isNaN(quantity) || quantity < 1) return { error: 'Quantité invalide.', success: false }

  const { data: supplierProduct } = (await supabase
    .from('supplier_products_wholesaler_read')
    .select(
      'id, product_name, public_name, availability_type, suggested_wholesale_price_mad, stock_quantity, min_quantity'
    )
    .eq('id', supplierProductId)
    .single()) as {
    data: {
      id: string
      product_name: string
      public_name: string | null
      availability_type: Product['availability_type']
      suggested_wholesale_price_mad: number | null
      stock_quantity: number | null
      min_quantity: number
    } | null
    error: unknown
  }

  if (!supplierProduct) return { error: 'Produit introuvable.', success: false }

  if (getSupplierProductCtaMode(supplierProduct) !== 'direct') {
    return {
      error: 'Ce produit nécessite une demande de devis (import ou prix sur mesure).',
      success: false,
    }
  }

  if (quantity < supplierProduct.min_quantity) {
    return {
      error: `Quantité minimum : ${supplierProduct.min_quantity} unités.`,
      success: false,
    }
  }

  if (
    supplierProduct.stock_quantity != null &&
    quantity > supplierProduct.stock_quantity
  ) {
    return {
      error: `Stock disponible : ${supplierProduct.stock_quantity} unités.`,
      success: false,
    }
  }

  // Miroir catalogue interne — MÊME résolution que celle qui gate le CTA côté page
  // (findCatalogLink), pour garantir une source de vérité unique : si la page affiche
  // « Commander en direct », c'est que ce miroir existe ; le checkout ne le contredit plus.
  const catalogProduct = await findCatalogLink(supabase, supplierProduct)

  if (!catalogProduct) {
    return {
      error:
        'Ce produit n\'est pas encore disponible en commande directe. Utilisez « Demander un devis » pour recevoir une offre de notre équipe.',
      success: false,
    }
  }

  if (quantity < catalogProduct.wholesale_min_qty) {
    return {
      error: `Quantité minimum catalogue : ${catalogProduct.wholesale_min_qty} unités.`,
      success: false,
    }
  }

  if (quantity > catalogProduct.stock_count) {
    return {
      error: `Stock catalogue : ${catalogProduct.stock_count} unités.`,
      success: false,
    }
  }

  const { error } = await supabase.from('wholesale_cart_items').upsert(
    { buyer_id: user.id, product_id: catalogProduct.id, quantity },
    { onConflict: 'buyer_id,product_id' }
  )

  if (error) return { error: error.message, success: false }

  revalidatePath('/wholesale/cart')
  revalidatePath('/wholesale/marketplace')
  return { error: null, success: true }
}

// ─── Update quantity ──────────────────────────────────────────────────────────

/**
 * Update quantity for a specific cart item.
 * If quantity < 1 the item is deleted.
 * Used as a direct form action (not useActionState).
 */
export async function updateCartQty(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const itemId = formData.get('itemId') as string
  const quantity = parseInt(formData.get('quantity') as string, 10)

  if (!itemId) return

  if (isNaN(quantity) || quantity < 1) {
    await supabase
      .from('wholesale_cart_items')
      .delete()
      .eq('id', itemId)
      .eq('buyer_id', user.id)
  } else {
    await supabase
      .from('wholesale_cart_items')
      .update({ quantity })
      .eq('id', itemId)
      .eq('buyer_id', user.id)
  }

  revalidatePath('/wholesale/cart')
}

// ─── Remove item ──────────────────────────────────────────────────────────────

/**
 * Remove a single cart item.
 * Used as a direct form action.
 */
export async function removeCartItem(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const itemId = formData.get('itemId') as string
  if (!itemId) return

  await supabase
    .from('wholesale_cart_items')
    .delete()
    .eq('id', itemId)
    .eq('buyer_id', user.id)

  revalidatePath('/wholesale/cart')
}
