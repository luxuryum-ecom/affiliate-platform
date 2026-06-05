import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { computeSourcingMatches } from '@/app/actions/sourcing'
import SelectSupplierButton from '../SelectSupplierButton'
import type {
  SourcingRequest,
  SourcingRequestStatus,
  Profile,
  ScoredSupplier,
} from '@/types/database'

export const metadata = { title: 'Détail sourcing — Administration' }

const STATUS_BADGE: Record<SourcingRequestStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',            cls: 'bg-gray-100 text-gray-500' },
  matching: { label: 'Analyse en cours',      cls: 'bg-blue-100 text-blue-700' },
  matched:  { label: 'Fournisseur identifié', cls: 'bg-indigo-100 text-indigo-700' },
  quoted:   { label: 'Devis créé',            cls: 'bg-green-100 text-green-700' },
  closed:   { label: 'Clôturée',              cls: 'bg-gray-100 text-gray-400' },
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

type RequestRow = SourcingRequest & {
  wholesaler: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'> & { email?: string } | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSourcingDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  const { data } = await supabase
    .from('sourcing_requests')
    .select('*, wholesaler:profiles!wholesaler_id(id,full_name,phone,company_name)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const r = data as unknown as RequestRow

  // Also fetch wholesaler email from auth.users via profiles view
  const { data: wholesalerAuth } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', r.wholesaler_id)
    .single()

  const matches: ScoredSupplier[] = r.status === 'pending' || r.status === 'matching'
    ? (await computeSourcingMatches(id)).slice(0, 5)
    : []

  const badge = STATUS_BADGE[r.status]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/sourcing" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Sourcing intelligent
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
              {r.product_name}
            </span>
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Status + date */}
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="text-xs text-gray-400">
            Reçue le {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Request details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Détails de la demande</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Produit</dt>
                <dd className="font-medium text-gray-900 text-right">{r.product_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Catégorie</dt>
                <dd className="font-medium text-gray-900 text-right">{r.category}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Quantité</dt>
                <dd className="font-medium text-gray-900 text-right">{r.quantity.toLocaleString('fr-MA')} unités</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Budget cible</dt>
                <dd className="font-medium text-gray-900 text-right">{Number(r.target_budget_mad).toFixed(2)} MAD/u</dd>
              </div>
              {r.target_country && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Pays cible</dt>
                  <dd className="font-medium text-gray-900 text-right">{r.target_country}</dd>
                </div>
              )}
              {r.delivery_deadline && (
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Délai souhaité</dt>
                  <dd className="font-medium text-gray-900 text-right">
                    {new Date(r.delivery_deadline).toLocaleDateString('fr-FR')}
                  </dd>
                </div>
              )}
            </dl>
            {r.notes && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes grossiste</p>
                <p className="text-sm text-gray-700 italic">&ldquo;{r.notes}&rdquo;</p>
              </div>
            )}
            {r.admin_notes && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes internes (admin)</p>
                <p className="text-sm text-gray-700">{r.admin_notes}</p>
              </div>
            )}
          </div>

          {/* Wholesaler contact */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Contact grossiste</h2>
            {r.wholesaler ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Nom</dt>
                  <dd className="font-medium text-gray-900 text-right">{r.wholesaler.full_name}</dd>
                </div>
                {r.wholesaler.company_name && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Société</dt>
                    <dd className="font-medium text-gray-900 text-right">{r.wholesaler.company_name}</dd>
                  </div>
                )}
                {r.wholesaler.phone && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Téléphone</dt>
                    <dd className="text-right">
                      <a
                        href={`tel:${r.wholesaler.phone}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {r.wholesaler.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">Informations grossiste non disponibles.</p>
            )}

            <div className="pt-3 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-gray-700">Actions</p>
              <Link
                href="/admin/quote-requests"
                className="block w-full text-center text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                Voir les demandes de devis →
              </Link>
              <Link
                href="/admin/supplier-quotes"
                className="block w-full text-center text-xs px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Voir les devis marketplace →
              </Link>
            </div>
          </div>
        </div>

        {/* Matched suppliers */}
        {matches.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Fournisseurs suggérés <span className="text-xs font-normal text-gray-400">(confidentiel — non visible grossiste)</span>
            </h2>
            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div key={m.supplierId} className="rounded-lg border border-gray-100 p-4">
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

        {r.status === 'quoted' && r.quote_request_id && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm text-green-700">
              Devis créé —{' '}
              <Link href="/admin/quote-requests" className="underline font-medium">
                Voir les demandes de devis
              </Link>
            </p>
          </div>
        )}

      </main>
    </div>
  )
}
