import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildWholesaleTimeline } from '@/components/shared/order-timeline'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { WholesaleOrderBuyerView, WholesaleOrderItem, Product, Profile, WholesaleImportStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.orders')
  return { title: t('metaTitle') }
}

type OrderWithItems = WholesaleOrderBuyerView & {
  items: (WholesaleOrderItem & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> })[]
}

type BillingProfile = Pick<Profile, 'full_name'>

interface PageProps {
  searchParams: Promise<{ submitted?: string }>
}

export default async function WholesaleOrdersPage({ searchParams }: PageProps) {
  const { submitted } = await searchParams
  const showSubmittedBanner = submitted === '1'

  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.orders'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('wholesale_orders_buyer_read')
      .select('*, items:wholesale_order_items(*, product:products(id,name,images,media))')
      .eq('buyer_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data as BillingProfile | null
  const orders = (ordersRes.data ?? []) as OrderWithItems[]

  const active   = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const archived = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status))

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {showSubmittedBanner && (
          <div className="bg-success-soft border border-success rounded-xl px-4 py-3 text-sm text-success-fg">
            {t('submittedBanner')}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyState')}</p>
            <Link
              href="/wholesale/products"
              className="mt-3 inline-block text-sm text-muted hover:text-foreground hover:underline transition-colors"
            >
              {t('emptyCta')}
            </Link>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {t('activeSection', { count: active.length })}
                </h2>
                <div className="space-y-4">
                  {active.map((order) => (
                    <OrderCard key={order.id} order={order} t={t} locale={locale} />
                  ))}
                </div>
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {t('archiveSection', { count: archived.length })}
                </h2>
                <div className="space-y-3">
                  {archived.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      compact={order.status === 'cancelled'}
                      t={t}
                      locale={locale}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ── Status maps (keys match DB enum values → i18n key suffix) ────────────────

const STATUS_KEY: Record<string, { key: string; cls: string; icon: string }> = {
  pending:   { key: 'statusPending',   cls: 'bg-warning-soft text-warning-fg',   icon: '⏳' },
  confirmed: { key: 'statusConfirmed', cls: 'bg-surface-2 text-muted border border-line', icon: '✓' },
  sourcing:  { key: 'statusSourcing',  cls: 'bg-warning-soft text-warning-fg',   icon: '🔍' },
  shipped:   { key: 'statusShipped',   cls: 'bg-surface-2 text-muted border border-line', icon: '🚚' },
  delivered: { key: 'statusDelivered', cls: 'bg-success-soft text-success-fg',   icon: '✓✓' },
  cancelled: { key: 'statusCancelled', cls: 'bg-surface-2 text-faint',           icon: '✗' },
}

const IMPORT_STATUS_KEY: Record<WholesaleImportStatus, { key: string; cls: string }> = {
  awaiting_supplier: { key: 'importAwaitingSupplier', cls: 'bg-surface-2 text-muted' },
  purchased:         { key: 'importPurchased',        cls: 'bg-warning-soft text-warning-fg' },
  in_production:     { key: 'importInProduction',     cls: 'bg-warning-soft text-warning-fg' },
  ready_to_ship:     { key: 'importReadyToShip',      cls: 'bg-warning-soft text-warning-fg' },
  shipped:           { key: 'importShipped',          cls: 'bg-surface-2 text-muted border border-line' },
  customs_clearance: { key: 'importCustomsClearance', cls: 'bg-warning-soft text-warning-fg' },
  delivered:         { key: 'importDelivered',        cls: 'bg-success-soft text-success-fg' },
}

// ── OrderCard ────────────────────────────────────────────────────────────────

type TFn = Awaited<ReturnType<typeof getTranslations<'wholesale.orders'>>>

function OrderCard({
  order,
  compact = false,
  t,
  locale,
}: {
  order: OrderWithItems
  compact?: boolean
  t: TFn
  locale: string
}) {
  const statusEntry = STATUS_KEY[order.status] ?? STATUS_KEY.pending
  const importEntry = order.import_status
    ? IMPORT_STATUS_KEY[order.import_status as WholesaleImportStatus]
    : null
  const isDelivered = order.status === 'delivered'

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
  const fmtShort = (d: string) =>
    new Date(d).toLocaleDateString(locale)

  return (
    <div className={`bg-surface rounded-xl border border-line p-5 ${compact ? 'opacity-75' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/wholesale/orders/${order.id}`}
              className="font-mono text-xs text-faint hover:text-foreground hover:underline"
            >
              #{order.id.slice(0, 8).toUpperCase()}
            </Link>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusEntry.cls}`}>
              {statusEntry.icon} {t(statusEntry.key as Parameters<TFn>[0])}
            </span>
            {importEntry && (
              <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importEntry.cls}`}>
                {t(importEntry.key as Parameters<TFn>[0])}
              </span>
            )}
            {isDelivered && order.invoice_requested && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-fg border border-gold-300">
                {t('badgeInvoiceRequested')}
              </span>
            )}
          </div>
          <p className="text-xs text-faint mt-0.5">
            {fmt(order.created_at)}
          </p>
        </div>
        <p className="text-lg font-bold text-foreground">{formatMAD(order.total_amount)}</p>
      </div>

      {/* Visual timeline for active orders */}
      {!compact && !['delivered', 'cancelled'].includes(order.status) && (
        <div className="mb-4">
          <OrderTimeline steps={buildWholesaleTimeline(order)} />
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {order.items.slice(0, compact ? 2 : 10).map((item) => {
          const coverUrl = getProductCoverUrl(item.product)
          return (
            <div key={item.id} className="flex items-center gap-2">
              <ProductThumbnail
                src={coverUrl}
                name={item.product.name}
                className="w-8 h-8 rounded-md border border-line shrink-0 text-[8px]"
              />
              <p className="text-xs text-muted flex-1 truncate">
                {item.product.name} <span className="text-faint">×{item.quantity}</span>
              </p>
              <p className="text-xs font-medium text-foreground shrink-0">{formatMAD(item.subtotal)}</p>
            </div>
          )
        })}
        {compact && order.items.length > 2 && (
          <p className="text-xs text-faint ps-10">
            {t('moreItems', { count: order.items.length - 2 })}
          </p>
        )}
      </div>

      {/* Timestamps */}
      {!compact && (
        <div className="mt-4 space-y-1 border-t border-line pt-3">
          {order.confirmed_at && (
            <p className="text-xs text-faint">
              {t('confirmedOn', { date: fmtShort(order.confirmed_at) })}
            </p>
          )}
          {order.shipped_at && (
            <p className="text-xs text-faint">
              {t('shippedOn', { date: fmtShort(order.shipped_at) })}
            </p>
          )}
          {order.delivered_at && (
            <p className="text-xs text-success-fg font-medium">
              {t('deliveredOn', { date: fmtShort(order.delivered_at) })}
            </p>
          )}
          {order.cancelled_at && (
            <p className="text-xs text-danger-fg">
              {t('cancelledOn', { date: fmtShort(order.cancelled_at) })}
            </p>
          )}
        </div>
      )}

      {/* CTA: view detail / request invoice */}
      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3">
        <Link
          href={`/wholesale/orders/${order.id}`}
          className="text-xs text-muted hover:text-foreground hover:underline transition-colors"
        >
          {t('viewDetail')}
        </Link>
        {isDelivered && !order.invoice_requested && (
          <Link
            href={`/wholesale/orders/${order.id}`}
            className="text-xs font-medium text-muted border border-line rounded-lg px-3 py-1.5 hover:bg-surface-2 transition-colors"
          >
            {t('requestInvoice')}
          </Link>
        )}
      </div>
    </div>
  )
}
