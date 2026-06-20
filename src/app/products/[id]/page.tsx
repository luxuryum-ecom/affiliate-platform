import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMAD } from '@/lib/utils'
import { getProductCoverUrl, getProductGalleryUrls, getMeaningfulDescription } from '@/lib/product-media'
import { getDeliveryEstimate } from '@/lib/order-analytics'
import { CodOrderForm } from '@/components/customer/cod-order-form'
import { ProductGallery } from '@/components/customer/product-gallery'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { Product } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('publicProduct')
  const supabase = await createClient()
  const { data } = (await supabase
    .from('products_public_read')
    .select('name, description')
    .eq('id', id)
    .single()) as { data: { name: string; description: string | null } | null; error: unknown }
  if (!data) return { title: t('metaUnavailable') }
  return {
    title: `${data.name} ${t('metaTitleSuffix')}`,
    description: data.description ?? undefined,
  }
}

export default async function PublicProductPage({ params, searchParams }: Params) {
  const { id } = await params
  const { ref } = await searchParams

  const t = await getTranslations('publicProduct')

  const supabase = await createClient()

  // Vue publique whitelistée (migr. 072) — JAMAIS de colonne coût/marge exposée à anon.
  // La vue applique déjà active=true AND approval_status='approved'.
  const { data: product } = (await supabase
    .from('products_public_read')
    .select('*')
    .eq('id', id)
    .eq('affiliate_enabled', true)
    .single()) as { data: Product | null; error: unknown }

  if (!product || product.availability_type === 'import_on_demand') notFound()

  const affiliateId = ref ?? null

  // Look up affiliate's custom sell price if a referral is present.
  // Uses service_role to bypass "aff_prices: anon read" policy (removed in migration 047).
  // Falls back to product.sell_price when no custom price is set.
  let customSellPrice: number | null = null
  if (affiliateId) {
    const adminClient = createAdminClient()
    const { data: priceRow } = (await adminClient
      .from('affiliate_product_prices')
      .select('custom_sell_price_mad')
      .eq('affiliate_id', affiliateId)
      .eq('product_id', product.id)
      .maybeSingle()) as {
      data: { custom_sell_price_mad: number } | null
      error: unknown
    }
    customSellPrice = priceRow ? Number(priceRow.custom_sell_price_mad) : null
  }

  const displayPrice = customSellPrice ?? product.sell_price

  const coverUrl = getProductCoverUrl(product)
  const galleryUrls = getProductGalleryUrls(product)
  // Affichage pur : masque une description qui ne fait que répéter le nom (comme la
  // fiche affilié). Filtre déjà éprouvé — aucune donnée transformée.
  const meaningfulDescription = getMeaningfulDescription(product.name, product.description)
  const delivery = getDeliveryEstimate(product.availability_type)

  const inStock = product.stock_count > 0
  const lowStock = product.stock_count > 0 && product.stock_count <= 5

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-lg md:max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" aria-label={t('ariaHomeLogo')}>
            <MozounaLogo size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gold-400">{t('badgeCod')}</span>
            <LanguageSwitcher variant="dark" />
          </div>
        </div>
      </header>

      <main className="max-w-lg md:max-w-5xl mx-auto px-4 py-6 pb-24">
        <div className="md:grid md:grid-cols-2 md:gap-10 md:items-start">
          {/* Gallery */}
          <div className="mb-6 md:mb-0">
            <ProductGallery
              coverUrl={coverUrl}
              galleryUrls={galleryUrls}
              productName={product.name}
            />
          </div>

          {/* Product info + form */}
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-success-soft text-success-fg">
                  {t('badgeStockMorocco')}
                </span>
                {inStock ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      lowStock ? 'bg-warning-soft text-warning-fg' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {lowStock
                      ? t('badgeLowStock', { count: product.stock_count })
                      : t('badgeInStock', { count: product.stock_count })}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-danger-soft text-danger-fg">
                    {t('badgeOutOfStock')}
                  </span>
                )}
              </div>

              <div className="h-0.5 w-10 bg-gold-400 rounded-full mb-2" aria-hidden />
              {/* product.name is DB content — not translatable */}
              <h1 className="text-2xl font-bold text-foreground leading-tight">{product.name}</h1>

              {meaningfulDescription && (
                <p className="text-sm text-muted mt-3 leading-relaxed whitespace-pre-line">
                  {/* product.description is DB content — not translatable */}
                  {meaningfulDescription}
                </p>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {formatMAD(displayPrice)}
              </span>
              <span className="text-sm font-medium text-gold-400">{t('priceUnit')}</span>
            </div>

            <div className="flex items-start gap-3 bg-surface border border-line rounded-xl p-4 shadow-premium">
              <span className="text-lg" aria-hidden>
                🚚
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{t('deliveryTitle')}</p>
                {/* libellé localisé via daysMin/daysMax (la lib renvoie une chaîne FR fixe) */}
                <p className="text-xs text-muted mt-0.5">{t('deliveryDays', { min: delivery.daysMin, max: delivery.daysMax })}</p>
                <p className="text-xs text-faint mt-1">{t('deliveryFootnote')}</p>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-premium">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('orderSectionTitle')}</h2>
              <CodOrderForm
                productId={product.id}
                affiliateIdFromUrl={affiliateId}
                productName={product.name}
                sellPrice={displayPrice}
                maxQty={Math.max(product.stock_count, 0)}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-line bg-surface mt-8">
        <div className="max-w-lg md:max-w-5xl mx-auto px-4 py-6 text-center text-xs text-muted">
          {t('footerTrust')}
        </div>
      </footer>
    </div>
  )
}
