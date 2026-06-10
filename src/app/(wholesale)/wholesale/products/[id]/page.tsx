import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { AddToCartForm } from '@/components/wholesale/add-to-cart-form'
import { QuoteRequestForm } from '@/components/wholesale/quote-request-form'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl, getProductGalleryUrls } from '@/lib/product-media'
import { getActiveTariff } from '@/app/actions/tariffs'
import { SHIPPING_MODE_LABELS } from '@/lib/tariff-utils'
import { getCatalogProductCtaMode } from '@/lib/wholesale-cta'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { Product, ImportTariff } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('wholesale.productDetail')
  const { data } = await supabase
    .from('products')
    .select('name')
    .eq('id', id)
    .single() as { data: { name: string } | null; error: unknown }
  return { title: data ? t('metaTitle', { name: data.name }) : t('metaFallback') }
}

export default async function WholesaleProductDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [profileResult, productResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('products').select('*').eq('id', id).eq('active', true).eq('approval_status', 'approved').single(),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const product = productResult.data as Product | null

  if (!product) notFound()

  const t = await getTranslations('wholesale.productDetail')
  const tc = await getTranslations('wholesale.common')
  const locale = await getLocale()

  // Fetch global tariff when product uses global tariff mode
  let globalTariff: ImportTariff | null = null
  if (
    product.availability_type === 'import_on_demand' &&
    product.tariff_mode === 'global' &&
    product.origin_country &&
    product.import_shipping_mode
  ) {
    globalTariff = await getActiveTariff(product.origin_country, product.import_shipping_mode)
  }

  const coverUrl = getProductCoverUrl(product)
  const galleryUrls = getProductGalleryUrls(product)
  const ctaMode = getCatalogProductCtaMode(product.availability_type)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/wholesale/products"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              {t('backToCatalog')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[160px]">
              {product.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/wholesale/cart"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              {t('myCart')}
            </Link>
            <span className="text-gray-400 hidden sm:inline">{profile?.full_name}</span>
            <LanguageSwitcher variant="light" />
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ── Images ── */}
          <div className="space-y-3">
            <ProductThumbnail
              src={coverUrl}
              name={product.name}
              className="aspect-square w-full rounded-2xl border border-gray-200 text-4xl"
            />

            {galleryUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryUrls.map((url, i) => (
                  <ProductThumbnail
                    key={url}
                    src={url}
                    name={`${product.name} ${i + 2}`}
                    className="h-16 w-16 shrink-0 rounded-lg border border-gray-200"
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Info + Add to cart ── */}
          <div className="space-y-5">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  product.availability_type === 'import_on_demand'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {product.availability_type === 'import_on_demand' ? t('badgeImport') : t('badgeStock')}
              </span>
              {product.wholesale_tiers.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {t('badgeTiers')}
                </span>
              )}
              {product.stock_count === 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                  {t('badgeUnavailable')}
                </span>
              )}
              {product.stock_count > 0 && product.stock_count < product.wholesale_min_qty && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {t('badgePartialStock')}
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{product.name}</h1>
              {product.description && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Stock location + origin — local_stock only */}
            {product.availability_type === 'local_stock' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{t('stockLocation')}</span>
                  <span className="font-medium text-green-700">🇲🇦 {t('stockMorocco')}</span>
                </div>
                {product.origin_country && (
                  <div className="flex items-center justify-between">
                    {/* origin_country is DB data — not translatable */}
                    <span className="text-gray-500">{t('originCountry')}</span>
                    <span className="font-medium text-gray-700">{product.origin_country}</span>
                  </div>
                )}
              </div>
            )}

            {/* Import-on-demand sourcing details */}
            {product.availability_type === 'import_on_demand' && (
              <ImportInfoBlock
                product={product}
                globalTariff={globalTariff}
                locale={locale}
                t={t}
              />
            )}

            {/* Public price reference */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">{t('publicPrice')}</span>
              <span className="font-medium text-gray-700">{formatMAD(product.sell_price)}</span>
            </div>

            {ctaMode === 'rfq' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  {t('labelImportSection')}
                </p>
                <QuoteRequestForm productId={product.id} productName={product.name} />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  {t('labelStockSection')}
                </p>
                <AddToCartForm
                  productId={product.id}
                  sellPrice={product.sell_price}
                  tiers={product.wholesale_tiers}
                  minQty={product.wholesale_min_qty}
                  stockCount={product.stock_count}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Import info block ────────────────────────────────────────────────────────

function ImportInfoBlock({
  product,
  globalTariff,
  locale,
  t,
}: {
  product: Product
  globalTariff: ImportTariff | null
  locale: string
  t: Awaited<ReturnType<typeof getTranslations<'wholesale.productDetail'>>>
}) {
  const tariff = product.tariff_mode === 'global' ? globalTariff : null

  const shippingMode = tariff?.shipping_mode ?? product.import_shipping_mode
  const shippingModeLabel = shippingMode ? (SHIPPING_MODE_LABELS[shippingMode] ?? null) : null

  const transportCostMad =
    tariff != null
      ? Number(tariff.transport_customs_price_mad)
      : product.estimated_import_price_mad ?? product.estimated_cost_mad
  const unit = tariff?.unit ?? product.import_price_unit

  const deliveryDays = tariff?.delivery_days ?? product.estimated_delivery_days
  const notes = tariff?.notes ?? product.import_notes

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
            {t('importTitle')}
          </p>
          <p className="text-xs text-purple-500 mt-0.5">
            {t('importSubtitle')}
          </p>
        </div>
        {product.tariff_mode === 'global' && globalTariff && (
          <span className="text-xs text-purple-500 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
            {t('importBadgeGlobal')}
          </span>
        )}
      </div>

      {product.origin_country && (
        <div className="flex items-center justify-between">
          {/* origin_country is DB data */}
          <span className="text-gray-500">{t('importOrigin')}</span>
          <span className="font-medium text-gray-900">{product.origin_country}</span>
        </div>
      )}

      {shippingModeLabel && (
        <div className="flex items-center justify-between">
          <span className="text-gray-500">{t('importShippingMode')}</span>
          <span className="font-medium text-gray-900">{shippingModeLabel}</span>
        </div>
      )}

      {transportCostMad != null && (
        <div className="flex items-center justify-between">
          <span className="text-gray-500">{t('importCost')}</span>
          <span className="font-medium text-gray-900">
            {formatMAD(transportCostMad)}{' '}
            {unit && (
              <span className="text-gray-500 font-normal">
                / {unit === 'cbm' ? t('importUnitCbm') : t('importUnitKg')}
              </span>
            )}
          </span>
        </div>
      )}

      {deliveryDays != null && (
        <div className="flex items-center justify-between">
          <span className="text-gray-500">{t('importDelivery')}</span>
          <span className="font-medium text-gray-900">
            {t('importDays', { count: deliveryDays })}
          </span>
        </div>
      )}

      {notes && (
        <div className="pt-2 border-t border-purple-200">
          <p className="text-xs text-purple-700 font-medium mb-1">{t('importNotes')}</p>
          {/* notes is DB data */}
          <p className="text-gray-700 text-xs leading-relaxed whitespace-pre-line">{notes}</p>
        </div>
      )}
    </div>
  )
}
