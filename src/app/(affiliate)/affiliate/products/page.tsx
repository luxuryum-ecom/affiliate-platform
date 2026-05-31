import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { CopyLinkButton } from '@/components/affiliate/copy-link-button'
import { AffiliatePriceForm } from '@/components/affiliate/affiliate-price-form'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD } from '@/lib/utils'
import type { Product } from '@/types/database'

export const metadata = {
  title: 'Catalogue produits — Espace Affilié',
}

interface ProductStats {
  clicks: number
  orders: number
  delivered: number
  commissionEarned: number
}

export default async function AffiliateProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  const [productsRes, customPricesRes, clicksRes, ordersRes, commissionsRes] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('affiliate_enabled', true)
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: Product[] | null; error: unknown }>,
    supabase
      .from('affiliate_product_prices')
      .select('product_id, custom_sell_price_mad')
      .eq('affiliate_id', user.id) as unknown as Promise<{
        data: { product_id: string; custom_sell_price_mad: number }[] | null
        error: unknown
      }>,
    supabase
      .from('affiliate_clicks')
      .select('product_id')
      .eq('affiliate_id', user.id) as unknown as Promise<{
        data: { product_id: string }[] | null
        error: unknown
      }>,
    supabase
      .from('orders')
      .select('product_id, status')
      .eq('affiliate_id', user.id) as unknown as Promise<{
        data: { product_id: string; status: string }[] | null
        error: unknown
      }>,
    supabase
      .from('commissions')
      .select('amount, order:orders!order_id(product_id)')
      .eq('affiliate_id', user.id) as unknown as Promise<{
        data: { amount: number; order: { product_id: string } | null }[] | null
        error: unknown
      }>,
  ])

  const list = productsRes.data ?? []
  const customPriceMap = new Map(
    (customPricesRes.data ?? []).map((r) => [r.product_id, Number(r.custom_sell_price_mad)])
  )

  // Build per-product stats maps
  const clicksMap = new Map<string, number>()
  for (const c of clicksRes.data ?? []) {
    clicksMap.set(c.product_id, (clicksMap.get(c.product_id) ?? 0) + 1)
  }

  const ordersMap = new Map<string, { orders: number; delivered: number }>()
  for (const o of ordersRes.data ?? []) {
    const cur = ordersMap.get(o.product_id) ?? { orders: 0, delivered: 0 }
    cur.orders += 1
    if (o.status === 'delivered') cur.delivered += 1
    ordersMap.set(o.product_id, cur)
  }

  const commissionMap = new Map<string, number>()
  for (const c of commissionsRes.data ?? []) {
    const pid = c.order?.product_id
    if (!pid) continue
    commissionMap.set(pid, (commissionMap.get(pid) ?? 0) + Number(c.amount))
  }

  const statsMap = new Map<string, ProductStats>()
  for (const product of list) {
    const pid = product.id
    statsMap.set(pid, {
      clicks: clicksMap.get(pid) ?? 0,
      orders: ordersMap.get(pid)?.orders ?? 0,
      delivered: ordersMap.get(pid)?.delivered ?? 0,
      commissionEarned: commissionMap.get(pid) ?? 0,
    })
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'http://localhost:3000')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/affiliate/dashboard"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Catalogue</span>
          </div>
          <div className="flex items-center gap-4">
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
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Catalogue produits</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {list.length} produit{list.length !== 1 ? 's' : ''} disponible
            {list.length !== 1 ? 's' : ''}.
            Copiez votre lien affilié pour chaque produit.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun produit disponible pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((product) => {
              const referralUrl = `${APP_URL}/products/${product.id}?ref=${user.id}`
              const customPrice = customPriceMap.get(product.id) ?? null
              const stats = statsMap.get(product.id) ?? { clicks: 0, orders: 0, delivered: 0, commissionEarned: 0 }
              return (
                <AffiliateProductCard
                  key={product.id}
                  product={product}
                  referralUrl={referralUrl}
                  customPrice={customPrice}
                  stats={stats}
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

function AffiliateProductCard({
  product,
  referralUrl,
  customPrice,
  stats,
}: {
  product: Product
  referralUrl: string
  customPrice: number | null
  stats: ProductStats
}) {
  const coverUrl = getProductCoverUrl(product)
  const convRate =
    stats.clicks > 0 ? `${((stats.orders / stats.clicks) * 100).toFixed(0)}%` : '—'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <ProductThumbnail
        src={coverUrl}
        name={product.name}
        className="aspect-[4/3] w-full text-2xl"
      />

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                product.availability_type === 'import_on_demand'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {product.availability_type === 'import_on_demand' ? 'Import' : 'Stock Maroc'}
            </span>
          </div>
          <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{product.description}</p>
          )}
        </div>

        {/* Pricing */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Prix catalogue</p>
            <p className="text-sm font-medium text-gray-700">{formatMAD(product.sell_price)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Commission de base</p>
            <p className="text-base font-bold text-green-600">
              {formatMAD(product.commission_amount)}
            </p>
          </div>
        </div>

        {/* Custom price indicator */}
        {customPrice !== null && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 text-xs">
            <span className="text-blue-700">Prix personnalisé actif</span>
            <span className="font-bold text-blue-800 tabular-nums">{formatMAD(customPrice)}</span>
          </div>
        )}

        {/* Operational fees */}
        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 space-y-0.5">
          <div className="flex justify-between">
            <span>Confirmation</span>
            <span className="text-gray-600">{product.confirmation_fee_mad} MAD</span>
          </div>
          <div className="flex justify-between">
            <span>Emballage</span>
            <span className="text-gray-600">{product.packaging_fee_mad} MAD</span>
          </div>
          {product.delivery_fee_mad > 0 && (
            <div className="flex justify-between">
              <span>Livraison</span>
              <span className="text-gray-600">{product.delivery_fee_mad} MAD</span>
            </div>
          )}
        </div>

        {/* Stock indicator */}
        <p className="text-xs text-gray-400">
          Stock&nbsp;:{' '}
          <span className={product.stock_count > 0 ? 'text-green-600' : 'text-red-500'}>
            {product.stock_count > 0 ? `${product.stock_count} unités` : 'Épuisé'}
          </span>
        </p>

        {/* Custom price setter */}
        <AffiliatePriceForm
          productId={product.id}
          platformPrice={product.sell_price}
          currentCustomPrice={customPrice}
        />

        {/* Per-product performance stats */}
        <div className="grid grid-cols-4 gap-1 bg-gray-50 rounded-lg px-2 py-2">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{stats.clicks}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Clics</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{stats.orders}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Cmdes</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{convRate}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Conv.</p>
          </div>
          <div className="text-center">
            <p className={`text-xs font-bold tabular-nums ${stats.commissionEarned > 0 ? 'text-green-600' : 'text-gray-800'}`}>
              {stats.commissionEarned > 0 ? formatMAD(stats.commissionEarned) : '—'}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Gagné</p>
          </div>
        </div>

        {/* Copy link — pushed to bottom */}
        <div className="mt-auto pt-3">
          <CopyLinkButton url={referralUrl} />
        </div>
      </div>
    </div>
  )
}
