import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderFilters } from '@/components/admin/order-filters'
import { QuickStatusButton } from '@/components/admin/quick-status-button'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Order, Product, Profile, OrderStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.orders')
  return { title: t('metaTitle') }
}

const STATUS_CLS: Record<string, string> = {
  pending_confirmation: 'bg-warning-soft text-warning-fg border-warning',
  confirmed: 'bg-surface-2 text-muted border-line',
  shipped:   'bg-surface-2 text-muted border-line',
  delivered: 'bg-success-soft text-success-fg border-success',
  returned:  'bg-danger-soft text-danger-fg border-danger',
  cancelled: 'bg-surface-2 text-faint border-line',
}

type OrderRowData = Order & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media'>
  affiliate: Pick<Profile, 'id' | 'full_name'> | null
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    search?: string
    affiliate_id?: string
  }>
}

const STATUSES: OrderStatus[] = ['pending_confirmation', 'confirmed', 'shipped', 'delivered', 'returned']

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status: filterStatus, search, affiliate_id } = await searchParams
  const supabase = await createClient()
  const t = await getTranslations('admin.orders')
  const tc = await getTranslations('admin.common')

  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const profile = profileRes.data as { full_name: string } | null

  // ── Fetch affiliates for filter dropdown ──────────────────────────────────
  const { data: affiliateRows } = (await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'affiliate')
    .eq('status', 'approved')
    .order('full_name')) as {
    data: { id: string; full_name: string }[] | null
    error: unknown
  }
  const affiliates = affiliateRows ?? []

  // ── Build orders query ────────────────────────────────────────────────────
  let query = supabase
    .from('orders')
    .select('*, product:products(id, name, images, media), affiliate:profiles!affiliate_id(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (filterStatus)  query = query.eq('status', filterStatus)
  if (affiliate_id)  query = query.eq('affiliate_id', affiliate_id)
  const raw = search?.trim().replace(/^#/, '') ?? ''
  const isRefSearch = /^[0-9a-f]{8}$/i.test(raw)

  if (raw) {
    if (isRefSearch) {
      // UUID prefix — PostgREST casts UUID to text automatically for LIKE
      query = query.like('id', `${raw.toLowerCase()}%`)
    } else {
      const term = `%${raw}%`
      query = query.or(`customer_name.ilike.${term},customer_phone.ilike.${term},customer_city.ilike.${term}`)
    }
  }

  const { data: orders } = (await query) as { data: OrderRowData[] | null; error: unknown }
  const list = orders ?? []

  // ── Status counts (always over full dataset) ──────────────────────────────
  const { data: allStatuses } = (await supabase
    .from('orders')
    .select('status')) as { data: { status: string }[] | null; error: unknown }
  const countMap = (allStatuses ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const isFiltered = !!(filterStatus || search || affiliate_id)

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

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* Search + affiliate filter */}
        <Suspense fallback={null}>
          <OrderFilters affiliates={affiliates} />
        </Suspense>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href="/admin/orders"
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterStatus && !isFiltered
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface border-line text-muted hover:bg-surface-2'
            }`}
          >
            {tc('all')} ({(allStatuses ?? []).length})
          </Link>
          {STATUSES.map((s) => {
            const cnt = countMap[s] ?? 0
            return (
              <Link
                key={s}
                href={`/admin/orders?status=${s}${search ? `&search=${encodeURIComponent(search)}` : ''}${affiliate_id ? `&affiliate_id=${affiliate_id}` : ''}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-line text-muted hover:bg-surface-2'
                }`}
              >
                {tc(`cod.${s}`)} ({cnt})
              </Link>
            )
          })}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted">
            {t('resultCount', { count: list.length })}
            {isFiltered ? tc('filtered') : ''}
          </p>
        </div>

        {/* Order list */}
        {list.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{isFiltered ? t('emptyFiltered') : t('empty')}</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {list.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Single order row / card ──────────────────────────────────────────────────

async function OrderRow({ order }: { order: OrderRowData }) {
  const t = await getTranslations('admin.orders')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const cls = STATUS_CLS[order.status] ?? STATUS_CLS.pending_confirmation
  const coverUrl = order.product ? getProductCoverUrl(order.product) : null
  const ref   = order.id.slice(0, 8).toUpperCase()

  return (
    <div className="p-4 hover:bg-surface-2 transition-colors">
      {/* Row: thumbnail + content + actions */}
      <div className="flex items-start gap-3">
        <ProductThumbnail
          src={coverUrl}
          name={order.product?.name ?? tc('productFallback')}
          className="w-10 h-10 rounded-lg border border-line text-[10px]"
        />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Header line: ref + status + date */}
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="text-xs font-mono text-faint">#{ref}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{tc(`cod.${order.status}`)}</span>
            {!order.affiliate_id && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-faint border border-line">{tc('direct')}</span>
            )}
            <span className="text-xs text-faint ml-auto hidden sm:block tabular-nums">
              {new Date(order.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}
            </span>
          </div>

          {/* Customer line */}
          <p className="text-sm font-medium text-foreground truncate">
            {order.customer_name}
            <span className="font-normal text-muted"> — {order.customer_city}</span>
          </p>

          {/* Product + total line */}
          <p className="text-xs text-muted mt-0.5 truncate">
            {order.product?.name} × {order.quantity}
            {' · '}
            <strong className="text-foreground">{formatMAD(order.total_amount)}</strong>
            {order.affiliate && <> · <span className="text-muted">{order.affiliate.full_name}</span></>}
          </p>

          {/* COD anomaly flag */}
          {order.cod_received != null &&
           order.cod_expected != null &&
           order.cod_received < order.cod_expected && (
            <p className="text-xs text-danger-fg mt-0.5">
              {t('codGap', { expected: formatMAD(order.cod_expected), received: formatMAD(order.cod_received) })}
            </p>
          )}
        </div>

        {/* Detail link (desktop) */}
        <Link
          href={`/admin/orders/${order.id}`}
          className="shrink-0 text-xs text-gold-500 hover:text-gold-600 hover:underline hidden sm:block"
        >
          {tc('details')}
        </Link>
      </div>

      {/* Quick actions + mobile link */}
      <div className="flex flex-wrap items-center gap-2 mt-2 pl-10 sm:pl-[52px]">
        <QuickActions order={order} />
        <Link
          href={`/admin/orders/${order.id}`}
          className="text-xs text-gold-500 hover:text-gold-600 hover:underline sm:hidden"
        >
          {tc('view')}
        </Link>
      </div>
    </div>
  )
}

// Quick action buttons based on current status
async function QuickActions({ order }: { order: OrderRowData }) {
  const t = await getTranslations('admin.orders')
  if (order.status === 'pending_confirmation') {
    return (
      <QuickStatusButton orderId={order.id} newStatus="confirmed" label={`✓ ${t('actionConfirm')}`} variant="confirm" />
    )
  }
  if (order.status === 'confirmed') {
    return (
      <QuickStatusButton orderId={order.id} newStatus="shipped" label={`→ ${t('actionShip')}`} variant="ship" />
    )
  }
  if (order.status === 'shipped') {
    return (
      <>
        <QuickStatusButton orderId={order.id} newStatus="delivered" label={`✓ ${t('actionDeliver')}`} variant="deliver" />
        <QuickStatusButton orderId={order.id} newStatus="returned" label={`↩ ${t('actionReturn')}`} variant="cancel" />
      </>
    )
  }
  return null
}
