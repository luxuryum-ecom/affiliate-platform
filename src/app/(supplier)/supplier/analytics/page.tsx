import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Profile, SupplierProduct, SupplierQuoteRequest } from '@/types/database'

export const metadata = { title: 'Analytiques — Espace Fournisseur' }

export default async function SupplierAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'supplier') redirect('/login')

  // ── Products ────────────────────────────────────────────────────────────────
  const { data: productsData } = await supabase
    .from('supplier_products')
    .select('id, product_name, approval_status, created_at')
    .eq('supplier_id', user.id)
    .order('created_at', { ascending: false })

  const products = (productsData ?? []) as Pick<SupplierProduct, 'id' | 'product_name' | 'approval_status' | 'created_at'>[]
  const approvedProducts  = products.filter((p) => p.approval_status === 'approved')
  const pendingProducts   = products.filter((p) => p.approval_status === 'pending_review')
  const rejectedProducts  = products.filter((p) => p.approval_status === 'blocked')
  const approvedIds       = approvedProducts.map((p) => p.id)

  // ── Quote requests for approved products ─────────────────────────────────────
  type QuoteRow = Pick<SupplierQuoteRequest, 'id' | 'supplier_product_id' | 'quantity_requested' | 'status' | 'supplier_payout_amount_mad' | 'created_at'>
  let quotes: QuoteRow[] = []

  if (approvedIds.length > 0) {
    const { data: quotesData } = await supabase
      .from('supplier_quote_requests')
      .select('id, supplier_product_id, quantity_requested, status, supplier_payout_amount_mad, created_at')
      .in('supplier_product_id', approvedIds)
      .order('created_at', { ascending: false })
    quotes = (quotesData ?? []) as QuoteRow[]
  }

  const totalQuotes     = quotes.length
  const approvedQuotes  = quotes.filter((q) => q.status === 'approved').length
  const newQuotes       = quotes.filter((q) => q.status === 'new').length

  const totalRevenueMad = quotes
    .filter((q) => q.status === 'approved')
    .reduce((s, q) => s + Number(q.supplier_payout_amount_mad ?? 0), 0)

  // ── Per-product stats ───────────────────────────────────────────────────────
  const productStats = approvedProducts.map((p) => {
    const pQuotes     = quotes.filter((q) => q.supplier_product_id === p.id)
    const pApproved   = pQuotes.filter((q) => q.status === 'approved').length
    const pRevenue    = pQuotes.filter((q) => q.status === 'approved').reduce((s, q) => s + Number(q.supplier_payout_amount_mad ?? 0), 0)
    return { ...p, quoteCount: pQuotes.length, approvedQuotes: pApproved, revenue: pRevenue }
  }).sort((a, b) => b.quoteCount - a.quoteCount)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Analytiques</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Analytiques</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performance de votre catalogue sur la plateforme.</p>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Produits approuvés',  value: String(approvedProducts.length),  cls: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Produits en attente', value: String(pendingProducts.length),    cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Rejetés',             value: String(rejectedProducts.length),   cls: 'bg-red-50 border-red-200 text-red-600' },
            { label: 'Demandes de devis',   value: String(totalQuotes),               cls: 'bg-white border-gray-200 text-gray-900' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500 leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Quote stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Nouvelles demandes', value: String(newQuotes),       cls: 'bg-blue-50 border-blue-200 text-blue-700' },
            { label: 'Devis approuvés',    value: String(approvedQuotes),  cls: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Revenus approuvés',  value: formatMAD(totalRevenueMad), cls: 'bg-white border-gray-200 text-gray-900' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Per-product breakdown */}
        {productStats.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Performance par produit</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {productStats.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.product_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.quoteCount} demande{p.quoteCount !== 1 ? 's' : ''} · {p.approvedQuotes} approuvée{p.approvedQuotes !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatMAD(p.revenue)}</p>
                    <p className="text-xs text-gray-400">revenus</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {approvedProducts.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-400">Aucun produit approuvé pour le moment.</p>
            <Link href="/supplier/products" className="mt-3 inline-block text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
              Mes produits →
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
