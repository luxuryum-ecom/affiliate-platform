import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CopyLinkButton } from '@/components/affiliate/copy-link-button'
import { AffiliatePriceForm } from '@/components/affiliate/affiliate-price-form'
import { AffiliateFeesBreakdown } from '@/components/affiliate/AffiliateFeesBreakdown'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getProductCoverUrl, getMeaningfulDescription } from '@/lib/product-media'
import { formatMAD, calculateNetAffiliateCommission, DELIVERY_PROVISION_MAD } from '@/lib/utils'
import { resolveUnitLabel, priceWithUnit } from '@/lib/units'
import { PackBreakdown } from '@/components/shared/pack-breakdown'
import { VariantSelector } from '@/components/product/variant-selector'
import { getTranslations } from 'next-intl/server'
import type { Product } from '@/types/database'
import type { ProductVariant } from '@/components/product/variant-selector'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const t = await getTranslations('affiliate.products')
  const supabase = await createClient()
  const { data } = await supabase
    .from('products_catalog_read') // dette 073 — vue redacted (nom seul, zéro coût/marge)
    .select('name')
    .eq('id', id)
    .single() as { data: { name: string } | null; error: unknown }
  return { title: data?.name ? `${data.name} — ${t('metaTitle')}` : t('metaTitle') }
}

