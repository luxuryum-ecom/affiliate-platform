import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Profile, Product } from '@/types/database'

export const metadata = { title: 'Analytiques — Administration' }

const PERIODS = [
  { key: '7d',  label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: '90d', label: '90 jours' },
  { key: 'all', label: 'Tout' },
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
          .select('id, product_id, affiliate_id, quantity, total_amount, status, product_price_snapshot, affiliate_commission_mad_snapshot, delivery_fee_snapshot, packaging_fee_snapshot, confirmation_fee_snapshot, created_at')
          .gte('created_at', since)
      : supabase
          .from('orders')
          .select('id, product_id, affiliate_id, quantity, total_amount, status, product_price_snapshot, affiliate_commission_mad_snapshot, delivery_fee_snapshot, packaging_fee_snapshot, confirmation_fee_snapshot, created_at')
    ) as unknown as Promise<{ data: OrderRow[] | null; error: unknown }>,

    supabase
      .from('products')
      .select('id, name') as unknown as Promise<{ data: Pick<Product, 'id' | 'name'>[] | null; error: unknown }>,

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'affiliate') as unknown as Promise<{ data: Pick<Profile, 'id' | 'full_name'>[] | null; error: unknown }>,

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
  const wsDepositReceived = wsActiveOrders.filter((o) => o.payment_status === 'deposit_received')
  const wsTotalDepositsReceived = wsActiveOrders.reduce(
    (s, o) => s + (o.deposit_received_amount ?? 0), 0
  )
  const wsOutstandingBalance = wsActiveOrders.reduce(
    (s, o) => s + Math.max(0, o.total_amount - (o.deposit_received_amount ?? 0)), 0
  )
  const wsFullyPaidRevenue = wsFullyPaid.reduce((s, o) => s + o.total_amount, 0)
  const wsWithDeposit      = wsActiveOrders.filter((o) => (o.deposit_received_amount ?? 0) > 0)

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
  const deliveredOrders = orders.filter((o) => o.status === 'delivered')
  const totalCodCollected = deliveredOrders.reduce((s, o) => s + o.total_amount, 0)
  const totalGrossProfit  = deliveredOrders.reduce((s, o) => s + platformProfit(o), 0)
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm shrink-0">
              ← Dashboard
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">Analytiques</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-gray-500 hidden sm:block">{profileRes.data?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/analytics?period=${p.key}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                period === p.key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </Link>
          ))}
          <span className="text-xs text-gray-400 ml-1">
            {total} commande{total !== 1 ? 's' : ''} sur cette période
          </span>
        </div>

        {/* Revenue */}
        <section>
          <SectionLabel>Revenus (commandes livrées)</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="COD encaissé"
              value={formatMAD(totalCodCollected)}
              sub="Montant total des livraisons"
              variant="default"
            />
            <StatCard
              label="Profit brut plateforme"
              value={formatMAD(totalGrossProfit)}
              sub="COD − commissions − frais"
              variant={totalGrossProfit > 0 ? 'success' : 'warning'}
            />
            <StatCard
              label="Commissions affiliés"
              value={formatMAD(totalCommissions)}
              sub={`dont ${formatMAD(commissionsPaid)} payées`}
              variant="muted"
            />
            <StatCard
              label="Frais opérationnels"
              value={formatMAD(totalOpsFees)}
              sub="Confirm. + emball. + livr."
              variant="muted"
            />
          </div>

          {/* Commission split */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700">Commissions dues (non payées)</p>
              <p className="mt-1 text-xl font-bold text-amber-800 tabular-nums">
                {formatMAD(commissionsPending)}
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-700">Commissions versées</p>
              <p className="mt-1 text-xl font-bold text-green-800 tabular-nums">
                {formatMAD(commissionsPaid)}
              </p>
            </div>
          </div>
        </section>

        {/* Orders */}
        <section>
          <SectionLabel>Commandes COD</SectionLabel>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <StatCard label="Total"          value={String(total)}     variant="default" />
            <StatCard label="Confirmées"     value={String(confirmed)} variant="default" />
            <StatCard label="Expédiées"      value={String(shipped)}   variant="default" />
            <StatCard
              label="Livrées"
              value={String(delivered)}
              sub={`${deliveryRate}% du total`}
              variant={delivered > 0 ? 'success' : 'default'}
            />
            <StatCard
              label="Retournées"
              value={String(returned)}
              sub={`${returnRate}% des livrées`}
              variant={returned > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label="Annulées"
              value={String(cancelled)}
              variant={cancelled > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* Wholesale P&L */}
        <section>
          <SectionLabel>Grossiste — Revenus & profit (commandes livrées)</SectionLabel>
          {wsDelivered.length === 0 ? (
            <EmptyState label="Aucune commande grossiste livrée sur cette période." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Chiffre d'affaires"
                value={formatMAD(wsTotalRevenue)}
                sub={`${wsDelivered.length} commande${wsDelivered.length !== 1 ? 's' : ''} livrée${wsDelivered.length !== 1 ? 's' : ''}`}
                variant="default"
              />
              <StatCard
                label="Coût total import"
                value={formatMAD(wsTotalCost)}
                sub={wsTotalCost === 0 ? 'Coûts non saisis' : 'Fournisseur + transport + divers'}
                variant="muted"
              />
              <StatCard
                label="Profit brut"
                value={formatMAD(wsTotalProfit)}
                sub="CA − coût total"
                variant={wsTotalProfit > 0 ? 'success' : 'warning'}
              />
              <StatCard
                label="Marge moyenne"
                value={`${wsAvgMargin.toFixed(1)}%`}
                sub="Sur commandes livrées"
                variant={wsAvgMargin > 0 ? 'success' : 'warning'}
              />
            </div>
          )}
          {wsAllActive.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700">Commandes actives (non annulées)</p>
                <p className="mt-1 text-xl font-bold text-blue-800 tabular-nums">
                  {wsAllActive.length}
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500">CA actif non livré</p>
                <p className="mt-1 text-xl font-bold text-gray-700 tabular-nums">
                  {formatMAD(wsAllActive.filter((o) => o.status !== 'delivered').reduce((s, o) => s + o.total_amount, 0))}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Import status breakdown */}
        {wsWithImportStatus > 0 && (
          <section>
            <SectionLabel>Grossiste — Suivi import (par statut)</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'awaiting_supplier', label: 'Attente fournisseur' },
                { key: 'purchased',         label: 'Acheté' },
                { key: 'in_production',     label: 'En production' },
                { key: 'ready_to_ship',     label: 'Prêt à expédier' },
                { key: 'shipped',           label: 'Expédié' },
                { key: 'customs_clearance', label: 'Dédouanement' },
                { key: 'delivered',         label: 'Livré (import)' },
              ].map(({ key, label }) => {
                const cnt = importStatusCounts.get(key) ?? 0
                return (
                  <StatCard
                    key={key}
                    label={label}
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
            <SectionLabel>Grossiste — Paiements</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard
                label="Acomptes reçus"
                value={formatMAD(wsTotalDepositsReceived)}
                sub={`${wsWithDeposit.length} cmde${wsWithDeposit.length !== 1 ? 's' : ''} avec acompte`}
                variant="success"
              />
              <StatCard
                label="Soldes en attente"
                value={formatMAD(wsOutstandingBalance)}
                sub={`${wsActiveOrders.filter((o) => o.payment_status !== 'fully_paid').length} cmde${wsActiveOrders.filter((o) => o.payment_status !== 'fully_paid').length !== 1 ? 's' : ''} non soldées`}
                variant={wsOutstandingBalance > 0 ? 'warning' : 'muted'}
              />
              <StatCard
                label="Entièrement réglé"
                value={formatMAD(wsFullyPaidRevenue)}
                sub={`${wsFullyPaid.length} commande${wsFullyPaid.length !== 1 ? 's' : ''}`}
                variant={wsFullyPaid.length > 0 ? 'success' : 'muted'}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'no_deposit',        label: 'Aucun acompte' },
                { key: 'deposit_requested', label: 'Acompte demandé' },
                { key: 'deposit_received',  label: 'Acompte reçu' },
                { key: 'fully_paid',        label: 'Entièrement réglé' },
              ].map(({ key, label }) => {
                const cnt = wsActiveOrders.filter((o) => o.payment_status === key).length
                return (
                  <StatCard
                    key={key}
                    label={label}
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
            <SectionLabel>Top produits (par revenus)</SectionLabel>
            {topProducts.length === 0 ? (
              <EmptyState label="Aucune commande livrée sur cette période." />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
                  <span className="col-span-2">Produit</span>
                  <span className="text-right">Revenus</span>
                  <span className="text-right">Profit</span>
                </div>
                {topProducts.map((p) => (
                  <div key={p.id} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.orders} cmd{p.orders !== 1 ? 's' : ''} · {p.delivered} livrée{p.delivered !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 tabular-nums text-right">
                      {formatMAD(p.revenue)}
                    </p>
                    <p className={`text-sm font-semibold tabular-nums text-right ${p.profit > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {formatMAD(p.profit)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top affiliates */}
          <section>
            <SectionLabel>Top affiliés (par livraisons)</SectionLabel>
            {topAffiliates.length === 0 ? (
              <EmptyState label="Aucune commande affiliée sur cette période." />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500">
                  <span className="col-span-2">Affilié</span>
                  <span className="text-right">Livrées</span>
                  <span className="text-right">Commissions</span>
                </div>
                {topAffiliates.map((a) => (
                  <div key={a.id} className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.orders} cmd{a.orders !== 1 ? 's' : ''} passées
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 tabular-nums text-right">
                      {a.delivered}
                    </p>
                    <p className="text-sm font-semibold text-green-600 tabular-nums text-right">
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
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
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
    default: 'bg-white border-gray-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    muted:   'bg-gray-50 border-gray-200',
  }[variant]

  const text = {
    default: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-amber-700',
    muted:   'text-gray-400',
  }[variant]

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}
