import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { Profile, SupplierProductSupplierView, SupplierType } from '@/types/database'
import {
  SUPPLIER_PRODUCT_SELECT,
  SUPPLIER_PRODUCT_STATUS_BADGES,
} from '@/lib/supplier-product-moderation'
import { isAwaitingFxRate } from '@/lib/supplier-pricing'
import { TelegramLinkCard } from '@/components/supplier/telegram-link-card'
import { StockUpdateForm } from '@/components/supplier/stock-update-form'
import { computeStockFreshness, stockAgeDays, stockNeedsConfirmation, stockNeedsWatch } from '@/lib/supplier-stock-freshness'
import { getTelegramLinkStatus } from '@/app/actions/telegram-link'
import { getProductLimitStatus } from '@/app/actions/premium'

export async function generateMetadata() {
  const t = await getTranslations('supplier.products')
  return { title: t('metaTitle') }
}

// Type fournisseur = info neutre (le drapeau différencie), plus de vert/bleu.
const SUPPLIER_TYPE_BADGE: Record<SupplierType, { label: string }> = {
  morocco:       { label: '🇲🇦 Maroc' },
  international: { label: '🌍 International' },
}
const TYPE_BADGE_CLS = 'bg-surface-2 text-muted border border-line'

export default async function SupplierProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, productsResult, telegramStatus, limitStatus] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      .select(SUPPLIER_PRODUCT_SELECT)
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false }),
    getTelegramLinkStatus(),
    getProductLimitStatus(user.id),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  const products = (productsResult.data ?? []) as SupplierProductSupplierView[]

  const t = await getTranslations('supplier.products')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  // V5-bis.3 — strings de la saisie manuelle de stock, résolues SERVEUR (sérialisables).
  const stockStrings = {
    stockLabel: t('stockManualLabel'),
    updateBtn: t('stockManualUpdate'),
    saving: t('stockManualSaving'),
    success: t('stockManualSuccess'),
    errorInvalidStock: t('stockErrorInvalid'),
    errorUnauthorized: t('stockErrorUnauthorized'),
    errorGeneric: t('stockErrorGeneric'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <TelegramLinkCard
            initialStatus={telegramStatus}
            quota={{
              current: limitStatus.currentCount,
              max: limitStatus.maxAllowed,
              isUnlimited: limitStatus.isUnlimited,
            }}
          />
        </div>
        {/* Catalog stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: t('statTotal'),    value: products.length,                                                       cls: 'bg-surface border-line text-foreground' },
            { label: t('statPending'),  value: products.filter((p) => p.approval_status === 'pending_review').length, cls: 'bg-warning-soft border-warning text-warning-fg' },
            { label: t('statApproved'), value: products.filter((p) => p.approval_status === 'approved').length,       cls: 'bg-success-soft border-success text-success-fg' },
            { label: t('statBlocked'),  value: products.filter((p) => p.approval_status === 'blocked').length,        cls: 'bg-danger-soft border-danger text-danger-fg' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-semibold text-foreground">{t('submissionsTitle')}</h1>
          <div className="flex gap-2">
            <Link
              href="/supplier/products/import"
              className="px-3 py-1.5 bg-surface border border-line text-foreground text-xs font-medium rounded-lg hover:bg-surface-2 transition-colors"
            >
              {t('ctaImport')}
            </Link>
            <Link
              href="/supplier/products/new"
              className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('ctaNew')}
            </Link>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyState')}</p>
            <Link
              href="/supplier/products/new"
              className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('emptyCtaNew')}
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {products.map((product) => {
              const badge = SUPPLIER_PRODUCT_STATUS_BADGES[product.approval_status]
              // V5-bis.3 — fraîcheur du stock déclaré (calcul SERVEUR, label sérialisable).
              const stockFr = computeStockFreshness(product.stock_quantity_updated_at)
              const stockTone: 'confirm' | 'watch' | 'none' =
                product.stock_quantity == null
                  ? 'none'
                  : stockNeedsConfirmation(stockFr)
                    ? 'confirm'
                    : stockNeedsWatch(stockFr)
                      ? 'watch'
                      : 'none'
              const stockFreshLabel =
                stockTone === 'confirm'
                  ? t('stockToConfirm')
                  : stockTone === 'watch'
                    ? t('stockUpdatedDaysAgo', { days: stockAgeDays(product.stock_quantity_updated_at) ?? 0 })
                    : ''
              return (
                <div key={product.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-foreground text-sm truncate max-w-[220px]">
                        {product.product_name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE_CLS}`}>
                        {SUPPLIER_TYPE_BADGE[product.supplier_type ?? 'morocco'].label}
                      </span>
                    </div>
                    <p className="text-xs text-muted flex flex-wrap gap-x-2">
                      {product.category && <span>{t('labelCategory', { value: product.category })}</span>}
                      {product.category && product.origin_country && <span className="text-line">·</span>}
                      {product.origin_country && <span>{t('labelOrigin', { value: product.origin_country })}</span>}
                      {product.min_quantity > 1 && (
                        <>
                          <span className="text-line">·</span>
                          <span>{t('labelMinQty', { count: product.min_quantity })}</span>
                        </>
                      )}
                      {product.suggested_wholesale_price_mad != null && (
                        <>
                          <span className="text-line">·</span>
                          <span>{t('labelSuggestedPrice', { price: product.suggested_wholesale_price_mad })}</span>
                        </>
                      )}
                    </p>
                    {product.approval_status === 'blocked' && (
                      <p className="mt-1 text-xs text-danger-fg bg-danger-soft rounded px-2 py-1">
                        {t('blockedNotice')}
                      </p>
                    )}
                    {isAwaitingFxRate(product) && (
                      <p className="mt-1 text-xs text-warning-fg bg-warning-soft border border-warning rounded px-2 py-1">
                        {t('awaitingFxRate', { currency: product.source_currency ?? '' })}
                      </p>
                    )}
                    <p className="text-xs text-faint mt-0.5">
                      {t('submittedOn', { date: new Date(product.created_at).toLocaleDateString(locale) })}
                    </p>
                    <StockUpdateForm
                      productId={product.id}
                      currentStock={product.stock_quantity}
                      freshnessLabel={stockFreshLabel}
                      freshnessTone={stockTone}
                      strings={stockStrings}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
