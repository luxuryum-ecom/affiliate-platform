import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildCodTimeline } from '@/components/shared/order-timeline'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Order, Commission, Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.orders')
  return { title: t('metaTitle') }
}

type OrderRow = Order & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> }

export default async function AffiliateOrdersPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliate.orders')
  const tCommon = await getTranslations('affiliate.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes, commissionsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('orders')
      .select('*, product:products(id, name, images, media)')
      .eq('affiliate_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id),
  ])

  const profile = profileRes.data as { full_name: string } | null
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const commissions = (commissionsRes.data ?? []) as Commission[]

  const commMap = new Map(commissions.map((c) => [c.order_id, c]))

  const count = (s: string) => orders.filter((o) => o.status === s).length

  const activeCommissions = commissions.filter((c) => !c.reversed)
  const totalPending = activeCommissions
    .filter((c) => c.status === 'pending' || c.status === 'approved')
    .reduce((s, c) => s + Number(c.amount), 0)
  const totalEarned = activeCommissions
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + Number(c.amount), 0)

  const STATUS_LABEL: Record<string, string> = {
    pending_confirmation: t('statusPendingConf'),
    confirmed:            t('statusConfirmed'),
    shipped:              t('statusShipped'),
    delivered:            t('statusDelivered'),
    returned:             t('statusReturned'),
  }

  const STATUS_CLS: Record<string, string> = {
    pending_confirmation: 'bg-warning-soft text-warning-fg border-warning',
    confirmed:            'bg-surface-2 text-muted border-line',
    shipped:              'bg-surface-2 text-muted border-line',
    delivered:            'bg-success-soft text-success-fg border-success',
    returned:             'bg-danger-soft text-danger-fg border-danger',
  }

  const PAYOUT_LABELS: Record<string, string> = {
    pending_confirmation: t('payoutLabelDefault'),
    confirmed:            t('payoutLabelDefault'),
    shipped:              t('payoutLabelDefault'),
    delivered:            t('payoutLabelDelivered'),
    returned:             t('payoutLabelReturned'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-end mb-6">
          <Link
            href="/affiliate/orders/new"
            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('newOrder')}
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[
            { key: 'statPendingConf', value: String(count('pending_confirmation')) },
            { key: 'statConfirmed',   value: String(count('confirmed')) },
            { key: 'statShipped',     value: String(count('shipped')) },
            { key: 'statDelivered',   value: String(count('delivered')) },
            { key: 'statReturned',    value: String(count('returned')) },
          ].map((s) => (
            <div key={s.key} className="bg-surface rounded-xl border border-line p-4">
              <p className="text-xs text-muted">{t(s.key as Parameters<typeof t>[0])}</p>
              <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="bg-warning-soft rounded-xl border border-warning p-4">
            <p className="text-xs text-muted">{t('commissionsDue')}</p>
            <p className="mt-1 text-xl font-bold text-warning-fg tabular-nums">{formatMAD(totalPending)}</p>
          </div>
          {totalEarned > 0 && (
            <div className="bg-success-soft rounded-xl border border-success p-4">
              <p className="text-xs text-muted">{t('commissionsTotal')}</p>
              <p className="mt-1 text-xl font-bold text-success-fg tabular-nums">{formatMAD(totalEarned)}</p>
            </div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-3">
          {t('historyTitle', { count: orders.length })}
        </h2>

        {orders.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('emptyOrders')}</p>
            <Link
              href="/affiliate/products"
              className="mt-3 inline-block text-sm text-gold-500 hover:text-gold-600 hover:underline"
            >
              {tCommon('browseCatalog')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const badge = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending_confirmation
              const badgeCls = STATUS_CLS[order.status] ?? STATUS_CLS.pending_confirmation
              const comm = commMap.get(order.id)
              const coverUrl = getProductCoverUrl(order.product)
              const commissionAmount =
                order.affiliate_commission_mad_snapshot ?? order.commission_amount
              const timeline = buildCodTimeline(order)

              return (
                <article
                  key={order.id}
                  className="bg-surface rounded-xl border border-line overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-4">
                    <ProductThumbnail
                      src={coverUrl}
                      name={order.product.name}
                      className="w-12 h-12 rounded-lg border text-[10px] shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-faint">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>
                          {badge}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-foreground">
                        {order.product.name} × {order.quantity}
                      </p>

                      <p className="text-xs text-muted mt-0.5">
                        {order.customer_city} · {formatMAD(order.total_amount)} ·{' '}
                        {new Date(order.created_at).toLocaleDateString(locale, {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>

                      <p className="text-xs mt-1.5">
                        {comm ? (
                          comm.reversed ? (
                            <span className="text-danger-fg font-medium">
                              {t('commCancelled', { amount: formatMAD(Number(comm.amount)) })}
                            </span>
                          ) : (
                            <span
                              className={`font-medium ${
                                comm.status === 'paid'
                                  ? 'text-success-fg'
                                  : comm.status === 'approved'
                                  ? 'text-muted'
                                  : 'text-warning-fg'
                              }`}
                            >
                              {t('commLabel', {
                                amount: formatMAD(Number(comm.amount)),
                                status: comm.status === 'paid'
                                  ? t('commStatusPaid')
                                  : comm.status === 'approved'
                                  ? t('commStatusApproved')
                                  : t('commStatusPending'),
                              })}
                            </span>
                          )
                        ) : commissionAmount > 0 ? (
                          <span className="text-faint">
                            {t('commExpected', {
                              amount: formatMAD(commissionAmount),
                              label: PAYOUT_LABELS[order.status] ?? t('payoutLabelDefault'),
                            })}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-line px-4 py-3 bg-surface-2">
                    <p className="text-xs font-medium text-muted mb-2">{t('tracking')}</p>
                    <OrderTimeline steps={timeline} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
