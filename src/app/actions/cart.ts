'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
