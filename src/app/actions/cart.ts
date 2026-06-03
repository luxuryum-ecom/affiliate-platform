'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { catalogNameMatchesProduct, getSupplierProductCtaMode } from '@/lib/wholesale-cta'
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

  const lookupName = supplierProduct.public_name || supplierProduct.product_name

  const { data: exactMatches } = (await supabase
    .from('products')
    .select('id, name, wholesale_min_qty, stock_count')
    .eq('active', true)
    .eq('approval_status', 'approved')
    .eq('availability_type', 'local_stock')
    .ilike('name', lookupName.trim())) as {
    data: Pick<Product, 'id' | 'name' | 'wholesale_min_qty' | 'stock_count'>[] | null
    error: unknown
  }

  const catalogProduct =
    exactMatches?.find((p) => catalogNameMatchesProduct(p, lookupName)) ??
    exactMatches?.[0] ??
    null

  if (!catalogProduct) {
    return {
      error:
        'Commande panier indisponible pour ce produit marketplace. Utilisez « Demander un devis » ou le catalogue Mozouna.',
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
