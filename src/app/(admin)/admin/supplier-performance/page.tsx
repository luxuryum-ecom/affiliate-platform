import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import AddIssueForm from './AddIssueForm'
import type {
  SupplierQuoteRequest,
  SupplierProduct,
  Profile,
  SupplierIssue,
  SupplierPerformance,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierPerformance')
  return { title: t('metaTitle') }
}

type QuoteRow = Pick<
  SupplierQuoteRequest,
  | 'id'
  | 'supplier_product_id'
  | 'quantity_requested'
  | 'quoted_unit_price_mad'
  | 'platform_commission_amount_mad'
  | 'status'
  | 'created_at'
> & {
  supplier_product:
    | (Pick<SupplierProduct, 'id' | 'supplier_id' | 'supplier_type' | 'origin_country' | 'category' | 'niche'> & {
        supplier: Pick<Profile, 'id' | 'full_name'> | null
      })
    | null
}

// ARGENT: fonctions de calcul inchangées
function reliabilityScore(issueCount: number, delayedCount: number): number {
  return Math.max(0, 100 - 5 * issueCount - 3 * delayedCount)
}

function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-success-fg'
  if (score >= 50) return 'text-warning-fg'
  return 'text-danger-fg'
}

export default async function SupplierPerformancePage() {
  const supabase = await createClient()
  const t = await getTranslations('admin.supplierPerformance')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()) as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data: quotesData } = await supabase
    .from('supplier_quote_requests')
    .select(`
      id, supplier_product_id, quantity_requested, quoted_unit_price_mad,
      platform_commission_amount_mad, status, created_at,
      supplier_product:supplier_products!supplier_product_id(
        id, supplier_id, supplier_type, origin_country, category, niche,
        supplier:profiles!supplier_id(id, full_name)
      )
    `)
    .order('created_at', { ascending: false })

  const quotes = (quotesData ?? []) as unknown as QuoteRow[]

  const { data: issuesData } = await supabase
    .from('supplier_issues')
    .select('id, supplier_id, issue_type, delivery_days, created_at')
    .order('created_at', { ascending: false })

  const issues = (issuesData ?? []) as Pick<
    SupplierIssue,
    'id' | 'supplier_id' | 'issue_type' | 'delivery_days' | 'created_at'
  >[]

  const { data: suppliersData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'supplier')
    .eq('status', 'approved')
    .order('full_name')

  const knownSuppliers = (suppliersData ?? []) as Pick<Profile, 'id' | 'full_name'>[]

  const { data: productsData } = await supabase
    .from('supplier_products')
    .select('supplier_id, supplier_type, origin_country, category, niche')
    .eq('approval_status', 'approved')

  type ProductMeta = Pick<SupplierProduct, 'supplier_id' | 'supplier_type' | 'origin_country' | 'category' | 'niche'>
  const products = (productsData ?? []) as ProductMeta[]

  // ARGENT: agrégats inchangés
  type Acc = {
    supplierId: string
    supplierName: string
    supplierType: string | null
    countrySet: Set<string>
    categorySet: Set<string>
    nicheSet: Set<string>
    totalOrders: number
    totalRevenueMad: number
    totalCommissionMad: number
    deliveryDaysArr: number[]
    delayedOrdersCount: number
    issueCount: number
  }

  const map = new Map<string, Acc>()

  for (const s of knownSuppliers) {
    map.set(s.id, {
      supplierId: s.id,
      supplierName: s.full_name,
      supplierType: null,
      countrySet: new Set(),
      categorySet: new Set(),
      nicheSet: new Set(),
      totalOrders: 0,
      totalRevenueMad: 0,
      totalCommissionMad: 0,
      deliveryDaysArr: [],
      delayedOrdersCount: 0,
      issueCount: 0,
    })
  }

  for (const p of products) {
    if (!map.has(p.supplier_id)) continue
    const acc = map.get(p.supplier_id)!
    if (!acc.supplierType && p.supplier_type) acc.supplierType = p.supplier_type
    if (p.origin_country) acc.countrySet.add(p.origin_country)
    if (p.category) acc.categorySet.add(p.category)
    if (p.niche) acc.nicheSet.add(p.niche)
  }

  for (const q of quotes) {
    const supplierId = q.supplier_product?.supplier?.id
    if (!supplierId) continue

    if (!map.has(supplierId)) {
      map.set(supplierId, {
        supplierId,
        supplierName: q.supplier_product?.supplier?.full_name ?? tc('unknown'),
        supplierType: q.supplier_product?.supplier_type ?? null,
        countrySet: new Set(),
        categorySet: new Set(),
        nicheSet: new Set(),
        totalOrders: 0,
        totalRevenueMad: 0,
        totalCommissionMad: 0,
        deliveryDaysArr: [],
        delayedOrdersCount: 0,
        issueCount: 0,
      })
    }

    const acc = map.get(supplierId)!
    if (q.supplier_product?.supplier_type) acc.supplierType = q.supplier_product.supplier_type
    if (q.supplier_product?.origin_country) acc.countrySet.add(q.supplier_product.origin_country)
    if (q.supplier_product?.category) acc.categorySet.add(q.supplier_product.category)
    if (q.supplier_product?.niche) acc.nicheSet.add(q.supplier_product.niche)

    acc.totalOrders += 1
    acc.totalRevenueMad += (q.quoted_unit_price_mad ?? 0) * q.quantity_requested
    acc.totalCommissionMad += q.platform_commission_amount_mad ?? 0
  }

  for (const issue of issues) {
    if (!map.has(issue.supplier_id)) continue
    const acc = map.get(issue.supplier_id)!
    acc.issueCount += 1
    if (issue.issue_type === 'delay') acc.delayedOrdersCount += 1
    if (issue.delivery_days != null) acc.deliveryDaysArr.push(issue.delivery_days)
  }

  const rows: SupplierPerformance[] = Array.from(map.values())
    .map((acc) => ({
      supplierId: acc.supplierId,
      supplierName: acc.supplierName,
      supplierType: acc.supplierType,
      countries: Array.from(acc.countrySet).join(', ') || '—',
      categories: Array.from(acc.categorySet).join(', ') || '—',
      niches: Array.from(acc.nicheSet).join(', ') || '—',
      totalOrders: acc.totalOrders,
      totalRevenueMad: acc.totalRevenueMad,
      totalCommissionMad: acc.totalCommissionMad,
      averageDeliveryDays:
        acc.deliveryDaysArr.length > 0
          ? Math.round(acc.deliveryDaysArr.reduce((s, v) => s + v, 0) / acc.deliveryDaysArr.length)
          : null,
      delayedOrdersCount: acc.delayedOrdersCount,
      issueCount: acc.issueCount,
      reliabilityScore: reliabilityScore(acc.issueCount, acc.delayedOrdersCount),
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders)

  const suppliersForForm = knownSuppliers

  const tableHeaders = [
    t('colSupplier'),
    t('colTypeCountry'),
    t('colCategoryNiche'),
    t('colOrders'),
    t('colRevenue'),
    t('colCommission'),
    t('colAvgDelivery'),
    t('colDelays'),
    t('colIssues'),
    t('colScore'),
  ]

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

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* Add issue form */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('addIssueTitle')}</h2>
          <AddIssueForm suppliers={suppliersForForm} />
        </div>

        {/* Performance table */}
        {rows.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-10 text-center text-sm text-faint">
            {t('empty')}
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 border-b border-line">
                  <tr>
                    {tableHeaders.map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const score = row.reliabilityScore
                    return (
                      <tr key={row.supplierId} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {row.supplierName}
                        </td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line capitalize">
                            {row.supplierType ?? '—'}
                          </span>
                          {row.countries !== '—' && (
                            <span className="ml-1 text-xs text-faint">{row.countries}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted text-xs max-w-[160px]">
                          <div className="truncate">{row.categories}</div>
                          {row.niches !== '—' && (
                            <div className="truncate text-faint">{row.niches}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground text-right">
                          {row.totalOrders}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground text-right whitespace-nowrap">
                          {formatMAD(row.totalRevenueMad)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gold-600 font-medium text-right whitespace-nowrap">
                          {formatMAD(row.totalCommissionMad)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted text-right whitespace-nowrap">
                          {row.averageDeliveryDays != null
                            ? t('deliveryDays', { days: row.averageDeliveryDays })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              row.delayedOrdersCount > 0
                                ? 'bg-warning-soft text-warning-fg border-warning'
                                : 'bg-surface-2 text-faint border-line'
                            }`}
                          >
                            {row.delayedOrdersCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              row.issueCount > 0
                                ? 'bg-danger-soft text-danger-fg border-danger'
                                : 'bg-surface-2 text-faint border-line'
                            }`}
                          >
                            {row.issueCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.totalOrders === 0 && row.issueCount === 0 ? (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-surface-2 text-faint border border-line">
                              {t('insufficientData')}
                            </span>
                          ) : (
                            <span
                              className={`inline-block text-sm font-bold tabular-nums ${scoreColorClass(score)}`}
                            >
                              {score}
                              <span className="text-xs font-normal text-faint">{t('scoreSuffix')}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
