import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { SupplierQuoteRequest, SupplierProduct, Profile, SupplierPayoutStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierAnalytics')
  return { title: t('metaTitle') }
}

type QuoteAnalyticsRow = Pick<
  SupplierQuoteRequest,
  | 'id'
  | 'supplier_product_id'
  | 'quantity_requested'
  | 'quoted_unit_price_mad'
  | 'supplier_cost_mad'
  | 'platform_commission_amount_mad'
  | 'transport_customs_cost_mad'
  | 'supplier_payout_amount_mad'
  | 'supplier_payout_status'
  | 'status'
  | 'created_at'
> & {
  supplier_product: (Pick<SupplierProduct, 'id' | 'product_name' | 'supplier_id'> & {
    supplier: Pick<Profile, 'id' | 'full_name'> | null
  }) | null
}

type SupplierSummary = {
  supplierId: string
  supplierName: string
  productCount: number
  orderCount: number
  totalClientRevenue: number
  totalCommission: number
  totalPayoutDue: number
  totalPayoutPaid: number
}

export default async function AdminSupplierAnalyticsPage() {
  const supabase = await createClient()
  const t = await getTranslations('admin.supplierAnalytics')
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
    .from('supplier_quote_requests')
    .select(`
      id, supplier_product_id, quantity_requested, quoted_unit_price_mad,
      supplier_cost_mad, platform_commission_amount_mad, transport_customs_cost_mad,
      supplier_payout_amount_mad, supplier_payout_status, status, created_at,
      supplier_product:supplier_products!supplier_product_id(
        id, product_name, supplier_id,
        supplier:profiles!supplier_id(id, full_name)
      )
    `)
    .order('created_at', { ascending: false })

  const quotes = (data ?? []) as unknown as QuoteAnalyticsRow[]

  // ARGENT: agrégats globaux inchangés
  const totalClientRevenue = quotes.reduce((s, q) =>
    s + (q.quoted_unit_price_mad ?? 0) * q.quantity_requested, 0)

  const totalCommissionEarned = quotes.reduce((s, q) =>
    s + (q.platform_commission_amount_mad ?? 0), 0)

  const totalPayoutDue = quotes
    .filter((q) => (['pending', 'partially_paid'] as SupplierPayoutStatus[]).includes(q.supplier_payout_status))
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)

  const totalPayoutPaid = quotes
    .filter((q) => q.supplier_payout_status === 'paid')
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)

  // ARGENT: agrégats par fournisseur inchangés
  const supplierMap = new Map<string, SupplierSummary>()

  for (const q of quotes) {
    const supplierId = q.supplier_product?.supplier?.id ?? 'unknown'
    const supplierName = q.supplier_product?.supplier?.full_name ?? tc('unknown')

    if (!supplierMap.has(supplierId)) {
      supplierMap.set(supplierId, {
        supplierId,
        supplierName,
        productCount: new Set<string>(),
        orderCount: 0,
        totalClientRevenue: 0,
        totalCommission: 0,
        totalPayoutDue: 0,
        totalPayoutPaid: 0,
      } as unknown as SupplierSummary)
    }

    const s = supplierMap.get(supplierId)!
    ;(s as unknown as { _productIds: Set<string> })._productIds ??= new Set()
    ;(s as unknown as { _productIds: Set<string> })._productIds.add(q.supplier_product_id)

    s.orderCount += 1
    s.totalClientRevenue += (q.quoted_unit_price_mad ?? 0) * q.quantity_requested
    s.totalCommission += q.platform_commission_amount_mad ?? 0

    const isDue = (['pending', 'partially_paid'] as SupplierPayoutStatus[]).includes(q.supplier_payout_status)
    if (isDue) s.totalPayoutDue += q.supplier_payout_amount_mad ?? 0
    if (q.supplier_payout_status === 'paid') s.totalPayoutPaid += q.supplier_payout_amount_mad ?? 0
  }

  const supplierSummaries: SupplierSummary[] = Array.from(supplierMap.values()).map((s) => ({
    ...s,
    productCount: (s as unknown as { _productIds: Set<string> })._productIds?.size ?? 0,
  })).sort((a, b) => b.totalPayoutDue - a.totalPayoutDue)

  // Payout status breakdown
  const statusCounts: Record<SupplierPayoutStatus, number> = {
    not_due: 0, pending: 0, partially_paid: 0, paid: 0,
  }
  for (const q of quotes) {
    statusCounts[q.supplier_payout_status] = (statusCounts[q.supplier_payout_status] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/supplier-quotes"
        backLabel={locale === 'ar' ? t('backLabel') : t('backLabel')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle', { count: quotes.length })}
          </p>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-xl border border-warning p-5">
            <p className="text-xs text-muted mb-1">{t('kpiDue')}</p>
            <p className="text-2xl font-bold text-warning-fg tabular-nums">{formatMAD(totalPayoutDue)}</p>
            <p className="text-xs text-faint mt-1">
              {t('kpiDueHint', { pending: statusCounts.pending, partial: statusCounts.partially_paid })}
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-success p-5">
            <p className="text-xs text-muted mb-1">{t('kpiPaid')}</p>
            <p className="text-2xl font-bold text-success-fg tabular-nums">{formatMAD(totalPayoutPaid)}</p>
            <p className="text-xs text-faint mt-1">{t('kpiPaidHint', { count: statusCounts.paid })}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-xs text-gold-600 mb-1">{t('kpiCommission')}</p>
            <p className="text-2xl font-bold text-gold-600 tabular-nums">{formatMAD(totalCommissionEarned)}</p>
            <p className="text-xs text-faint mt-1">{t('kpiCommissionHint', { count: quotes.length })}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-xs text-muted mb-1">{t('kpiRevenue')}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatMAD(totalClientRevenue)}</p>
            <p className="text-xs text-faint mt-1">{t('kpiRevenueHint')}</p>
          </div>
        </div>

        {/* Payout status distribution */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('payoutDistTitle')}</h2>
          <div className="grid grid-cols-4 gap-4">
            {(
              [
                { status: 'not_due' as const,        labelKey: 'statusNotDue' as const,  cls: 'text-muted' },
                { status: 'pending' as const,        labelKey: 'statusPending' as const,  cls: 'text-warning-fg' },
                { status: 'partially_paid' as const, labelKey: 'statusPartial' as const,  cls: 'text-foreground' },
                { status: 'paid' as const,           labelKey: 'statusPaid' as const,     cls: 'text-success-fg' },
              ]
            ).map(({ status, labelKey, cls }) => (
              <div key={status} className="text-center">
                <p className={`text-2xl font-bold ${cls}`}>{statusCounts[status]}</p>
                <p className="text-xs text-muted mt-1">{t(labelKey)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Per-supplier breakdown */}
        {supplierSummaries.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('bySupplierTitle')}</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {supplierSummaries.map((s) => (
                <div key={s.supplierId} className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-medium text-foreground text-sm">{s.supplierName}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {t('supplierProducts', { count: s.productCount })} ·{' '}
                        {t('supplierOrders', { count: s.orderCount })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-faint">{t('supplierCommLabel')}</p>
                      <p className="font-semibold text-gold-600 tabular-nums text-sm">
                        {formatMAD(s.totalCommission)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-surface-2 rounded-lg px-3 py-2">
                      <p className="text-xs text-faint">{t('supplierRevLabel')}</p>
                      <p className="font-medium tabular-nums text-sm text-foreground">{formatMAD(s.totalClientRevenue)}</p>
                    </div>
                    <div className="bg-warning-soft rounded-lg px-3 py-2">
                      <p className="text-xs text-warning-fg">{t('supplierDueLabel')}</p>
                      <p className="font-semibold tabular-nums text-sm text-warning-fg">{formatMAD(s.totalPayoutDue)}</p>
                    </div>
                    <div className="bg-success-soft rounded-lg px-3 py-2">
                      <p className="text-xs text-success-fg">{t('supplierPaidLabel')}</p>
                      <p className="font-semibold tabular-nums text-sm text-success-fg">{formatMAD(s.totalPayoutPaid)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
