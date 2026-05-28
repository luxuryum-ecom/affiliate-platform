'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface AffiliatePriceState {
  error: string | null
  success: boolean
}

const initialState: AffiliatePriceState = { error: null, success: false }
export { initialState as affiliatePriceInitialState }

/**
 * Upsert or clear an affiliate's custom sell price for a product.
 *
 * Rules enforced server-side:
 *  - User must be an approved affiliate (read from session — form value ignored)
 *  - Product must be active, approved, and affiliate_enabled
 *  - Custom price must be >= product.sell_price
 *  - Empty/zero price deletes the row (resets to platform price)
 */
export async function saveAffiliateProductPrice(
  _prevState: AffiliatePriceState,
  formData: FormData
): Promise<AffiliatePriceState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.', success: false }

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()) as { data: { role: string; status: string } | null; error: unknown }

  if (profile?.role !== 'affiliate' || profile?.status !== 'approved') {
    return { error: 'Accès réservé aux affiliés approuvés.', success: false }
  }

  const productId = (formData.get('productId') as string)?.trim()
  if (!productId) return { error: 'Produit invalide.', success: false }

  const priceRaw = (formData.get('customSellPriceMad') as string)?.trim()

  // Empty value = clear custom price (reset to platform price)
  if (!priceRaw) {
    await supabase
      .from('affiliate_product_prices')
      .delete()
      .eq('affiliate_id', user.id)
      .eq('product_id', productId)
    revalidatePath('/affiliate/products')
    return { error: null, success: true }
  }

  const price = parseFloat(priceRaw)
  if (isNaN(price) || price <= 0) {
    return { error: 'Prix invalide.', success: false }
  }

  // Fetch product to validate eligibility and enforce minimum price
  const { data: product } = (await supabase
    .from('products')
    .select('sell_price, affiliate_enabled, active, approval_status')
    .eq('id', productId)
    .single()) as {
    data: {
      sell_price: number
      affiliate_enabled: boolean
      active: boolean
      approval_status: string
    } | null
    error: unknown
  }

  if (
    !product ||
    !product.affiliate_enabled ||
    !product.active ||
    product.approval_status !== 'approved'
  ) {
    return { error: 'Produit non disponible.', success: false }
  }

  const platformPrice = Number(product.sell_price)
  if (price < platformPrice) {
    return {
      error: `Prix minimum : ${platformPrice} MAD (prix plateforme). Vous ne pouvez pas vendre en dessous.`,
      success: false,
    }
  }

  const { error: upsertErr } = await supabase
    .from('affiliate_product_prices')
    .upsert(
      {
        affiliate_id: user.id,
        product_id: productId,
        custom_sell_price_mad: price,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'affiliate_id,product_id' }
    )

  if (upsertErr) return { error: upsertErr.message, success: false }

  revalidatePath('/affiliate/products')
  return { error: null, success: true }
}
