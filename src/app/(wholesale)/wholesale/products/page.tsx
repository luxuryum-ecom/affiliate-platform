import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { getCatalogProductCtaMode } from '@/lib/wholesale-cta'
import type { Product, WholesaleCartItem } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.products')
  return { title: t('metaTitle') }
}

export default async function WholesaleProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [profileResult, productsResult, cartResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false }),
    supabase
      .from('wholesale_cart_items')
      .select('*')
      .eq('buyer_id', user.id),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const products = (productsResult.data ?? []) as Product[]
  const cartItems = (cartResult.data ?? []) as WholesaleCartItem[]

  const t = await getTranslations('wholesale.products')
  const tc = await getTranslations('wholesale.common')

  // Build a quick lookup: productId → qty in cart
  const cartMap = new Map(cartItems.map((c) => [c.product_id, c.quantity]))
  const cartCount = cartItems.length

  return (
    <div className="min-h-screen bg-bg">
      {/* Navbar */}
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5">
              {t('subtitle', { count: products.length })}
            </p>
            <Link
              href="/wholesale/marketplace"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              {t('browseMarketplace')}
            </Link>
          </div>
          {cartCount > 0 && (
            <Link
              href="/wholesale/cart"
              className="shrink-0 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('viewCart', { count: cartCount })}
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((product) => {
              const inCart = cartMap.get(product.id)
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
                  inCartQty={inCart}
                  badgeImport={t('badgeImport')}
                  badgeStock={t('badgeStock')}
                  badgeTiers={t('badgeTiers')}
                  inCartLabel={t('inCart', { count: inCart ?? 0 })}
                  ctaRfq={t('ctaRfq')}
                  ctaOrder={t('ctaOrder')}
                  fromPrice={t('fromPrice')}
                  minQtyLabel={t('minQty', { count: product.wholesale_min_qty })}
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
  inCartQty,
  badgeImport,
  badgeStock,
  badgeTiers,
  inCartLabel,
  ctaRfq,
  ctaOrder,
  fromPrice,
  minQtyLabel,
}: {
  product: Product
  displayPrice: number
  inCartQty: number | undefined
  badgeImport: string
  badgeStock: string
  badgeTiers: string
  inCartLabel: string
  ctaRfq: string
  ctaOrder: string
  fromPrice: string
  minQtyLabel: string
}) {
  const coverUrl = getProductCoverUrl(product)
  const tierQtys = [...product.wholesale_tiers]
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((t) => t.min_qty)
  const hasTiers = tierQtys.length > 0
  const productUrl = `/wholesale/products/${product.id}`
  const isRfq = getCatalogProductCtaMode(product.availability_type) === 'rfq'

  return (
    <div className="group bg-surface rounded-xl border border-line overflow-hidden flex flex-col hover:shadow-premium transition-shadow">
      {/* Thumbnail */}
      <Link href={productUrl} className="aspect-square relative overflow-hidden block">
        <ProductThumbnail
          src={coverUrl}
          name={product.name}
          className="w-full h-full text-2xl group-hover:scale-105 transition-transform duration-300"
        />

        {/* In-cart badge */}
        {inCartQty != null && (
          <div className="absolute top-2 end-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
            {inCartLabel}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isRfq
                ? 'bg-surface-2 text-muted border border-line'
                : 'bg-success-soft text-success-fg border border-success'
            }`}
          >
            {isRfq ? badgeImport : badgeStock}
          </span>
          {hasTiers && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning-soft text-warning-fg border border-warning">
              {badgeTiers}
            </span>
          )}
        </div>

        <Link href={productUrl}>
          <h3 className="font-medium text-foreground text-sm leading-snug line-clamp-2 hover:text-muted transition-colors">
            {product.name}
          </h3>
        </Link>

        <div className="mt-auto pt-1.5 border-t border-line">
          <p className="text-sm font-bold text-foreground">{formatMAD(displayPrice)}</p>
          <p className="text-xs text-faint mt-0.5">
            {hasTiers ? fromPrice : ''}{minQtyLabel}
          </p>
        </div>

        {/* CTA */}
        <Link
          href={productUrl}
          className="block w-full text-center text-xs font-bold py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {isRfq ? ctaRfq : ctaOrder}
        </Link>
      </div>
    </div>
  )
}
