import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { ProductActions } from '@/components/admin/product-actions'
import { ProductFilters } from '@/components/admin/product-filters'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD } from '@/lib/utils'
import { getTranslations } from 'next-intl/server'
import type { Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.products')
  return { title: t('metaTitle') }
}

// ── Token maps ────────────────────────────────────────────────────────────────

const APPROVAL_CLS: Record<string, string> = {
  draft:          'bg-surface-2 text-faint border-line',
  pending_review: 'bg-warning-soft text-warning-fg border-warning',
  approved:       'bg-success-soft text-success-fg border-success',
  rejected:       'bg-danger-soft text-danger-fg border-danger',
}

const AVAILABILITY_CLS: Record<string, string> = {
  local_stock:      'bg-success-soft text-success-fg border-success',
  import_on_demand: 'bg-surface-2 text-muted border-line',
}

// ─────────────────────────────────────────────────────────────────────────────

interface SearchParams {
  availability_type?: string
  approval_status?: string
  active?: string
  country?: string
  search?: string
  low_stock?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const t = await getTranslations('admin.products')
  const tc = await getTranslations('admin.common')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: { full_name: string; role: string } | null; error: unknown }

  // ── Build query with filters ───────────────────────────────────────────────
  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.availability_type) query = query.eq('availability_type', filters.availability_type)
  if (filters.approval_status) query = query.eq('approval_status', filters.approval_status)
  if (filters.active === 'true')  query = query.eq('active', true)
  else if (filters.active === 'false') query = query.eq('active', false)
  if (filters.country)        query = query.eq('origin_country', filters.country)
  if (filters.low_stock === 'true') query = query.lt('stock_count', 5)

  // Full-text search via ilike (backed by pg_trgm index from migration 005)
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    query = query.or(`name.ilike.${term},supplier_name.ilike.${term},origin_country.ilike.${term}`)
  }

  const { data: products } = (await query) as { data: Product[] | null; error: unknown }
  const list = products ?? []

  // ── Stats for header ───────────────────────────────────────────────────────
  const { data: allProducts } = (await supabase
    .from('products')
    .select('active, approval_status, origin_country')) as {
    data: Pick<Product, 'active' | 'approval_status' | 'origin_country'>[] | null
    error: unknown
  }

  const all = allProducts ?? []
  const totalCount = all.length
  const activeCount = all.filter((p) => p.active).length
  const pendingReview = all.filter((p) => p.approval_status === 'pending_review').length

  // Distinct countries for the filter dropdown
  const countries = [
    ...new Set(
      all.map((p) => p.origin_country).filter((c): c is string => !!c)
    ),
  ].sort()

  const isFiltered =
    !!filters.availability_type ||
    !!filters.approval_status ||
    !!filters.active ||
    !!filters.country ||
    !!filters.search ||
    filters.low_stock === 'true'

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5 flex flex-wrap gap-x-2">
              <span>{t('statsTotal', { count: totalCount })}</span>
              <span className="text-faint">·</span>
              <span className="text-success-fg">{t('statsActive', { count: activeCount })}</span>
              {pendingReview > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <Link
                    href="/admin/products?approval_status=pending_review"
                    className="text-warning-fg hover:underline"
                  >
                    {t('statsPending', { count: pendingReview })}
                  </Link>
                </>
              )}
              {isFiltered && (
                <>
                  <span className="text-faint">·</span>
                  <span className="text-gold-500">{t('statsFiltered', { count: list.length })}</span>
                </>
              )}
            </p>
          </div>
          <Link
            href="/admin/products/new"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('newProduct')}
          </Link>
        </div>

        {/* Filter bar — client component wrapped in Suspense */}
        <div className="mb-4">
          <Suspense fallback={null}>
            <ProductFilters countries={countries} />
          </Suspense>
        </div>

        {/* List */}
        {list.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">
              {isFiltered ? t('emptyFiltered') : t('empty')}
            </p>
            {isFiltered ? (
              <Link
                href="/admin/products"
                className="mt-3 inline-block text-sm text-gold-500 hover:text-gold-600 hover:underline"
              >
                {t('clearFilters')}
              </Link>
            ) : (
              <Link
                href="/admin/products/new"
                className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('createFirst')}
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {list.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Product row ──────────────────────────────────────────────────────────────

async function ProductRow({ product }: { product: Product }) {
  const t = await getTranslations('admin.products')
  const tc = await getTranslations('admin.common')
  const coverUrl = getProductCoverUrl(product)
  const approvalCls = APPROVAL_CLS[product.approval_status] ?? APPROVAL_CLS.draft
  const sourceCls = AVAILABILITY_CLS[product.availability_type] ?? AVAILABILITY_CLS.local_stock

  return (
    <div className="flex items-start gap-3 p-4 hover:bg-surface-2 transition-colors">
      {/* Thumbnail */}
      <div className="relative shrink-0">
        <ProductThumbnail
          src={coverUrl}
          name={product.name}
          className="w-12 h-12 rounded-lg border border-line text-xs"
        />
        {!coverUrl && (
          <span className="absolute -bottom-1.5 -right-1.5 text-xs bg-warning-soft text-warning-fg rounded px-1 leading-tight font-medium border border-warning">
            !
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="font-medium text-foreground text-sm truncate max-w-[180px]">
            {product.name}
          </span>

          {/* Source badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${sourceCls}`}>
            {t(`availability.${product.availability_type}` as 'availability.local_stock')}
          </span>

          {/* Approval badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${approvalCls}`}>
            {t(`approval.${product.approval_status}` as 'approval.draft')}
          </span>

          {/* No image badge */}
          {!coverUrl && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-warning-soft text-warning-fg border-warning">
              {tc('noImage')}
            </span>
          )}

          {/* Affiliate enabled badge */}
          {!product.affiliate_enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-surface-2 text-muted border-line">
              {tc('wholesaleOnly')}
            </span>
          )}

          {/* Active / inactive */}
          {product.approval_status === 'approved' && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${
                product.active
                  ? 'bg-success-soft text-success-fg border-success'
                  : 'bg-surface-2 text-faint border-line'
              }`}
            >
              {product.active ? tc('visible') : tc('hidden')}
            </span>
          )}
        </div>

        {/* Pricing line */}
        <p className="text-xs text-muted leading-relaxed flex flex-wrap gap-x-2">
          <span>
            {t('priceLine')}&nbsp;:{' '}
            <strong className="text-foreground">{formatMAD(product.sell_price)}</strong>
          </span>
          <span className="text-faint">·</span>
          <span>
            {t('commissionLine')}&nbsp;:{' '}
            <strong className="text-success-fg">{formatMAD(product.commission_amount)}</strong>
          </span>
          <span className="text-faint">·</span>
          <span>{t('stockLine')}&nbsp;: {product.stock_count}</span>
          {product.wholesale_tiers.length > 0 && (
            <>
              <span className="text-faint">·</span>
              <span>
                {t('wholsaleTiers', { count: product.wholesale_tiers.length })}
              </span>
            </>
          )}
        </p>

        {/* Cost breakdown mini-line */}
        {(product.factory_cost_mad != null || product.purchase_price_mad != null || product.supplier_name || product.origin_country) && (
          <p className="text-xs text-faint leading-relaxed flex flex-wrap gap-x-2 mt-0.5">
            {(product.factory_cost_mad != null || product.purchase_price_mad != null) && (
              <>
                <span>
                  {t('costLine')}&nbsp;: {formatMAD(product.factory_cost_mad ?? product.purchase_price_mad ?? 0)}
                </span>
                {product.platform_margin_value != null && (
                  <>
                    <span className="text-line">·</span>
                    <span>
                      {t('marginLine')}&nbsp;:{' '}
                      {product.platform_margin_type === 'percentage'
                        ? `${product.platform_margin_value}%`
                        : `${formatMAD(product.platform_margin_value)}`}
                    </span>
                  </>
                )}
                <span className="text-line">·</span>
                <span>
                  {t('feesLine')}&nbsp;: {formatMAD(
                    (product.confirmation_fee_mad ?? 0) +
                    (product.packaging_fee_mad ?? 0) +
                    (product.delivery_fee_mad ?? 0)
                  )}
                </span>
              </>
            )}
            {product.supplier_name && (
              <>
                <span className="text-line">·</span>
                <span>{product.supplier_name}</span>
              </>
            )}
            {product.origin_country && (
              <>
                <span className="text-line">·</span>
                <span>{product.origin_country}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      <ProductActions id={product.id} name={product.name} active={product.active} />
    </div>
  )
}
