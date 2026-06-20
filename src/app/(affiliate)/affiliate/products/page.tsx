import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD, calculateNetAffiliateCommission, DELIVERY_PROVISION_MAD } from '@/lib/utils'
import { priceWithUnit, resolveUnitLabel } from '@/lib/units'
import { PackBreakdown } from '@/components/shared/pack-breakdown'
import { getTranslations } from 'next-intl/server'
import type { Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.products')
  return { title: t('metaTitle') }
}

export default async function AffiliateProductsPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliate.products')
  const tCommon = await getTranslations('affiliate.common')
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

  const productsRes = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .eq('approval_status', 'approved')
    .eq('affiliate_enabled', true)
    .order('created_at', { ascending: false }) as unknown as { data: Product[] | null; error: unknown }

  const list = productsRes.data ?? []

  // Aperçu commission au prix catalogue = prix_vente − capital.
  // Capital inclut déjà DELIVERY_PROVISION_MAD → on passe la même provision
  // pour ne compter la livraison qu'une fois. Au catalogue → commission = 0.
  const refDeliveryFee = DELIVERY_PROVISION_MAD

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle', { count: list.length })}
          </p>
        </div>

        {/* Accroche profit affilié */}
        <div className="mb-6 rounded-xl border border-gold-300 bg-accent-soft px-4 py-3">
          <p className="text-sm font-semibold text-accent-fg">💰 {t('catalogBanner')}</p>
        </div>

        {list.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyProducts')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {list.map((product) => {
              const coverUrl = getProductCoverUrl(product)
              // Si factory_cost_mad est null, on n'affiche pas de commission
              // (évite de calculer sur 0 qui donnerait un montant trompeur).
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
              const inStock = product.availability_type !== 'import_on_demand'
              return (
                <Link
                  key={product.id}
                  href={`/affiliate/products/${product.id}`}
                  className="group bg-surface rounded-xl border border-line overflow-hidden flex flex-col hover:border-gold-300 hover:shadow-premium transition-all duration-200"
                >
                  {/* Thumbnail */}
                  <div className="relative">
                    <ProductThumbnail
                      src={coverUrl}
                      name={product.name}
                      className="aspect-[4/3] w-full text-2xl"
                    />
                    <span
                      className={`absolute top-2 start-2 text-[10px] px-2 py-0.5 rounded-full border ${
                        inStock
                          ? 'bg-success-soft text-success-fg border-success'
                          : 'bg-surface/90 text-muted border-line'
                      }`}
                    >
                      {inStock ? t('availStock') : t('availImport')}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <h3 className="font-medium text-foreground text-sm leading-snug line-clamp-2">
                      {product.name}
                    </h3>

                    {/* Incitation affilié — le gain par vente mis en avant (or signature).
                        Réutilise calculateNetAffiliateCommission (zéro nouveau calcul). */}
                    <div className="mt-auto pt-1">
                      {baseCommission != null && baseCommission > 0 ? (
                        <div className="rounded-lg bg-accent-soft border border-gold-300 px-2.5 py-1.5">
                          <p className="text-[11px] font-medium text-accent-fg">{t('earnPerSaleLabel')}</p>
                          <p className="text-xl font-extrabold text-success-fg tabular-nums leading-tight">
                            {formatMAD(baseCommission)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-accent-fg">{t('adjustPrice')}</p>
                      )}
                      <p className="text-[11px] text-faint mt-0.5">
                        {t('catalogPrice')}&nbsp;:{' '}
                        {/* Suffixe d'unité AJOUTÉ seulement si sale_unit posé → produit
                            sans unité (NULL) = affichage strictement identique à avant. */}
                        <span className="text-muted tabular-nums">
                          {priceWithUnit(
                            formatMAD(product.sell_price),
                            product.sale_unit ? resolveUnitLabel(product.sale_unit, tUnits) : null,
                          )}
                        </span>
                      </p>
                      {/* Conditionnement descriptif (D1) — « contenant de N — ≈ X/unité ».
                          Rien si pack_size/pack_unit non posés (produit à la pièce inchangé). */}
                      <div className="mt-0.5 text-[10px]">
                        <PackBreakdown
                          price={product.sell_price}
                          packSize={product.pack_size}
                          packUnit={product.pack_unit}
                          saleUnit={product.sale_unit}
                        />
                      </div>
                      <p className="text-[10px] text-success-fg mt-0.5">{t('priceAllInclusiveShort')}</p>
                    </div>

                    {/* CTA */}
                    <span className="mt-1 w-full text-center text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground group-hover:opacity-90 transition-opacity">
                      {t('viewPromote')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
