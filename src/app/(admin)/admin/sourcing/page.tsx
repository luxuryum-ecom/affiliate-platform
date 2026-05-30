import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { computeSourcingMatches } from '@/app/actions/sourcing'
import SelectSupplierButton from './SelectSupplierButton'
import type {
  SourcingRequest,
  SourcingRequestStatus,
  Profile,
  ScoredSupplier,
  Product,
} from '@/types/database'

export const metadata = { title: 'Sourcing intelligent — Administration' }

const STATUS_BADGE: Record<SourcingRequestStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',            cls: 'bg-gray-100 text-gray-500' },
  matching: { label: 'Analyse en cours',      cls: 'bg-blue-100 text-blue-700' },
  matched:  { label: 'Fournisseur identifié', cls: 'bg-indigo-100 text-indigo-700' },
  quoted:   { label: 'Devis créé',            cls: 'bg-green-100 text-green-700' },
  closed:   { label: 'Clôturée',              cls: 'bg-gray-100 text-gray-400' },
}

type RequestRow = SourcingRequest & {
  wholesaler: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'> | null
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-green-500' : score >= 35 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 tabular-nums w-6 text-right">{score}</span>
    </div>
  )
}

export default async function AdminSourcingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  // ── Stats ────────────────────────────────────────────────────────────────────
  const [
    { data: allData },
    { count: totalCount },
    { count: matchedCount },
    { count: quotedCount },
  ] = await Promise.all([
    supabase
      .from('sourcing_requests')
      .select('*, wholesaler:profiles!wholesaler_id(id,full_name,phone,company_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }).in('status', ['matched', 'quoted']),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }).eq('status', 'quoted'),
  ])

  const requests = (allData ?? []) as unknown as RequestRow[]

  const total    = totalCount ?? 0
  const matched  = matchedCount ?? 0
  const quoted   = quotedCount ?? 0
  const convRate = total > 0 ? Math.round((quoted / total) * 100) : 0

  // ── Products (for convert-to-quote form) ──────────────────────────────────
  const { data: productsData } = await supabase
    .from('products')
    .select('id, name')
    .eq('approval_status', 'approved')
    .eq('availability_type', 'import_on_demand')
    .order('name')

  const products = (productsData ?? []) as unknown as Pick<Product, 'id' | 'name'>[]

  // ── Compute matches for pending requests (top 3 each) ────────────────────
  const pendingIds = requests.filter((r) => r.status === 'pending').map((r) => r.id)
  const matchesMap = new Map<string, ScoredSupplier[]>()
  await Promise.all(
    pendingIds.map(async (id) => {
      const matches = await computeSourcingMatches(id)
      matchesMap.set(id, matches.slice(0, 3))
    })
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Sourcing intelligent</span>
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
        {/* Title */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sourcing intelligent</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Matching automatique grossiste → fournisseur. L&apos;identité du fournisseur reste confidentielle.
          </p>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Demandes reçues',     value: String(total),    highlight: false },
            { label: 'Matchées / devisées',  value: String(matched),  highlight: matched > 0 },
            { label: 'Converties en devis',  value: String(quoted),   highlight: false },
            { label: 'Taux de conversion',   value: `${convRate}%`,   highlight: false },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 ${s.highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}
            >
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`mt-1.5 text-2xl font-bold tabular-nums ${s.highlight ? 'text-amber-700' : 'text-gray-900'}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Requests list */}
        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune demande de sourcing pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const badge   = STATUS_BADGE[r.status]
              const matches = matchesMap.get(r.id) ?? []

              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="p-5 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.product_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.category} · {r.quantity} unités · {Number(r.target_budget_mad).toFixed(2)} MAD/u
                          {r.target_country ? ` · ${r.target_country}` : ''}
                        </p>
                        {r.wholesaler && (
                          <p className="text-xs text-gray-400 mt-1">
                            {r.wholesaler.full_name}
                            {r.wholesaler.company_name ? ` (${r.wholesaler.company_name})` : ''}
                            {r.wholesaler.phone ? ` · ${r.wholesaler.phone}` : ''}
                          </p>
                        )}
                        {r.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{r.notes}&rdquo;</p>
                        )}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {r.delivery_deadline && (
                      <p className="text-xs text-gray-400 mt-2">
                        Délai : {new Date(r.delivery_deadline).toLocaleDateString('fr-MA')}
                      </p>
                    )}
                  </div>

                  {/* Matched suppliers (for pending requests) */}
                  {matches.length > 0 && (
                    <div className="p-5 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        Meilleurs fournisseurs (confidentiel)
                      </p>
                      <div className="space-y-3">
                        {matches.map((m, idx) => (
                          <div key={m.supplierId} className="rounded-lg border border-gray-100 p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 font-semibold w-4">#{idx + 1}</span>
                                <p className="text-sm font-medium text-gray-900">{m.supplierName}</p>
                              </div>
                              <SelectSupplierButton
                                requestId={r.id}
                                supplierId={m.supplierId}
                                isSelected={r.selected_supplier_id === m.supplierId}
                              />
                            </div>
                            <ScoreBar score={m.matchScore} />
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-500">
                              <span>Catégories: {m.scoreBreakdown.categoryMatch}/30</span>
                              <span>Pays: {m.scoreBreakdown.countryMatch}/20</span>
                              <span>Fiabilité: {m.scoreBreakdown.reliability}/30</span>
                              <span>MOQ: {m.scoreBreakdown.moqCompatibility}/10</span>
                              <span>Perf: {m.scoreBreakdown.performance}/10</span>
                              {m.minMoq != null && <span>Min MOQ: {m.minMoq}</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                              {m.categories} · {m.countries} · Fiabilité {m.reliabilityScore}/100
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Convert to quote */}
                  {(r.status === 'pending' || r.status === 'matched') && products.length > 0 && (
                    <div className="p-5 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-700 mb-3">Créer un devis directement</p>
                      <form action="/admin/sourcing/convert" method="POST" className="flex flex-wrap gap-3 items-end">
                        <input type="hidden" name="sourcing_request_id" value={r.id} />
                        <input type="hidden" name="quantity" value={r.quantity} />
                        <input type="hidden" name="target_budget_mad" value={r.target_budget_mad} />
                        <input type="hidden" name="notes" value={r.notes ?? ''} />
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Produit catalogue</label>
                          <select
                            name="product_id"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none"
                          >
                            <option value="">Choisir un produit...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <Link
                          href={`/admin/quote-requests`}
                          className="text-xs px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          Voir les devis →
                        </Link>
                      </form>
                    </div>
                  )}

                  {r.status === 'quoted' && r.quote_request_id && (
                    <div className="p-4 bg-green-50">
                      <p className="text-xs text-green-700">
                        Devis créé —{' '}
                        <Link href="/admin/quote-requests" className="underline font-medium">
                          Voir les demandes de devis
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
