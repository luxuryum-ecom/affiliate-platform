import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import type { Product, WholesaleCartItem } from '@/types/database'

export const metadata = {
  title: 'Catalogue — Espace Grossiste',
}

export default async function WholesaleProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [profileResult, productsResult, cartResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('wholesale_cart_items')
      .select('*')
      .eq('buyer_id', user!.id),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const products = (productsResult.data ?? []) as Product[]
  const cartItems = (cartResult.data ?? []) as WholesaleCartItem[]

  // Build a quick lookup: productId → qty in cart
  const cartMap = new Map(cartItems.map((c) => [c.product_id, c.quantity]))
  const cartCount = cartItems.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/wholesale/dashboard"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Catalogue</span>
          </div>
          <div className="flex items-center gap-3">
            {cartCount > 0 && (
              <Link
                href="/wholesale/cart"
                className="flex items-center gap-1.5 text-sm text-gray-700 font-medium hover:text-gray-900 transition-colors"
              >
                🛒
                <span className="text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded-full">
                  {cartCount}
                </span>
              </Link>
            )}
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Catalogue grossiste</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {products.length} produit{products.length !== 1 ? 's' : ''} disponible
              {products.length !== 1 ? 's' : ''}.
            </p>
          </div>
          {cartCount > 0 && (
            <Link
              href="/wholesale/cart"
              className="shrink-0 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Voir le panier ({cartCount})
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun produit disponible pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const inCart = cartMap.get(product.id)
              // Cheapest available tier price for display
              const lowestTier =
                product.wholesale_tiers.length > 0
                  ? getWholesaleTier(
                      product.wholesale_tiers,
                      product.wholesale_tiers[product.wholesale_tiers.length - 1].min_qty
                    )
                  : null
              const displayPrice = lowestTier?.price_per_unit ?? product.sell_price

              return (
                <WholesaleProductCard
                  key={product.id}
                  product={product}
                  displayPrice={displayPrice}
                  hasTiers={product.wholesale_tiers.length > 0}
                  inCartQty={inCart}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────

function WholesaleProductCard({
  product,
  displayPrice,
  hasTiers,
  inCartQty,
}: {
  product: Product
  displayPrice: number
  hasTiers: boolean
  inCartQty: number | undefined
}) {
  const thumb = product.images[0]

  return (
    <Link
      href={`/wholesale/products/${product.id}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-300">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        {/* In-cart badge */}
        {inCartQty != null && (
          <div className="absolute top-2 right-2 bg-gray-900 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {inCartQty} au panier
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              product.type === 'local'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}
          >
            {product.type === 'local' ? 'Local' : 'Importé'}
          </span>
          {hasTiers && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Paliers
            </span>
          )}
        </div>

        <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">
          {product.name}
        </h3>

        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">
              {hasTiers ? 'À partir de' : 'Prix / unité'}
            </p>
            <p className="text-base font-bold text-gray-900">{formatMAD(displayPrice)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Min. commande</p>
            <p className="text-sm font-medium text-gray-700">{product.wholesale_min_qty} u.</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
