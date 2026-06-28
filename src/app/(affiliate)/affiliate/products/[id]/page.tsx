import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CopyLinkButton } from '@/components/affiliate/copy-link-button'
import { AffiliateQrButton } from '@/components/affiliate/AffiliateQrButton'
import { CommissionCalculator } from '@/components/affiliate/CommissionCalculator'
import { AffiliateResellerDisclosure } from '@/components/affiliate/AffiliateResellerDisclosure'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getProductCoverUrl, getMeaningfulDescription } from '@/lib/product-media'
import { formatDH, calculateNetAffiliateCommission, DELIVERY_PROVISION_MAD } from '@/lib/utils'
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

  // Stock de la variante par défaut — remplace l'agrégat produit pour l'affichage.
  // Quand plusieurs variantes : n'affiche que la variante défaut (= sélection initiale).
  // Pour 0 variante : fallback sur product.stock_count (équivalent, prouvé = SUM actif).
  const defaultVariant = variants.find((v) => v.is_default) ?? variants[0] ?? null
  const defaultVariantStock = defaultVariant?.stock_count ?? product.stock_count

  // Dict sérialisable variantId → dispo, construit SERVEUR (rule #2 : aucune fonction passée
  // au Client). Labels = strings i18n résolues (namespace affiliate.products).
  const availabilityByVariant: Record<string, { inStock: boolean; lowStock: boolean; label: string }> = {}
  for (const v of variants) {
    availabilityByVariant[v.id] = {
      inStock: v.stock_count > 0,
      lowStock: v.stock_count > 0 && v.stock_count <= 5,
      label: v.stock_count > 0 ? t('stockUnits', { count: v.stock_count }) : t('stockEmpty'),
    }
  }

  const variantStrings = {
    chooseOption: tVariant('chooseOption'),
    unavailable: tVariant('unavailable'),
    variantLabel: tVariant('variantLabel'),
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : 'http://localhost:3000')
  const referralUrl = `${APP_URL}/products/${product.id}?ref=${user.id}`

  const calcStrings = {
    title: t('keepDifference'),
    myPrice: t('myPrice'),
    priceSave: t('priceSave'),
    priceSaving: t('priceSaving'),
    priceSavedOk: t('priceSavedOk'),
    priceResetOk: t('priceResetOk'),
    commissionLabel: t('calcCommissionLabel'),
    testedChip: t.raw('calcTestedChip') as string,
    msgBelow: t.raw('calcMsgBelow') as string,
    msgNear: t('calcMsgNear'),
    msgOther: t('calcMsgOther'),
    freeLine: t('calcFreeLine'),
    decrease: t('calcDecrease'),
    increase: t('calcIncrease'),
  }
  const copyLinkStrings = { copy: t('copyLink'), copied: t('copied') }
  const qrStrings = {
    title: t('doorQrTitle'),
    desc: t('doorQrDesc'),
    hint: t('doorQrHint'),
    close: t('doorQrClose'),
  }
  // Bloc « Prix revendeur » pliable — strings DÉJÀ formatées en DH côté serveur
  // (formatDH = affichage seul, aucune valeur ni calcul touché). Règle #2 : strings only.
  const resellerDisclosureStrings = {
    summary: t('resellerSummary', { price: formatDH(product.sell_price) }),
    detail: t('resellerDetail', {
      delivery: formatDH(DELIVERY_PROVISION_MAD),
      packaging: formatDH(product.packaging_fee_mad ?? 10),
      confirmation: formatDH(product.confirmation_fee_mad ?? 10),
    }),
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

        {/* Hook or + sous-titre — accroche de tête (textes validés Abdou, affichage pur) */}
        <div className="mb-6 bg-accent-soft border border-gold-300 rounded-xl p-4">
          <p className="text-base font-bold text-accent-fg leading-snug">{t('affiliateHookGold')}</p>
          <p className="text-sm text-muted mt-1.5">{t('affiliateHookSubtitle')}</p>
        </div>

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
              {/* Stock : variante par défaut (server-side). Le VariantSelector affiche
                  la dispo de la variante SÉLECTIONNÉE (client-side, via availabilityByVariant). */}
              <span className={defaultVariantStock > 0 ? 'text-success-fg' : 'text-danger-fg'}>
                {t('stock')}&nbsp;:{' '}
                {defaultVariantStock > 0
                  ? t('stockUnits', { count: defaultVariantStock })
                  : t('stockEmpty')}
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

            {/* Calculateur de commission REMONTÉ ici (remplace l'ancien casier commission/
                prix catalogue — doublon supprimé). GARDE @finance : affiché UNIQUEMENT là où
                l'égalité commission = (custom − sell_price) = calculateNetAffiliateCommission
                (custom) est prouvée — produit règle-capital (baseCommission ≠ null) et NON
                miroir fournisseur. */}
            {baseCommission != null && product.source_supplier_product_id == null && (
              <div className="bg-surface rounded-xl border border-line px-4 pb-4">
                <CommissionCalculator
                  productId={product.id}
                  resellerPrice={product.sell_price}
                  currentCustomPrice={customPrice}
                  strings={calcStrings}
                />
              </div>
            )}

            {/* Conditionnement descriptif (P3) — rien si pack_size/pack_unit non posés */}
            <PackBreakdown
              price={product.sell_price}
              packSize={product.pack_size}
              packUnit={product.pack_unit}
              saleUnit={product.sale_unit}
            />

            {/* Sélecteur de variantes — Étape 7.A : affiche la dispo de la variante
                SÉLECTIONNÉE inline (dict sérialisable availabilityByVariant, aucune fonction
                au Client — règle #2). Caché si ≤ 1 variante. Le calculateur de commission et
                le prix catalogue restent gérés au-dessus (fiche LOT 1→5, doublon supprimé). */}
            <VariantSelector
              variants={variants}
              strings={variantStrings}
              availabilityByVariant={availabilityByVariant}
            />
          </div>
        </div>

        {/* Prix revendeur — bloc pliable (replié par défaut, accessible clavier).
            Montants formatés DH côté serveur ; livraison = DELIVERY_PROVISION_MAD. */}
        <AffiliateResellerDisclosure strings={resellerDisclosureStrings} />

        {/* Bloc vert — argument de vente (texte validé Abdou, affichage pur) */}
        <div className="mt-4 bg-success-soft border border-success rounded-xl p-4">
          <p className="text-sm text-success-fg font-medium">{t('affiliateGreenArgument')}</p>
        </div>

        {/* Stats */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-muted mb-2">{t('statsTitle')}</p>
          {/* Mobile : 2×2 pour ne pas serrer les valeurs DH ; desktop (sm+) INCHANGÉ = 4 colonnes. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { value: String(clicks), label: t('statsClicks') },
              { value: String(orders), label: t('statsOrders') },
              { value: convRate, label: t('statsConv') },
              { value: commissionEarned > 0 ? formatDH(commissionEarned) : '—', label: t('statsEarned'), good: commissionEarned > 0 },
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

        {/* 4 portes de conversion (textes validés Abdou) */}
        <div className="mt-6">
          {/* Porte primaire — j'ai déjà le client → ajouter une commande (présélection produit) */}
          <Link
            href={`/affiliate/orders/new?product_id=${product.id}`}
            className="block w-full rounded-xl bg-primary text-primary-foreground p-4 hover:opacity-90 transition-opacity"
          >
            <span className="flex items-center gap-1.5 text-[11px] opacity-90">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" />
              </svg>
              {t('doorAddOrderSmall')}
            </span>
            <span className="block text-base font-bold mt-0.5">{t('doorAddOrderTitle')}</span>
            <span className="block text-xs opacity-90 mt-1 leading-snug">{t('doorAddOrderDesc')}</span>
          </Link>

          {/* Séparateur */}
          <p className="text-center text-[11px] text-faint my-3">{t('doorSeparator')}</p>

          {/* 3 portes secondaires */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* WhatsApp — partage du lien (brand #25D366) */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(referralUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-start gap-1 rounded-xl border-2 bg-surface p-3 min-h-[44px] hover:bg-surface-2 transition-colors"
              style={{ borderColor: '#25D366' }}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#25D366' }}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t('doorWhatsAppTitle')}
              </span>
              <span className="text-[11px] text-muted leading-snug">{t('doorWhatsAppDesc')}</span>
            </a>

            {/* Mon QR — génération locale (client component) */}
            <AffiliateQrButton url={referralUrl} strings={qrStrings} />

            {/* Copier le lien */}
            <div className="flex flex-col items-start gap-1.5 rounded-xl border-2 border-line bg-surface p-3">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {t('doorCopyTitle')}
              </span>
              <span className="text-[11px] text-muted leading-snug">{t('doorCopyDesc')}</span>
              <CopyLinkButton url={referralUrl} strings={copyLinkStrings} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
