'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseMoneyInput } from '@/lib/money'

export interface AffiliatePriceState {
  error: string | null
  success: boolean
  /** true when the action deleted the custom price (reset to platform price) */
  cleared: boolean
}

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
  const fail = (msg: string): AffiliatePriceState => ({ error: msg, success: false, cleared: false })
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

  if (profile?.role !== 'affiliate' || profile?.status !== 'approved') {
    return fail('Accès réservé aux affiliés approuvés.')
  }

  const productId = (formData.get('productId') as string)?.trim()
  if (!productId) return fail('Produit invalide.')

  const priceRaw = (formData.get('customSellPriceMad') as string)?.trim()

  // Empty value = clear custom price (reset to platform price)
  if (!priceRaw) {
    await supabase
      .from('affiliate_product_prices')
      .delete()
      .eq('affiliate_id', user.id)
      .eq('product_id', productId)
    revalidatePath('/affiliate/products')
    return { error: null, success: true, cleared: true }
  }

  // RÈGLE ARGENT n°4 — prix validé en chaîne décimale stricte (money.ts), stocké
  // verbatim ; Number() exact dérivé pour la seule comparaison au prix plateforme.
  // (Le champ vide est déjà géré plus haut → suppression du prix custom.)
  const priceResult = parseMoneyInput(priceRaw)
  if (!priceResult.ok || Number(priceResult.value) <= 0) return fail('Prix invalide.')
  const price = priceResult.value
  const priceNum = Number(price)

  const { data: product } = (await supabase
    .from('products_catalog_read') // dette 073 — vue redacted (zéro coût/marge)
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
    return fail('Produit non disponible.')
  }

  const platformPrice = Number(product.sell_price)
  if (priceNum < platformPrice) {
    return fail(`Prix minimum : ${platformPrice} MAD (prix plateforme). Vous ne pouvez pas vendre en dessous.`)
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

  if (upsertErr) return fail(upsertErr.message)

  revalidatePath('/affiliate/products')
  return { error: null, success: true, cleared: false }
}
