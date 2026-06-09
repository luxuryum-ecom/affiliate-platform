import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { CopyLinkButton } from '@/components/affiliate/copy-link-button'
import { AffiliatePriceForm } from '@/components/affiliate/affiliate-price-form'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD, calculateNetAffiliateCommission, MIN_DELIVERY_FEE_MAD } from '@/lib/utils'
import { getLogisticsSettings } from '@/app/actions/logistics'
import { MozounaLogo } from '@/components/shared/branding'
import { getTranslations } from 'next-intl/server'
import type { Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.products')
  return { title: t('metaTitle') }
}

interface ProductStats {
  clicks: number
  orders: number
  delivered: number
  commissionEarned: number
}

export default async function AffiliateProductsPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliate.products')
  const tCommon = await getTranslations('affiliate.common')

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

  const logistics = await getLogisticsSettings()
  const refDeliveryFee = Math.max(
    MIN_DELIVERY_FEE_MAD,
    logistics ? Number(logistics.default_delivery_fee_mad) : 35
  )

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

  // Strings passed to client components as props
  const priceFormStrings = {
    myPrice: t('myPrice'),
    priceVsCatalog: t.raw('priceVsCatalog') as string,
    priceNotSet: t.raw('priceNotSet') as string,
    priceSave: t('priceSave'),
    priceSaving: t('priceSaving'),
    priceReset: t.raw('priceReset') as string,
    priceMin: t.raw('priceMin') as string,
    priceSavedOk: t('priceSavedOk'),
    priceResetOk: t('priceResetOk'),
  }

  const copyLinkStrings = {
    copy: t('copyLink'),
    copied: t('copied'),
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/affiliate/dashboard"><MozounaLogo size="sm" /></Link>
            <span className="text-gray-300">{tCommon('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {tCommon('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">{t('pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('subtitle', { count: list.length })}
          </p>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">{t('emptyProducts')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((product) => {
              const referralUrl = `${APP_URL}/products/${product.id}?ref=${user.id}`
              const customPrice = customPriceMap.get(product.id) ?? null
              const stats = statsMap.get(product.id) ?? { clicks: 0, orders: 0, delivered: 0, commissionEarned: 0 }
              const baseCommission = calculateNetAffiliateCommission({
                affiliateSellPrice: product.sell_price,
                factoryCostMad: product.factory_cost_mad ?? product.purchase_price_mad ?? 0,
                marginType: product.platform_margin_type,
                marginValue: product.platform_margin_value ?? 0,
                packagingFee: product.packaging_fee_mad ?? 10,
                confirmationFee: product.confirmation_fee_mad ?? 10,
                deliveryFee: refDeliveryFee,
                quantity: 1,
              })
              return (
                <AffiliateProductCard
                  key={product.id}
                  product={product}
                  referralUrl={referralUrl}
                  customPrice={customPrice}
                  stats={stats}
                  baseCommission={baseCommission}
                  strings={{ t: {
                    availImport: t('availImport'),
                    availStock: t('availStock'),
                    catalogPrice: t('catalogPrice'),
                    baseCommission: t('baseCommission'),
                    notProfitable: t('notProfitable'),
                    customPriceActive: t('customPriceActive'),
                    feeConfirmation: t('feeConfirmation'),
                    feePackaging: t('feePackaging'),
                    feeDelivery: t('feeDelivery'),
                    stock: t('stock'),
                    stockUnits: (count: number) => t('stockUnits', { count }),
                    stockEmpty: t('stockEmpty'),
                    statsClicks: t('statsClicks'),
                    statsOrders: t('statsOrders'),
                    statsConv: t('statsConv'),
                    statsEarned: t('statsEarned'),
                    priceVsCatalog: (amount: string) => t('priceVsCatalog', { amount }),
                  }, priceForm: priceFormStrings, copyLink: copyLinkStrings }}
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

type CardStrings = {
  t: {
    availImport: string
    availStock: string
    catalogPrice: string
    baseCommission: string
    notProfitable: string
    customPriceActive: string
    feeConfirmation: string
    feePackaging: string
    feeDelivery: string
    stock: string
    stockUnits: (count: number) => string
    stockEmpty: string
    statsClicks: string
    statsOrders: string
    statsConv: string
    statsEarned: string
    priceVsCatalog: (amount: string) => string
  }
  priceForm: {
    myPrice: string
    priceVsCatalog: string
    priceNotSet: string
    priceSave: string
    priceSaving: string
    priceReset: string
    priceMin: string
    priceSavedOk: string
    priceResetOk: string
  }
  copyLink: { copy: string; copied: string }
}

function AffiliateProductCard({
  product,
  referralUrl,
  customPrice,
  stats,
  baseCommission,
  strings,
}: {
  product: Product
  referralUrl: string
  customPrice: number | null
  stats: ProductStats
  baseCommission: number
  strings: CardStrings
}) {
  const { t, priceForm, copyLink } = strings
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
              {product.availability_type === 'import_on_demand' ? t.availImport : t.availStock}
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
            <p className="text-xs text-gray-400">{t.catalogPrice}</p>
            <p className="text-sm font-medium text-gray-700">{formatMAD(product.sell_price)}</p>
          </div>
          <div className="text-end">
            <p className="text-xs text-gray-400">{t.baseCommission}</p>
            {baseCommission > 0 ? (
              <p className="text-base font-bold text-green-600">
                {formatMAD(baseCommission)}
              </p>
            ) : (
              <p className="text-sm font-bold text-red-500">{t.notProfitable}</p>
            )}
          </div>
        </div>

        {/* Custom price indicator */}
        {customPrice !== null && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 text-xs">
            <span className="text-blue-700">{t.customPriceActive}</span>
            <span className="font-bold text-blue-800 tabular-nums">{formatMAD(customPrice)}</span>
          </div>
        )}

        {/* Operational fees */}
        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 space-y-0.5">
          <div className="flex justify-between">
            <span>{t.feeConfirmation}</span>
            <span className="text-gray-600">{product.confirmation_fee_mad} MAD</span>
          </div>
          <div className="flex justify-between">
            <span>{t.feePackaging}</span>
            <span className="text-gray-600">{product.packaging_fee_mad} MAD</span>
          </div>
          {product.delivery_fee_mad > 0 && (
            <div className="flex justify-between">
              <span>{t.feeDelivery}</span>
              <span className="text-gray-600">{product.delivery_fee_mad} MAD</span>
            </div>
          )}
        </div>

        {/* Stock indicator */}
        <p className="text-xs text-gray-400">
          {t.stock}&nbsp;:{' '}
          <span className={product.stock_count > 0 ? 'text-green-600' : 'text-red-500'}>
            {product.stock_count > 0 ? t.stockUnits(product.stock_count) : t.stockEmpty}
          </span>
        </p>

        {/* Custom price setter */}
        <AffiliatePriceForm
          productId={product.id}
          platformPrice={product.sell_price}
          currentCustomPrice={customPrice}
          strings={priceForm}
        />

        {/* Per-product performance stats */}
        <div className="grid grid-cols-4 gap-1 bg-gray-50 rounded-lg px-2 py-2">
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{stats.clicks}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{t.statsClicks}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{stats.orders}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{t.statsOrders}</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-800 tabular-nums">{convRate}</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{t.statsConv}</p>
          </div>
          <div className="text-center">
            <p className={`text-xs font-bold tabular-nums ${stats.commissionEarned > 0 ? 'text-green-600' : 'text-gray-800'}`}>
              {stats.commissionEarned > 0 ? formatMAD(stats.commissionEarned) : '—'}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{t.statsEarned}</p>
          </div>
        </div>

        {/* Copy link — pushed to bottom */}
        <div className="mt-auto pt-3">
          <CopyLinkButton url={referralUrl} strings={copyLink} />
        </div>
      </div>
    </div>
  )
}
