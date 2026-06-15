import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { createWholesaleOrderAction } from '@/app/actions/orders'
import type { WholesaleOrder, Profile, WholesaleCartItemWithProduct, WholesaleImportStatus, WholesalePaymentStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.wholesaleOrders')
  return { title: t('metaTitle') }
}

// CSS only — labels via t()
const STATUS_CLS: Record<string, string> = {
  pending:   'bg-warning-soft text-warning-fg border-warning',
  confirmed: 'bg-surface-2 text-muted border-line',
  sourcing:  'bg-accent-soft text-accent-fg border-accent',
  shipped:   'bg-surface-2 text-muted border-line',
  delivered: 'bg-success-soft text-success-fg border-success',
  cancelled: 'bg-surface-2 text-faint border-line',
}

const IMPORT_STATUS_CLS: Record<WholesaleImportStatus, string> = {
  awaiting_supplier: 'bg-surface-2 text-muted border-line',
  purchased:         'bg-warning-soft text-warning-fg border-warning',
  in_production:     'bg-warning-soft text-warning-fg border-warning',
  ready_to_ship:     'bg-warning-soft text-warning-fg border-warning',
  shipped:           'bg-surface-2 text-muted border-line',
  customs_clearance: 'bg-accent-soft text-accent-fg border-accent',
  delivered:         'bg-success-soft text-success-fg border-success',
}

const PAYMENT_STATUS_CLS: Record<WholesalePaymentStatus, string> = {
  no_deposit:        'bg-surface-2 text-faint border-line',
  deposit_requested: 'bg-warning-soft text-warning-fg border-warning',
  deposit_received:  'bg-surface-2 text-muted border-line',
  fully_paid:        'bg-success-soft text-success-fg border-success',
}

type OrderWithBuyer = WholesaleOrder & { buyer: Pick<Profile, 'id' | 'full_name' | 'phone'> }
type CartBuyer = { buyer: Pick<Profile, 'id' | 'full_name'>; items: WholesaleCartItemWithProduct[]; total: number }

export default async function AdminWholesaleOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.wholesaleOrders')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const isRtl = locale === 'ar'
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const [ordersRes, cartsRes] = await Promise.all([
    supabase
      .from('wholesale_orders')
      .select('*, buyer:profiles!buyer_id(id, full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('wholesale_cart_items')
      .select('*, product:products(*)')
      .order('added_at'),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderWithBuyer[]
  const allCartItems = (cartsRes.data ?? []) as unknown as WholesaleCartItemWithProduct[]

  // Group cart items by buyer
  const buyerMap = new Map<string, CartBuyer>()
  for (const item of allCartItems) {
    if (!buyerMap.has(item.buyer_id)) {
      // Fetch buyer profile (we need their name)
      buyerMap.set(item.buyer_id, { buyer: { id: item.buyer_id, full_name: '…' }, items: [], total: 0 })
    }
    buyerMap.get(item.buyer_id)!.items.push(item)
  }
  // Fetch buyer profiles for pending carts
  if (buyerMap.size > 0) {
    const buyerIds = [...buyerMap.keys()]
    const { data: buyers } = (await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', buyerIds)) as { data: { id: string; full_name: string }[] | null; error: unknown }
    for (const b of buyers ?? []) {
      const entry = buyerMap.get(b.id)
      if (entry) entry.buyer = b
    }
  }
  // Calculate totals
  for (const entry of buyerMap.values()) {
    entry.total = entry.items.reduce((sum, item) => {
      const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
      const price = tier ? tier.price_per_unit : item.product.sell_price
      return sum + price * item.quantity
    }, 0)
  }
  const pendingCarts = [...buyerMap.values()]

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* ── Pending carts section ── */}
        {pendingCarts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-foreground">{t('pendingCartsHeading')}</h2>
              <span className="text-xs px-2 py-0.5 bg-warning-soft text-warning-fg rounded-full font-bold">
                {pendingCarts.length}
              </span>
            </div>
            <div className="bg-surface rounded-xl border border-warning divide-y divide-line">
              {pendingCarts.map(({ buyer, items, total }) => (
                <div key={buyer.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{buyer.full_name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {t('itemsCount', { count: items.length })} ·{' '}
                      {t('estimatedTotal')}&nbsp;: <strong>{formatMAD(total)}</strong>
                    </p>
                    <p className="text-xs text-faint mt-0.5">
                      {items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
                    </p>
                  </div>
                  <form action={createWholesaleOrderAction} className="shrink-0">
                    <input type="hidden" name="buyerId" value={buyer.id} />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {t('createOrder')} {isRtl ? '←' : '→'}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Orders list ── */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {t('ordersHeading')} ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-12 text-center">
              <p className="text-sm text-faint">{t('empty')}</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {orders.map((order) => {
                const cls = STATUS_CLS[order.status] ?? STATUS_CLS.pending
                const importCls = order.import_status
                  ? IMPORT_STATUS_CLS[order.import_status]
                  : null
                const paymentStatus = (order.payment_status ?? 'no_deposit') as WholesalePaymentStatus
                const paymentCls = PAYMENT_STATUS_CLS[paymentStatus] ?? PAYMENT_STATUS_CLS.no_deposit
                return (
                  <div key={order.id} className="flex items-start gap-3 p-4 hover:bg-surface-2 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-faint">#{order.id.slice(0,8).toUpperCase()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
                          {tc(`wholesaleStatus.${order.status}`)}
                        </span>
                        {importCls && order.import_status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importCls}`}>
                            {tc(`importStatusBadge.${order.import_status}`)}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${paymentCls}`}>
                          {tc(`paymentStatus.${paymentStatus}`)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{order.buyer?.full_name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {t('sale')}&nbsp;: <strong>{formatMAD(order.total_amount)}</strong>
                        {order.gross_profit_mad != null && (
                          <>
                            {' · '}
                            {t('profit')}&nbsp;:{' '}
                            <strong className={order.gross_profit_mad >= 0 ? 'text-success' : 'text-danger'}>
                              {formatMAD(order.gross_profit_mad)}
                            </strong>
                            {order.gross_margin_percent != null && (
                              <span className="text-faint"> ({order.gross_margin_percent.toFixed(1)}%)</span>
                            )}
                          </>
                        )}
                        {' · '}
                        {new Date(order.created_at).toLocaleDateString(dateLocale, { day:'2-digit', month:'short', year:'numeric' })}
                      </p>
                    </div>
                    <Link
                      href={`/admin/wholesale-orders/${order.id}`}
                      className="shrink-0 text-xs text-gold-500 hover:text-gold-600 transition-colors"
                    >
                      {isRtl ? tc('details').replace('→', '←') : tc('details')}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
