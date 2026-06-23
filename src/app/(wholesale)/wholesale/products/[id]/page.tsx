import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { AddToCartForm } from '@/components/wholesale/add-to-cart-form'
import { QuoteRequestForm } from '@/components/wholesale/quote-request-form'
import { WholesaleSavingsHook } from '@/components/wholesale/wholesale-savings-hook'
import { resolveUnitLabel, priceWithUnit } from '@/lib/units'
import { PackBreakdown } from '@/components/shared/pack-breakdown'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl, getProductGalleryUrls, getMeaningfulDescription } from '@/lib/product-media'
import { getActiveTariff } from '@/app/actions/tariffs'
import { SHIPPING_MODE_LABELS } from '@/lib/tariff-utils'
import { getCatalogProductCtaMode } from '@/lib/wholesale-cta'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { Product, ImportTariff } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('wholesale.productDetail')
  const { data } = await supabase
    .from('products_catalog_read') // dette 073 — vue redacted (nom seul)
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
    supabase.from('products_catalog_read').select('*').eq('id', id).eq('active', true).eq('approval_status', 'approved').single(), // dette 073 — vue redacted (zéro coût/marge)
  ])

  const profile = profileResult.data as { full_name: string } | null
  const product = productResult.data as Product | null

  if (!product) notFound()

  const t = await getTranslations('wholesale.productDetail')
  const tc = await getTranslations('wholesale.common')
  const tUnits = await getTranslations('units')
  const locale = await getLocale()

  // Suffixe d'unité résolu SERVEUR (string, jamais une fonction → sûr à passer au
  // hook Client). null si sale_unit non posé → affichage identique à avant.
  const unitLabel = product.sale_unit ? resolveUnitLabel(product.sale_unit, tUnits) : null

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
  // Description affichée seulement si elle apporte une info au-delà du nom (cohérent affilié).
  const meaningfulDesc = getMeaningfulDescription(product.name, product.description)

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      {/* Navbar */}
      <DashboardHeader
        breadcrumb={product.name}
        backHref="/wholesale/products"
        backLabel={t('backToCatalog')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ── Images ── */}
          <div className="space-y-3">
            <ProductThumbnail
              src={coverUrl}
              name={product.name}
              className="aspect-square w-full rounded-2xl border border-line text-4xl"
            />

            {galleryUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryUrls.map((url, i) => (
                  <ProductThumbnail
                    key={url}
                    src={url}
                    name={`${product.name} ${i + 2}`}
                    className="h-16 w-16 shrink-0 rounded-lg border border-line"
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
                    ? 'bg-surface-2 text-muted border border-line'
                    : 'bg-success-soft text-success-fg border border-success'
                }`}
              >
                {product.availability_type === 'import_on_demand' ? t('badgeImport') : t('badgeStock')}
              </span>
              {product.wholesale_tiers.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning-soft text-warning-fg border border-warning">
                  {t('badgeTiers')}
                </span>
              )}
              {product.stock_count === 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                  {t('badgeOverOrder')}
                </span>
              )}
              {product.stock_count > 0 && product.stock_count < product.wholesale_min_qty && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning-soft text-warning-fg border border-warning">
                  {t('badgePartialStock')}
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">{product.name}</h1>
              {meaningfulDesc && (
                <p className="text-sm text-muted mt-2 leading-relaxed">{meaningfulDesc}</p>
              )}
            </div>

            {/* Stock location + origin — local_stock only */}
            {product.availability_type === 'local_stock' && (
              <div className="rounded-xl border border-success bg-success-soft px-4 py-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">{t('stockLocation')}</span>
                  <span className="font-medium text-success-fg">🇲🇦 {t('stockMorocco')}</span>
                </div>
                {product.origin_country && (
                  <div className="flex items-center justify-between">
                    {/* origin_country is DB data — not translatable */}
                    <span className="text-muted">{t('originCountry')}</span>
                    <span className="font-medium text-foreground">{product.origin_country}</span>
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
              <span className="text-faint">{t('publicPrice')}</span>
              <span className="font-medium text-muted">
                {priceWithUnit(formatMAD(product.sell_price), unitLabel)}
              </span>
            </div>

            {/* Conditionnement descriptif (P3) — rien si pack_size/pack_unit non posés */}
            <PackBreakdown
              price={product.sell_price}
              packSize={product.pack_size}
              packUnit={product.pack_unit}
              saleUnit={product.sale_unit}
            />

            {/* Hook grossiste — économie totale en achetant gros (affichage pur, paliers stockés).
                Rendu uniquement s'il y a ≥ 2 paliers avec économie (sinon retourne null). */}
            <WholesaleSavingsHook tiers={product.wholesale_tiers} unitLabel={unitLabel ?? undefined} />

            {ctaMode === 'rfq' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  {t('labelImportSection')}
                </p>
                <QuoteRequestForm productId={product.id} productName={product.name} />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-success-fg uppercase tracking-wide">
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
                {/* Sur-commande / rupture → devis (cible de l'ancre #quote depuis AddToCartForm) */}
                <div id="quote" className="space-y-2 pt-2 border-t border-line scroll-mt-20">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                    {t('overOrderSectionLabel')}
                  </p>
                  <QuoteRequestForm productId={product.id} productName={product.name} />
                </div>
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

  // Tarif transport : masqué si absent/vide/0 — Number('') donnait 0 → « 0,00 MAD » parasite.
  const transportRaw =
    tariff != null
      ? tariff.transport_customs_price_mad
      : product.estimated_import_price_mad ?? product.estimated_cost_mad
  // Number('') vaut 0 → filtré par « > 0 » ci-dessous (donc champ masqué, pas « 0,00 MAD »).
  const transportNum = transportRaw == null ? NaN : Number(transportRaw)
  const transportCostMad = Number.isFinite(transportNum) && transportNum > 0 ? transportNum : null
  const unit = tariff?.unit ?? product.import_price_unit

  const deliveryDays = tariff?.delivery_days ?? product.estimated_delivery_days
  const notes = tariff?.notes ?? product.import_notes

  return (
    <div className="rounded-xl border border-line bg-bg px-4 py-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            {t('importTitle')}
          </p>
          <p className="text-xs text-faint mt-0.5">
            {/* Exception textile maritime : tarif au kg fixe, connu d'avance (vs estimation au devis) */}
            {shippingMode === 'sea_textile_kg' ? t('importSubtitleTextile') : t('importSubtitle')}
          </p>
        </div>
        {product.tariff_mode === 'global' && globalTariff && (
          <span className="text-xs text-muted bg-surface-2 px-2 py-0.5 rounded-full shrink-0 border border-line">
            {t('importBadgeGlobal')}
          </span>
        )}
      </div>

      {product.origin_country && (
        <div className="flex items-center justify-between">
          {/* origin_country is DB data */}
          <span className="text-muted">{t('importOrigin')}</span>
          <span className="font-medium text-foreground">{product.origin_country}</span>
        </div>
      )}

      {shippingModeLabel && (
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('importShippingMode')}</span>
          <span className="font-medium text-foreground">{shippingModeLabel}</span>
        </div>
      )}

      {transportCostMad != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('importCost')}</span>
          <span className="font-medium text-foreground">
            {formatMAD(transportCostMad)}{' '}
            {unit && (
              <span className="text-muted font-normal">
                / {unit === 'cbm' ? t('importUnitCbm') : t('importUnitKg')}
              </span>
            )}
            {shippingMode === 'sea_textile_kg' && (
              <span className="ms-2 text-xs font-medium text-success-fg bg-success-soft px-1.5 py-0.5 rounded">
                {t('importRateFixed')}
              </span>
            )}
          </span>
        </div>
      )}

      {deliveryDays != null && (
        <div className="flex items-center justify-between">
          <span className="text-muted">{t('importDelivery')}</span>
          <span className="font-medium text-foreground">
            {t('importDays', { count: deliveryDays })}
          </span>
        </div>
      )}

      {notes && (
        <div className="pt-2 border-t border-line">
          <p className="text-xs text-muted font-medium mb-1">{t('importNotes')}</p>
          {/* notes is DB data */}
          <p className="text-foreground text-xs leading-relaxed whitespace-pre-line">{notes}</p>
        </div>
      )}
    </div>
  )
}
