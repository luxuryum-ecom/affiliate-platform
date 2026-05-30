import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import SourcingForm from './SourcingForm'
import type { Profile, SourcingRequest, SourcingRequestStatus } from '@/types/database'

export const metadata = { title: 'Sourcing intelligent — Espace Grossiste' }

const STATUS_BADGE: Record<SourcingRequestStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',  cls: 'bg-gray-100 text-gray-500' },
  matching: { label: 'Analyse en cours', cls: 'bg-blue-100 text-blue-700' },
  matched:  { label: 'Fournisseur identifié', cls: 'bg-indigo-100 text-indigo-700' },
  quoted:   { label: 'Devis créé',  cls: 'bg-green-100 text-green-700' },
  closed:   { label: 'Clôturée',    cls: 'bg-gray-100 text-gray-400' },
}

export default async function WholesaleSourcingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const { data } = await supabase
    .from('sourcing_requests')
    .select('id, product_name, category, quantity, target_budget_mad, target_country, delivery_deadline, status, created_at')
    .eq('wholesaler_id', user!.id)
    .order('created_at', { ascending: false })

  const requests = (data ?? []) as unknown as Pick<
    SourcingRequest,
    'id' | 'product_name' | 'category' | 'quantity' | 'target_budget_mad' | 'target_country' | 'delivery_deadline' | 'status' | 'created_at'
  >[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Intro */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sourcing intelligent</h1>
          <p className="text-sm text-gray-500 mt-1">
            Décrivez votre besoin. Notre équipe identifie automatiquement les meilleurs fournisseurs
            et vous soumet un devis sans divulguer l&apos;identité du fournisseur.
          </p>
        </div>

        {/* Submission form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Nouvelle demande de sourcing</h2>
          <SourcingForm />
        </div>

        {/* Past requests */}
        {requests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Mes demandes ({requests.length})
            </h2>
            <div className="space-y-3">
              {requests.map((r) => {
                const badge = STATUS_BADGE[r.status]
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.product_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.category} · {r.quantity} unités · {Number(r.target_budget_mad).toFixed(2)} MAD/u
                          {r.target_country ? ` · ${r.target_country}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {r.delivery_deadline && (
                      <p className="text-xs text-gray-400 mt-2">
                        Délai souhaité : {new Date(r.delivery_deadline).toLocaleDateString('fr-MA')}
                      </p>
                    )}
                    <p className="text-xs text-gray-300 mt-1">
                      {new Date(r.created_at).toLocaleDateString('fr-MA')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
