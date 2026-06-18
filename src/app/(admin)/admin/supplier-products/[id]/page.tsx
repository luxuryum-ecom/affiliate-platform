import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import {
  ApproveSupplierProductForm,
  RejectSupplierProductForm,
} from '@/components/admin/supplier-product-review'
import {
  MODERATION_FLAG_LABELS,
  MODERATION_SIGNAL_LABELS,
  SUPPLIER_PRODUCT_STATUS_BADGES,
  type ModerationSignal,
} from '@/lib/supplier-product-moderation'
import type {
  SupplierProduct,
  Profile,
  SupplierType,
  SupplierProductMoqTier,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierProducts')
  return { title: t('detailMetaTitle') }
}

type SupplierProductFull = SupplierProduct & {
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
  supplier_product_moq_tiers: SupplierProductMoqTier[]
}

interface PageProps {
  params: Promise<{ id: string }>
}

async function SupplierSection({
  product,
  t,
}: {
  product: SupplierProductFull
  t: Awaited<ReturnType<typeof getTranslations<'admin.supplierProducts'>>>
}) {
  return (
    <div className="bg-warning-soft border border-warning rounded-xl p-5">
      <p className="text-xs font-semibold text-warning-fg uppercase tracking-wide mb-3">
        {t('detailSupplierSection')}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-warning-fg text-xs opacity-70">{t('detailSupplierName')}</dt>
          <dd className="text-foreground font-medium">{product.supplier?.full_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-warning-fg text-xs opacity-70">{t('detailSupplierPhone')}</dt>
          <dd className="text-foreground font-medium">{product.supplier?.phone ?? '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

async function AiModerationSection({
  product,
  t,
}: {
  product: SupplierProductFull
  t: Awaited<ReturnType<typeof getTranslations<'admin.supplierProducts'>>>
}) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-5">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
        {t('detailAiSection')}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-faint text-xs">{t('detailAiSignal')}</dt>
          <dd className="text-foreground font-medium">
            {product.moderation_flag
              ? MODERATION_FLAG_LABELS[product.moderation_flag]
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-faint text-xs">{t('detailRiskScore')}</dt>
          <dd className="text-foreground font-bold tabular-nums">
            {product.ai_risk_score != null
              ? t('detailRiskValue', { score: product.ai_risk_score })
              : '—'}
          </dd>
        </div>
        {product.moderation_signals.length > 0 && (
          <div className="col-span-2">
            <dt className="text-faint text-xs">{t('detailAlerts')}</dt>
            <dd className="flex flex-wrap gap-1.5 mt-1">
              {product.moderation_signals.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 rounded-full border bg-surface border-line text-muted"
                >
                  {MODERATION_SIGNAL_LABELS[s as ModerationSignal] ?? s}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-faint text-xs">{t('detailModerationReason')}</dt>
          <dd className="text-muted text-sm mt-0.5 bg-surface rounded-lg px-3 py-2 border border-line">
            {product.moderation_reason ?? '—'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default async function AdminSupplierProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('admin.supplierProducts')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('supplier_products')
    .select(`
      *,
      supplier:profiles!supplier_id(id, full_name, phone, city),
      supplier_product_moq_tiers(min_quantity, unit_price_usd)
    `)
    .eq('id', id)
    .single()

  if (!data) notFound()

  const product = data as unknown as SupplierProductFull
  const badge = SUPPLIER_PRODUCT_STATUS_BADGES[product.approval_status]
  const tiers = product.supplier_product_moq_tiers ?? []

  const supplierTypeLabelKey = product.supplier_type === 'morocco'
    ? 'supplierTypeMorocco'
    : 'supplierTypeInternational'

  const isRTL = locale === 'ar'

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={product.product_name}
        backHref="/admin/supplier-products"
        backLabel={t('backList')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-4">

            <AiModerationSection product={product} t={t} />

            <div className="bg-surface rounded-xl border border-line p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h1 className="text-base font-semibold text-foreground">{product.product_name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border bg-surface-2 text-muted border-line font-medium">
                  {product.supplier_type === 'morocco' ? '🇲🇦' : '🌍'}{' '}
                  {t(supplierTypeLabelKey)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-faint text-xs">{t('detailCategory')}</dt>
                  <dd className="text-foreground font-medium">{product.category || '—'}</dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('detailMoq')}</dt>
                  <dd className="text-foreground font-medium">{product.min_quantity} {product.unit}</dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('detailStock')}</dt>
                  <dd className="text-foreground font-medium">
                    {product.stock_quantity != null
                      ? product.stock_quantity.toLocaleString(locale)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('detailLeadTime')}</dt>
                  <dd className="text-foreground font-medium">
                    {product.lead_time_days != null ? product.lead_time_days : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-faint text-xs">{t('detailSuggestedPrice')}</dt>
                  <dd className="text-foreground font-medium">
                    {product.suggested_wholesale_price_mad != null
                      ? `${product.suggested_wholesale_price_mad} MAD`
                      : product.supplier_unit_price_usd != null
                        ? `${product.supplier_unit_price_usd} USD / u.`
                        : '—'}
                  </dd>
                </div>
                {tiers.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-faint text-xs mb-1">{t('detailPriceTiers')}</dt>
                    <dd>
                      <ul className="text-sm text-foreground space-y-1">
                        {tiers
                          .sort((a, b) => a.min_quantity - b.min_quantity)
                          .map((tier, i) => (
                            <li key={i} className="bg-surface-2 rounded px-2 py-1">
                              {t('detailTierLine', {
                                qty:   tier.min_quantity,
                                price: tier.unit_price_usd,
                              })}
                            </li>
                          ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {product.description && (
                  <div className="col-span-2">
                    <dt className="text-faint text-xs">{t('detailDescription')}</dt>
                    <dd className="text-muted text-sm leading-relaxed mt-0.5">{product.description}</dd>
                  </div>
                )}
              </dl>

              {product.photos.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-faint mb-2">
                    {t('detailPhotos', { count: product.photos.length })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.photos.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gold-500 hover:text-gold-600 bg-surface-2 border border-line px-2 py-1 rounded transition-colors"
                      >
                        {t('detailPhotoLink', { n: i + 1 })}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <SupplierSection product={product} t={t} />
          </div>

          {/* ── Right column — action panels ── */}
          <div className="space-y-4">
            {/* Flux « Finaliser » (Option 1) : ouvre le formulaire produit complet,
                pré-rempli avec les BASIQUES de ce supplier_product. Visible uniquement
                quand le produit fournisseur est validé. */}
            {product.approval_status === 'approved' && (
              <div className="bg-surface rounded-xl border border-gold-500/40 p-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">
                  {t('detailFinalizeSection')}
                </h2>
                <p className="text-xs text-muted mb-3">{t('detailFinalizeHint')}</p>
                <Link
                  href={`/admin/products/new?from_supplier=${product.id}`}
                  className="block w-full text-center py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  {t('detailFinalizeToCatalog')}
                </Link>
              </div>
            )}

            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                {t('detailApproveSection')}
              </h2>
              <ApproveSupplierProductForm
                id={product.id}
                publicName={product.public_name}
                publicDescription={product.public_description}
                platformMarginType={product.platform_margin_type}
                platformMarginValue={product.platform_margin_value}
                applyPlatformMargin={product.apply_platform_margin}
                adminNotes={product.admin_notes}
              />
            </div>

            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                {t('detailBlockSection')}
              </h2>
              <RejectSupplierProductForm
                id={product.id}
                adminNotes={product.admin_notes}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
