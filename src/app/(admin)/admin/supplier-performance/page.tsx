import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import AddIssueForm from './AddIssueForm'
import type {
  SupplierQuoteRequest,
  SupplierProduct,
  Profile,
  SupplierIssue,
  SupplierPerformance,
} from '@/types/database'

export const metadata = { title: 'Performance fournisseurs — Administration' }

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

function reliabilityScore(issueCount: number, delayedCount: number): number {
  return Math.max(0, 100 - 5 * issueCount - 3 * delayedCount)
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

export default async function SupplierPerformancePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()) as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  // ── Fetch all supplier quote requests with supplier identity ────────────────

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

  // ── Fetch all supplier issues (admin-only table) ────────────────────────────

  const { data: issuesData } = await supabase
    .from('supplier_issues')
    .select('id, supplier_id, issue_type, delivery_days, created_at')
    .order('created_at', { ascending: false })

  const issues = (issuesData ?? []) as Pick<
    SupplierIssue,
    'id' | 'supplier_id' | 'issue_type' | 'delivery_days' | 'created_at'
  >[]

  // ── Fetch all approved suppliers (so they appear even with 0 orders) ─────────

  const { data: suppliersData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'supplier')
    .eq('status', 'approved')
    .order('full_name')

  const knownSuppliers = (suppliersData ?? []) as Pick<Profile, 'id' | 'full_name'>[]

  // ── Fetch first product per supplier for type/country/category context ───────

  const { data: productsData } = await supabase
    .from('supplier_products')
    .select('supplier_id, supplier_type, origin_country, category, niche')
    .eq('approval_status', 'approved')

  type ProductMeta = Pick<SupplierProduct, 'supplier_id' | 'supplier_type' | 'origin_country' | 'category' | 'niche'>
  const products = (productsData ?? []) as ProductMeta[]

  // ── Build per-supplier aggregates ──────────────────────────────────────────

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

  // Seed from known suppliers
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

  // Enrich with product metadata
  for (const p of products) {
    if (!map.has(p.supplier_id)) continue
    const acc = map.get(p.supplier_id)!
    if (!acc.supplierType && p.supplier_type) acc.supplierType = p.supplier_type
    if (p.origin_country) acc.countrySet.add(p.origin_country)
    if (p.category) acc.categorySet.add(p.category)
    if (p.niche) acc.nicheSet.add(p.niche)
  }

  // Aggregate from quote requests
  for (const q of quotes) {
    const supplierId = q.supplier_product?.supplier?.id
    if (!supplierId) continue

    if (!map.has(supplierId)) {
      map.set(supplierId, {
        supplierId,
        supplierName: q.supplier_product?.supplier?.full_name ?? 'Inconnu',
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

  // Aggregate from issues
  for (const issue of issues) {
    if (!map.has(issue.supplier_id)) continue
    const acc = map.get(issue.supplier_id)!
    acc.issueCount += 1
    if (issue.issue_type === 'delay') acc.delayedOrdersCount += 1
    if (issue.delivery_days != null) acc.deliveryDaysArr.push(issue.delivery_days)
  }

  // Finalise
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Performance fournisseurs</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Performance fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Fiabilité, commandes, revenus et incidents — admin uniquement.
          </p>
        </div>

        {/* Add issue form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Ajouter une note d&apos;incident</h2>
          <AddIssueForm suppliers={suppliersForForm} />
        </div>

        {/* Performance table */}
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
            Aucun fournisseur enregistré.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {[
                      'Fournisseur',
                      'Type / Pays',
                      'Catégorie / Niche',
                      'Commandes',
                      'Revenu',
                      'Commission',
                      'Moy. livraison',
                      'Retards',
                      'Incidents',
                      'Score fiabilité',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => {
                    const score = row.reliabilityScore
                    return (
                      <tr key={row.supplierId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {row.supplierName}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                            {row.supplierType ?? '—'}
                          </span>
                          {row.countries !== '—' && (
                            <span className="ml-1 text-xs text-gray-400">{row.countries}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px]">
                          <div className="truncate">{row.categories}</div>
                          {row.niches !== '—' && (
                            <div className="truncate text-gray-400">{row.niches}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-900 text-right">
                          {row.totalOrders}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-900 text-right whitespace-nowrap">
                          {formatMAD(row.totalRevenueMad)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-indigo-700 font-medium text-right whitespace-nowrap">
                          {formatMAD(row.totalCommissionMad)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-600 text-right whitespace-nowrap">
                          {row.averageDeliveryDays != null
                            ? `${row.averageDeliveryDays}j`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.delayedOrdersCount > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {row.delayedOrdersCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.issueCount > 0
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {row.issueCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.totalOrders === 0 && row.issueCount === 0 ? (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                              Données insuffisantes
                            </span>
                          ) : (
                            <span
                              className={`inline-block text-sm font-bold tabular-nums ${scoreColor(score)}`}
                            >
                              {score}
                              <span className="text-xs font-normal text-gray-400">/100</span>
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
