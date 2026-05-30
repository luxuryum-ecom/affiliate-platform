import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { SupplierQuoteRequest, SupplierProduct, Profile, SupplierPayoutStatus } from '@/types/database'

export const metadata = { title: 'Analytics fournisseurs — Administration' }

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

  // ── Global aggregates ──────────────────────────────────────────────────────

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

  // ── Per-supplier aggregates ────────────────────────────────────────────────

  const supplierMap = new Map<string, SupplierSummary>()

  for (const q of quotes) {
    const supplierId = q.supplier_product?.supplier?.id ?? 'unknown'
    const supplierName = q.supplier_product?.supplier?.full_name ?? 'Inconnu'

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
    // Track unique product IDs (cast to any to use Set trick — resolved below)
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

  // ── Payout status breakdown ────────────────────────────────────────────────

  const statusCounts: Record<SupplierPayoutStatus, number> = {
    not_due: 0, pending: 0, partially_paid: 0, paid: 0,
  }
  for (const q of quotes) {
    statusCounts[q.supplier_payout_status] = (statusCounts[q.supplier_payout_status] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/supplier-quotes" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Devis fournisseurs
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Analytics fournisseurs</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Analytics fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {quotes.length} devis · Données en temps réel
          </p>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Reversements à verser</p>
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{formatMAD(totalPayoutDue)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {statusCounts.pending} en attente · {statusCounts.partially_paid} partiel
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Reversements versés</p>
            <p className="text-2xl font-bold text-green-600 tabular-nums">{formatMAD(totalPayoutPaid)}</p>
            <p className="text-xs text-gray-400 mt-1">{statusCounts.paid} devis soldés</p>
          </div>
          <div className="bg-white rounded-xl border border-indigo-200 p-5">
            <p className="text-xs text-indigo-500 mb-1">Commission Mozouna</p>
            <p className="text-2xl font-bold text-indigo-700 tabular-nums">{formatMAD(totalCommissionEarned)}</p>
            <p className="text-xs text-gray-400 mt-1">Sur {quotes.length} devis</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Chiffre d&apos;affaires client</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatMAD(totalClientRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">Total facturé aux acheteurs</p>
          </div>
        </div>

        {/* Payout status distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Répartition par statut de reversement</h2>
          <div className="grid grid-cols-4 gap-4">
            {(
              [
                { status: 'not_due',        label: 'Non exigible',       cls: 'text-gray-500' },
                { status: 'pending',        label: 'À verser',           cls: 'text-amber-600' },
                { status: 'partially_paid', label: 'Partiel',            cls: 'text-blue-600' },
                { status: 'paid',           label: 'Versé',              cls: 'text-green-600' },
              ] as const
            ).map(({ status, label, cls }) => (
              <div key={status} className="text-center">
                <p className={`text-2xl font-bold ${cls}`}>{statusCounts[status]}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Per-supplier breakdown */}
        {supplierSummaries.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Par fournisseur</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {supplierSummaries.map((s) => (
                <div key={s.supplierId} className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{s.supplierName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.productCount} produit{s.productCount !== 1 ? 's' : ''} ·
                        {' '}{s.orderCount} commande{s.orderCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">Commission</p>
                      <p className="font-semibold text-indigo-700 tabular-nums text-sm">
                        {formatMAD(s.totalCommission)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400">CA client</p>
                      <p className="font-medium tabular-nums text-sm text-gray-800">{formatMAD(s.totalClientRevenue)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-amber-600">À verser</p>
                      <p className="font-semibold tabular-nums text-sm text-amber-700">{formatMAD(s.totalPayoutDue)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-600">Versé</p>
                      <p className="font-semibold tabular-nums text-sm text-green-700">{formatMAD(s.totalPayoutPaid)}</p>
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
