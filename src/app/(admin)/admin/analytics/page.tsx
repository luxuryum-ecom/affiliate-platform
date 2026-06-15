import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { formatMAD } from '@/lib/utils'
import type { Profile, Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.analytics')
  return { title: t('metaTitle') }
}

const PERIODS = [
  { key: '7d',  labelKey: 'period7d' },
  { key: '30d', labelKey: 'period30d' },
  { key: '90d', labelKey: 'period90d' },
  { key: 'all', labelKey: 'periodAll' },
] as const

type PeriodKey = '7d' | '30d' | '90d' | 'all'

function periodStart(key: PeriodKey): string | null {
  if (key === 'all') return null
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

interface OrderRow {
  id: string
  product_id: string
  affiliate_id: string | null
  quantity: number
  total_amount: number
  status: string
  cod_expected: number | null
  cod_received: number | null
  product_price_snapshot: number | null
  affiliate_commission_mad_snapshot: number | null
  delivery_fee_snapshot: number | null
  packaging_fee_snapshot: number | null
  confirmation_fee_snapshot: number | null
  created_at: string
}

function platformProfit(o: OrderRow): number {
  const revenue  = o.total_amount
  const comm     = o.affiliate_commission_mad_snapshot ?? 0
  const delivery = o.delivery_fee_snapshot ?? 0
  const pack     = o.packaging_fee_snapshot ?? 0
  const confirm  = o.confirmation_fee_snapshot ?? 0
  return revenue - comm - delivery - pack - confirm
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const period: PeriodKey = (['7d', '30d', '90d', 'all'] as const).includes(rawPeriod as PeriodKey)
    ? (rawPeriod as PeriodKey)
    : '30d'

  const since = periodStart(period)

  const t  = await getTranslations('admin.analytics')
  const tc = await getTranslations('admin.common')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes, productsRes, affiliatesRes, commissionsRes, wholesaleRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user!.id)
      .single() as unknown as Promise<{ data: { full_name: string } | null; error: unknown }>,

    (since
      ? supabase
          .from('orders')
          .select('id, product_id, affiliate_id, quantity, total_amount, status, cod_expected, cod_received, product_price_snapshot, affiliate_commission_mad_snapshot, delivery_fee_snapshot, packaging_fee_snapshot, confirmation_fee_snapshot, created_at')
          .gte('created_at', since)
      : supabase
          .from('orders')
          .select('id, product_id, affiliate_id, quantity, total_amount, status, cod_expected, cod_received, product_price_snapshot, affiliate_commission_mad_snapshot, delivery_fee_snapshot, packaging_fee_snapshot, confirmation_fee_snapshot, created_at')
    ) as unknown as Promise<{ data: OrderRow[] | null; error: unknown }>,

    supabase
      .from('products')
      .select('id, name') as unknown as Promise<{ data: Pick<Product, 'id' | 'name'>[] | null; error: unknown }>,

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'affiliate')
      .eq('status', 'approved') as unknown as Promise<{ data: Pick<Profile, 'id' | 'full_name'>[] | null; error: unknown }>,

    (since
      ? supabase
          .from('commissions')
          .select('affiliate_id, amount, status')
          .gte('created_at', since)
      : supabase
          .from('commissions')
          .select('affiliate_id, amount, status')
    ) as unknown as Promise<{
      data: { affiliate_id: string; amount: number; status: string }[] | null
      error: unknown
    }>,

    (since
      ? supabase
          .from('wholesale_orders')
          .select('id, status, total_amount, total_cost_mad, gross_profit_mad, gross_margin_percent, import_status, payment_status, deposit_received_amount')
          .gte('created_at', since)
      : supabase
          .from('wholesale_orders')
          .select('id, status, total_amount, total_cost_mad, gross_profit_mad, gross_margin_percent, import_status, payment_status, deposit_received_amount')
    ) as unknown as Promise<{
      data: {
        id: string
        status: string
        total_amount: number
        total_cost_mad: number | null
        gross_profit_mad: number | null
        gross_margin_percent: number | null
        import_status: string | null
        payment_status: string
        deposit_received_amount: number
      }[] | null
      error: unknown
    }>,
  ])

  const orders     = ordersRes.data ?? []
  const products   = productsRes.data ?? []
  const affiliates = affiliatesRes.data ?? []
  const commRows   = commissionsRes.data ?? []
  const wholesaleOrders = wholesaleRes.data ?? []

  // ── Wholesale P&L ─────────────────────────────────────────────────────────
  const wsDelivered   = wholesaleOrders.filter((o) => o.status === 'delivered')
  const wsAllActive   = wholesaleOrders.filter((o) => o.status !== 'cancelled')
  const wsTotalRevenue  = wsDelivered.reduce((s, o) => s + o.total_amount, 0)
  const wsTotalCost     = wsDelivered.reduce((s, o) => s + (o.total_cost_mad ?? 0), 0)
  const wsTotalProfit   = wsDelivered.reduce((s, o) => s + (o.gross_profit_mad ?? o.total_amount), 0)
  const wsAvgMargin     = wsDelivered.length > 0
    ? wsDelivered.reduce((s, o) => s + (o.gross_margin_percent ?? 0), 0) / wsDelivered.length
    : 0

  // ── Wholesale import status breakdown ─────────────────────────────────────
  const importStatusCounts = new Map<string, number>()
  for (const o of wholesaleOrders) {
    if (o.import_status) {
      importStatusCounts.set(o.import_status, (importStatusCounts.get(o.import_status) ?? 0) + 1)
    }
  }
  const wsWithImportStatus = wholesaleOrders.filter((o) => o.import_status != null).length

  // ── Wholesale payment analytics ───────────────────────────────────────────
  const wsActiveOrders   = wholesaleOrders.filter((o) => o.status !== 'cancelled')
  const wsFullyPaid      = wsActiveOrders.filter((o) => o.payment_status === 'fully_paid')
  const wsTotalDepositsReceived = wsActiveOrders.reduce(
    (s, o) => s + (o.deposit_received_amount ?? 0), 0
  )
  const wsOutstandingBalance = wsActiveOrders.reduce(
    (s, o) => s + Math.max(0, o.total_amount - (o.deposit_received_amount ?? 0)), 0
  )
  const wsFullyPaidRevenue = wsFullyPaid.reduce((s, o) => s + o.total_amount, 0)
  const wsWithDeposit      = wsActiveOrders.filter((o) => (o.deposit_received_amount ?? 0) > 0)
  const wsUnpaidCount      = wsActiveOrders.filter((o) => o.payment_status !== 'fully_paid').length

  const productMap   = new Map(products.map((p) => [p.id, p.name]))
  const affiliateMap = new Map(affiliates.map((a) => [a.id, a.full_name]))

  // ── Order breakdowns ─────────────────────────────────────────────────────────
  const count = (s: string) => orders.filter((o) => o.status === s).length
  const total      = orders.length
  const confirmed  = count('confirmed')
  const shipped    = count('shipped')
  const delivered  = count('delivered')
  const returned   = count('returned')
  const cancelled  = count('cancelled')
  const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0'
  const returnRate   = delivered + returned > 0
    ? ((returned / (delivered + returned)) * 100).toFixed(1)
    : '0'

  // ── Revenue metrics (all orders) ─────────────────────────────────────────────
  const deliveredOrders    = orders.filter((o) => o.status === 'delivered')
  // COD réconcilié : somme des montants effectivement reçus (cod_received non-null)
  const codReconciled      = deliveredOrders.reduce((s, o) => s + (o.cod_received ?? 0), 0)
  // COD attendu : montant prévu (cod_expected ou total_amount si non renseigné)
  const codExpected        = deliveredOrders.reduce((s, o) => s + (o.cod_expected ?? o.total_amount), 0)
  // Commandes livrées sans réconciliation COD
  const codPendingOrders   = deliveredOrders.filter((o) => o.cod_received == null)
  const codPendingAmount   = codPendingOrders.reduce((s, o) => s + (o.cod_expected ?? o.total_amount), 0)
  const totalGrossProfit   = deliveredOrders.reduce((s, o) => s + platformProfit(o), 0)
  const totalCommissions  = deliveredOrders.reduce(
    (s, o) => s + (o.affiliate_commission_mad_snapshot ?? 0), 0
  )
  const totalOpsFees = deliveredOrders.reduce(
    (s, o) =>
      s +
      (o.delivery_fee_snapshot ?? 0) +
      (o.packaging_fee_snapshot ?? 0) +
      (o.confirmation_fee_snapshot ?? 0),
    0
  )

  const commissionsPaid = commRows
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + Number(c.amount), 0)
  const commissionsPending = commRows
    .filter((c) => c.status !== 'paid')
    .reduce((s, c) => s + Number(c.amount), 0)

  // ── Top products ─────────────────────────────────────────────────────────────
  const productStats = new Map<string, { orders: number; delivered: number; revenue: number; profit: number }>()
  for (const o of orders) {
    const cur = productStats.get(o.product_id) ?? { orders: 0, delivered: 0, revenue: 0, profit: 0 }
    cur.orders += 1
    if (o.status === 'delivered') {
      cur.delivered += 1
      cur.revenue   += o.total_amount
      cur.profit    += platformProfit(o)
    }
    productStats.set(o.product_id, cur)
  }
  const topProducts = [...productStats.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([id, s]) => ({ id, name: productMap.get(id) ?? id.slice(0, 8), ...s }))

  // ── Top affiliates ────────────────────────────────────────────────────────────
  const affStats = new Map<string, { orders: number; delivered: number; commissions: number }>()
  for (const o of orders) {
    if (!o.affiliate_id) continue
    const cur = affStats.get(o.affiliate_id) ?? { orders: 0, delivered: 0, commissions: 0 }
    cur.orders += 1
    if (o.status === 'delivered') {
      cur.delivered   += 1
      cur.commissions += o.affiliate_commission_mad_snapshot ?? 0
    }
    affStats.set(o.affiliate_id, cur)
  }
  const topAffiliates = [...affStats.entries()]
    .sort((a, b) => b[1].delivered - a[1].delivered)
    .slice(0, 10)
    .map(([id, s]) => ({ id, name: affiliateMap.get(id) ?? id.slice(0, 8), ...s }))

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={profileRes.data?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/analytics?period=${p.key}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                period === p.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface border-line text-muted hover:bg-surface-2'
              }`}
            >
              {t(p.labelKey)}
            </Link>
          ))}
          <span className="text-xs text-faint ms-1">
            {t('ordersInPeriod', { count: total })}
          </span>
        </div>

        {/* Revenue */}
        <section>
          <SectionLabel>{t('sectionRevenue')}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label={t('codReconciled')}
              value={formatMAD(codReconciled)}
              sub={t('codExpectedSub', { amount: formatMAD(codExpected) })}
              variant="default"
            />
            <StatCard
              label={t('codPending')}
              value={formatMAD(codPendingAmount)}
              sub={t('codPendingSub', { count: codPendingOrders.length })}
              variant={codPendingOrders.length > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label={t('grossProfit')}
              value={formatMAD(totalGrossProfit)}
              sub={t('grossProfitSub')}
              variant={totalGrossProfit > 0 ? 'success' : 'warning'}
            />
            <StatCard
              label={t('affiliateCommissions')}
              value={formatMAD(totalCommissions)}
              sub={t('affiliateCommissionsSub', { amount: formatMAD(commissionsPaid) })}
              variant="muted"
            />
            <StatCard
              label={t('opsFees')}
              value={formatMAD(totalOpsFees)}
              sub={t('opsFeesSub')}
              variant="muted"
            />
          </div>

          {/* Commission split */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-warning-soft border border-warning rounded-xl p-4">
              <p className="text-xs text-warning-fg">{t('commissionsDue')}</p>
              <p className="mt-1 text-xl font-bold text-warning-fg tabular-nums">
                {formatMAD(commissionsPending)}
              </p>
            </div>
            <div className="bg-success-soft border border-success rounded-xl p-4">
              <p className="text-xs text-success-fg">{t('commissionsPaidLabel')}</p>
              <p className="mt-1 text-xl font-bold text-success-fg tabular-nums">
                {formatMAD(commissionsPaid)}
              </p>
            </div>
          </div>
        </section>

        {/* Orders */}
        <section>
          <SectionLabel>{t('sectionOrders')}</SectionLabel>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <StatCard label={t('orderTotal')}     value={String(total)}     variant="default" />
            <StatCard label={t('orderConfirmed')} value={String(confirmed)} variant="default" />
            <StatCard label={t('orderShipped')}   value={String(shipped)}   variant="default" />
            <StatCard
              label={t('orderDelivered')}
              value={String(delivered)}
              sub={t('deliveredSub', { rate: deliveryRate })}
              variant={delivered > 0 ? 'success' : 'default'}
            />
            <StatCard
              label={t('orderReturned')}
              value={String(returned)}
              sub={t('returnedSub', { rate: returnRate })}
              variant={returned > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label={t('orderCancelled')}
              value={String(cancelled)}
              variant={cancelled > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* Wholesale P&L */}
        <section>
          <SectionLabel>{t('sectionWholesale')}</SectionLabel>
          {wsDelivered.length === 0 ? (
            <EmptyState label={t('wsEmpty')} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label={t('wsRevenue')}
                value={formatMAD(wsTotalRevenue)}
                sub={t('wsRevenueSub', { count: wsDelivered.length })}
                variant="default"
              />
              <StatCard
                label={t('wsCost')}
                value={formatMAD(wsTotalCost)}
                sub={wsTotalCost === 0 ? t('wsCostSubEmpty') : t('wsCostSub')}
                variant="muted"
              />
              <StatCard
                label={t('wsProfit')}
                value={formatMAD(wsTotalProfit)}
                sub={t('wsProfitSub')}
                variant={wsTotalProfit > 0 ? 'success' : 'warning'}
              />
              <StatCard
                label={t('wsMargin')}
                value={`${wsAvgMargin.toFixed(1)}%`}
                sub={t('wsMarginSub')}
                variant={wsAvgMargin > 0 ? 'success' : 'warning'}
              />
            </div>
          )}
          {wsAllActive.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-accent-soft border border-accent rounded-xl p-4">
                <p className="text-xs text-accent-fg">{t('wsActive')}</p>
                <p className="mt-1 text-xl font-bold text-accent-fg tabular-nums">
                  {wsAllActive.length}
                </p>
              </div>
              <div className="bg-surface-2 border border-line rounded-xl p-4">
                <p className="text-xs text-muted">{t('wsActiveRevenue')}</p>
                <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
                  {formatMAD(wsAllActive.filter((o) => o.status !== 'delivered').reduce((s, o) => s + o.total_amount, 0))}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Import status breakdown */}
        {wsWithImportStatus > 0 && (
          <section>
            <SectionLabel>{t('sectionImport')}</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                'awaiting_supplier',
                'purchased',
                'in_production',
                'ready_to_ship',
                'shipped',
                'customs_clearance',
                'delivered',
              ].map((key) => {
                const cnt = importStatusCounts.get(key) ?? 0
                return (
                  <StatCard
                    key={key}
                    label={tc(`importStatusBadge.${key}`)}
                    value={String(cnt)}
                    variant={cnt > 0 ? 'default' : 'muted'}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Payment analytics */}
        {wsActiveOrders.length > 0 && (
          <section>
            <SectionLabel>{t('sectionPayments')}</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                label={t('depositsReceived')}
                value={formatMAD(wsTotalDepositsReceived)}
                sub={t('depositsReceivedSub', { count: wsWithDeposit.length })}
                variant="success"
              />
              <StatCard
                label={t('balancePending')}
                value={formatMAD(wsOutstandingBalance)}
                sub={t('balancePendingSub', { count: wsUnpaidCount })}
                variant={wsOutstandingBalance > 0 ? 'warning' : 'muted'}
              />
              <StatCard
                label={t('fullyPaidLabel')}
                value={formatMAD(wsFullyPaidRevenue)}
                sub={t('fullyPaidSub', { count: wsFullyPaid.length })}
                variant={wsFullyPaid.length > 0 ? 'success' : 'muted'}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                'no_deposit',
                'deposit_requested',
                'deposit_received',
                'fully_paid',
              ].map((key) => {
                const cnt = wsActiveOrders.filter((o) => o.payment_status === key).length
                return (
                  <StatCard
                    key={key}
                    label={tc(`paymentStatus.${key}`)}
                    value={String(cnt)}
                    variant={key === 'fully_paid' && cnt > 0 ? 'success' : key === 'deposit_requested' && cnt > 0 ? 'warning' : 'muted'}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Top products & top affiliates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top products */}
          <section>
            <SectionLabel>{t('sectionTopProducts')}</SectionLabel>
            {topProducts.length === 0 ? (
              <EmptyState label={t('topEmptyProducts')} />
            ) : (
              <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-surface-2 text-xs font-medium text-muted">
                  <span className="col-span-2">{t('colProduct')}</span>
                  <span className="text-end">{t('colRevenue')}</span>
                  <span className="text-end">{t('colProfit')}</span>
                </div>
                {topProducts.map((p) => (
                  <div key={p.id} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-faint mt-0.5">
                        {t('productMeta', { orders: p.orders, delivered: p.delivered })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground tabular-nums text-end">
                      {formatMAD(p.revenue)}
                    </p>
                    <p className={`text-sm font-semibold tabular-nums text-end ${p.profit > 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
                      {formatMAD(p.profit)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top affiliates */}
          <section>
            <SectionLabel>{t('sectionTopAffiliates')}</SectionLabel>
            {topAffiliates.length === 0 ? (
              <EmptyState label={t('topEmptyAffiliates')} />
            ) : (
              <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-surface-2 text-xs font-medium text-muted">
                  <span className="col-span-2">{t('colAffiliate')}</span>
                  <span className="text-end">{t('colDelivered')}</span>
                  <span className="text-end">{t('colCommissions')}</span>
                </div>
                {topAffiliates.map((a) => (
                  <div key={a.id} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                      <p className="text-xs text-faint mt-0.5">
                        {t('affiliateMeta', { orders: a.orders })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground tabular-nums text-end">
                      {a.delivered}
                    </p>
                    <p className="text-sm font-semibold text-success-fg tabular-nums text-end">
                      {formatMAD(a.commissions)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

      </main>
    </div>
  )
}

// ── Shared UI components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function StatCard({
  label,
  value,
  sub,
  variant = 'default',
}: {
  label: string
  value: string
  sub?: string
  variant?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const bg = {
    default: 'bg-surface border-line',
    success: 'bg-success-soft border-success',
    warning: 'bg-warning-soft border-warning',
    muted:   'bg-surface-2 border-line',
  }[variant]

  const text = {
    default: 'text-foreground',
    success: 'text-success-fg',
    warning: 'text-warning-fg',
    muted:   'text-faint',
  }[variant]

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-muted leading-tight">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${text}`}>{value}</p>
      {sub && <p className="text-xs text-faint mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-surface rounded-xl border border-line p-10 text-center">
      <p className="text-sm text-faint">{label}</p>
    </div>
  )
}
