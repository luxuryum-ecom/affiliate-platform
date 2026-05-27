import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { CartItemRow } from '@/components/wholesale/cart-item-row'
import { WhatsAppButton } from '@/components/wholesale/whatsapp-button'
import type { WholesaleCartItemWithProduct } from '@/types/database'

export const metadata = {
  title: 'Mon panier — Espace Grossiste',
}

export default async function WholesaleCartPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileResult, cartResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase
      .from('wholesale_cart_items')
      .select('*, product:products(*)')
      .eq('buyer_id', user!.id)
      .order('added_at', { ascending: true }),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const items = (cartResult.data ?? []) as unknown as WholesaleCartItemWithProduct[]

  // Server-side total — accurate snapshot used for WhatsApp message
  const total = items.reduce((sum, item) => {
    const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
    const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
    return sum + unitPrice * item.quantity
  }, 0)

  const WHATSAPP_PHONE =
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/wholesale/products"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Catalogue
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mon panier</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-6">
          Mon panier
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({items.length} article{items.length !== 1 ? 's' : ''})
            </span>
          )}
        </h1>

        {items.length === 0 ? (
          /* Empty cart */
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-4">
            <p className="text-3xl">🛒</p>
            <p className="text-sm text-gray-500">Votre panier est vide.</p>
            <Link
              href="/wholesale/products"
              className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Parcourir le catalogue
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cart items */}
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow key={item.id} item={item} />
              ))}
            </div>

            {/* Order summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Récapitulatif</h2>

              {/* Line items */}
              <ul className="space-y-2">
                {items.map((item) => {
                  const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
                  const unitPrice = tier ? tier.price_per_unit : item.product.sell_price
                  const subtotal = unitPrice * item.quantity
                  return (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate max-w-[60%]">
                        {item.product.name}{' '}
                        <span className="text-gray-400">× {item.quantity}</span>
                      </span>
                      <span className="font-medium text-gray-900">{formatMAD(subtotal)}</span>
                    </li>
                  )
                })}
              </ul>

              {/* Total */}
              <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total estimé</span>
                <span className="text-xl font-bold text-gray-900">{formatMAD(total)}</span>
              </div>

              <p className="text-xs text-gray-400">
                Les prix sont calculés selon les paliers actifs. Le total se met à jour après
                chaque modification de quantité.
              </p>

              {/* WhatsApp CTA */}
              <WhatsAppButton
                items={items}
                total={total}
                phone={WHATSAPP_PHONE}
              />

              {/* Continue shopping */}
              <Link
                href="/wholesale/products"
                className="block text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                ← Continuer mes achats
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