export default async function AffiliateProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('affiliate.products')
  const tCommon = await getTranslations('affiliate.common')
  const tVariant = await getTranslations('productVariant')
  const tUnits = await getTranslations('units')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  // DETTE 073 — coût/marge lus via service_role server-side UNIQUEMENT (calcul commission
  // affichée) ; seul le résultat est rendu, jamais le coût/marge. Calcul INCHANGÉ.
  const admin = createAdminClient()
  const [productRes, customPriceRes, clicksRes, ordersRes, commissionsRes] = await Promise.all([
    admin
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('affiliate_enabled', true)
      .single() as unknown as Promise<{ data: Product | null; error: unknown }>,
    supabase
      .from('affiliate_product_prices')
      .select('custom_sell_price_mad')
      .eq('affiliate_id', user.id)
      .eq('product_id', id)
      .maybeSingle() as unknown as Promise<{
        data: { custom_sell_price_mad: number } | null
        error: unknown
      }>,
    supabase
      .from('affiliate_clicks')
      .select('id')
      .eq('affiliate_id', user.id)
      .eq('product_id', id) as unknown as Promise<{ data: { id: string }[] | null; error: unknown }>,
    supabase
      .from('orders')
      .select('status')
      .eq('affiliate_id', user.id)
      .eq('product_id', id) as unknown as Promise<{
        data: { status: string }[] | null
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

  const product = productRes.data
  if (!product) notFound()

  const customPrice =
    customPriceRes.data != null ? Number(customPriceRes.data.custom_sell_price_mad) : null

  // Aperçu commission au prix catalogue = prix_vente − capital.
  // Capital inclut déjà DELIVERY_PROVISION_MAD → provision fixe pour ne pas doublon.
  const refDeliveryFee = DELIVERY_PROVISION_MAD

  // Stats for this product
  const clicks = clicksRes.data?.length ?? 0
  const ordersList = ordersRes.data ?? []
  const orders = ordersList.length
  const commissionEarned = (commissionsRes.data ?? [])
    .filter((c) => c.order?.product_id === id)
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const convRate = clicks > 0 ? `${((orders / clicks) * 100).toFixed(0)}%` : '—'

  // Si factory_cost_mad est null, on n'affiche pas de commission (pas de calcul sur 0).
  const baseCommission =
    product.factory_cost_mad != null
      ? calculateNetAffiliateCommission({
          affiliateSellPrice: product.sell_price,
          factoryCostMad: product.factory_cost_mad,
          marginType: product.platform_margin_type,
          marginValue: product.platform_margin_value ?? 0,
          packagingFee: product.packaging_fee_mad ?? 10,
          confirmationFee: product.confirmation_fee_mad ?? 10,
          deliveryFee: refDeliveryFee,
          quantity: 1,
        })
      : null

  const coverUrl = getProductCoverUrl(product)
  const description = getMeaningfulDescription(product.name, product.description)
  const inStock = product.availability_type !== 'import_on_demand'

  // Variantes — défensif : vide si la vue n'est pas encore exposée ou si le produit n'en a pas.
  const { data: variantsRaw } = await supabase
    .from('product_variants_read')
    .select('id, product_id, attributes, is_default, stock_count')
    .eq('product_id', id)
  const variants: ProductVariant[] = (variantsRaw ?? []).map((v) => ({
    id: v.id as string,
    attributes: (v.attributes ?? {}) as Record<string, string>,
    is_default: v.is_default as boolean,
    stock_count: v.stock_count as number,
  }))

  const variantStrings = {
    chooseOption: tVariant('chooseOption'),
    unavailable: tVariant('unavailable'),
    variantLabel: tVariant('variantLabel'),
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'http://localhost:3000')
  const referralUrl = `${APP_URL}/products/${product.id}?ref=${user.id}`

  const priceFormStrings = {
    myPrice: t('myPrice'),
    priceVsCatalog: t.raw('priceVsCatalog') as string,
    priceNotSet: t.raw('priceNotSet') as string,
    priceSave: t('priceSave'),
    priceSaving: t('priceSaving'),
    priceSavedOk: t('priceSavedOk'),
    priceResetOk: t('priceResetOk'),
    keepDifference: t('keepDifference'),
    gainPerSale: t.raw('gainPerSale') as string,
    gainPlaceholder: t.raw('gainPlaceholder') as string,
    suggestedLabel: t.raw('suggestedLabel') as string,
    suggestedRange: t.raw('suggestedRange') as string,
    suggestedGain: t.raw('suggestedGain') as string,
  }
  const copyLinkStrings = { copy: t('copyLink'), copied: t('copied') }
  const feesStrings = {
    resellerPrice: t('feesResellerPrice'),
    productIncluded: t('feesProductIncluded'),
    delivery: t('feeDelivery'),
    packaging: t('feePackaging'),
    confirmation: t('feeConfirmation'),
    noAdvance: t('feesNoAdvance'),
    compactTag: t('feesCompactTag'),
  }

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <DashboardHeader
        breadcrumb={product.name}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back to catalog */}
        <Link
          href="/affiliate/products"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors mb-4"
        >
          <span aria-hidden="true">←</span> {t('backToCatalog')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: image + availability/stock grouped */}
          <div className="flex flex-col gap-3">
            <ProductThumbnail
              src={coverUrl}
              name={product.name}
              className="aspect-square w-full rounded-xl border border-line text-5xl"
            />
            <div className="flex items-center justify-between bg-surface rounded-lg border border-line px-3 py-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full border ${
                  inStock
                    ? 'bg-success-soft text-success-fg border-success'
                    : 'bg-surface-2 text-muted border-line'
                }`}
              >
                {inStock ? t('availStock') : t('availImport')}
              </span>
              <span className={product.stock_count > 0 ? 'text-success-fg' : 'text-danger-fg'}>
                {t('stock')}&nbsp;:{' '}
                {product.stock_count > 0 ? t('stockUnits', { count: product.stock_count }) : t('stockEmpty')}
              </span>
            </div>
          </div>

          {/* Right: name, description, commission, price form */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground leading-snug">{product.name}</h1>
              {description && (
                <p className="text-sm text-muted mt-2 leading-relaxed">{description}</p>
              )}
            </div>

            {/* Commission + catalog price — highlighted, the affiliate's key numbers */}
            <div className="bg-accent-soft border border-gold-300 rounded-xl p-4 flex items-end justify-between">
              <div>
                <p className="text-xs text-faint">{t('baseCommission')}</p>
                {baseCommission != null && baseCommission > 0 ? (
                  <p className="text-2xl font-bold text-success-fg tabular-nums leading-tight">
                    {formatMAD(baseCommission)}
                  </p>
                ) : (
                  <p className="text-base font-semibold text-accent-fg">{t('adjustPrice')}</p>
                )}
              </div>
              <div className="text-end">
                <p className="text-xs text-faint">{t('catalogPrice')}</p>
                {/* Suffixe d'unité AJOUTÉ seulement si sale_unit est posé → produit
                    sans unité (NULL) = affichage strictement identique à avant. */}
                <p className="text-sm font-medium text-muted tabular-nums">
                  {priceWithUnit(
                    formatMAD(product.sell_price),
                    product.sale_unit ? resolveUnitLabel(product.sale_unit, tUnits) : null,
                  )}
                </p>
              </div>
            </div>

            {/* Conditionnement descriptif (P3) — rien si pack_size/pack_unit non posés */}
            <PackBreakdown
              price={product.sell_price}
              packSize={product.pack_size}
              packUnit={product.pack_unit}
              saleUnit={product.sale_unit}
            />

            {/* Sélecteur de variantes — display only, Étape 3. Caché si ≤ 1 variante. */}
            <VariantSelector variants={variants} strings={variantStrings} />

            {/* Prix tout compris — justifie le prix catalogue (affichage pur) */}
            <p className="text-xs text-success-fg">{t('priceAllInclusive')}</p>

            {/* Custom price setter (client component — strings only) */}
            <div className="bg-surface rounded-xl border border-line px-4 pb-4">
              <AffiliatePriceForm
                productId={product.id}
                platformPrice={product.sell_price}
                currentCustomPrice={customPrice}
                strings={priceFormStrings}
              />
            </div>
          </div>
        </div>

        {/* Prix revendeur + frais déjà inclus — composant partagé (affichage pur).
            Livraison = provision fixe DELIVERY_PROVISION_MAD (= ce qui est réellement
            déduit), confirmation/emballage = frais produit (fallback 10, aligné calcul). */}
        <AffiliateFeesBreakdown
          resellerPrice={product.sell_price}
          deliveryFee={DELIVERY_PROVISION_MAD}
          packagingFee={product.packaging_fee_mad ?? 10}
          confirmationFee={product.confirmation_fee_mad ?? 10}
          strings={feesStrings}
        />

        {/* Stats */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-muted mb-2">{t('statsTitle')}</p>
          {/* Mobile : 2×2 pour ne pas serrer les valeurs MAD ; desktop (sm+) INCHANGÉ = 4 colonnes. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { value: String(clicks), label: t('statsClicks') },
              { value: String(orders), label: t('statsOrders') },
              { value: convRate, label: t('statsConv') },
              { value: commissionEarned > 0 ? formatMAD(commissionEarned) : '—', label: t('statsEarned'), good: commissionEarned > 0 },
            ].map((s, i) => (
              <div key={i} className="bg-surface rounded-lg border border-line px-2 py-3 text-center">
                <p className={`text-sm font-bold tabular-nums ${s.good ? 'text-success-fg' : 'text-foreground'}`}>
                  {s.value}
                </p>
                <p className="text-[10px] text-faint leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Affiliate link */}
        <div className="mt-6 bg-surface rounded-xl border border-line p-4">
          <p className="text-xs font-semibold text-muted mb-2">{t('affiliateLinkTitle')}</p>
          <p className="text-xs text-faint break-all mb-3 tabular-nums">{referralUrl}</p>
          <CopyLinkButton url={referralUrl} strings={copyLinkStrings} />
        </div>
      </main>
    </div>
  )
}
