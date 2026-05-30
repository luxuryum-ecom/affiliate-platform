import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import MatchingProfileForm from './MatchingProfileForm'
import OfferForm from './OfferForm'
import type {
  Profile,
  SupplierMatchingProfile,
  RfqMatch,
  RfqMatchStatus,
  SourcingRequest,
} from '@/types/database'

export const metadata = { title: 'Opportunités RFQ — Espace Fournisseur' }

const STATUS_BADGE: Record<RfqMatchStatus, { label: string; cls: string }> = {
  new:            { label: 'Nouveau',         cls: 'bg-blue-100 text-blue-700' },
  notified:       { label: 'Notifié',         cls: 'bg-indigo-100 text-indigo-700' },
  offer_received: { label: 'Offre envoyée',   cls: 'bg-amber-100 text-amber-700' },
  declined:       { label: 'Décliné',         cls: 'bg-gray-100 text-gray-500' },
  clarification:  { label: 'En clarification', cls: 'bg-purple-100 text-purple-700' },
  selected:       { label: 'Sélectionné ✓',   cls: 'bg-green-100 text-green-700' },
  expired:        { label: 'Expiré',          cls: 'bg-red-100 text-red-500' },
}

const URGENCY_DAYS = 7

type MatchRow = RfqMatch & {
  sourcing_request: Pick<SourcingRequest, 'id' | 'product_name' | 'category' | 'quantity' | 'target_country' | 'delivery_deadline' | 'notes'> | null
}

export default async function SupplierOpportunitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }
  if (profile?.role !== 'supplier') redirect('/login')

  const [matchingProfileRes, matchesRes] = await Promise.all([
    supabase
      .from('supplier_matching_profiles')
      .select('*')
      .eq('supplier_id', user.id)
      .maybeSingle(),
    supabase
      .from('rfq_matches')
      .select('*, sourcing_request:sourcing_requests!sourcing_request_id(id, product_name, category, quantity, target_country, delivery_deadline, notes)')
      .eq('supplier_id', user.id)
      .in('status', ['new', 'notified', 'offer_received', 'clarification', 'selected'])
      .order('total_score', { ascending: false })
      .limit(50),
  ])

  const matchingProfile = matchingProfileRes.data as SupplierMatchingProfile | null
  const matches = (matchesRes.data ?? []) as unknown as MatchRow[]

  const now = Date.now()
  const newCount     = matches.filter((m) => m.status === 'new' || m.status === 'notified').length
  const urgentCount  = matches.filter((m) => {
    const dd = m.sourcing_request?.delivery_deadline
    if (!dd) return false
    return (new Date(dd).getTime() - now) / 86400000 <= URGENCY_DAYS
  }).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Opportunités RFQ</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Opportunités actives</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{matches.length}</p>
          </div>
          <div className={`rounded-xl border p-4 ${newCount > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500">Nouvelles</p>
            <p className={`text-2xl font-bold mt-1 ${newCount > 0 ? 'text-indigo-700' : 'text-gray-900'}`}>{newCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${urgentCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500">Urgentes ({URGENCY_DAYS}j)</p>
            <p className={`text-2xl font-bold mt-1 ${urgentCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{urgentCount}</p>
          </div>
        </div>

        {/* Matching profile */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Profil de matching RFQ</h2>
              <p className="text-xs text-gray-500 mt-0.5">Le moteur utilise ces données pour vous matcher sur les demandes entrantes.</p>
            </div>
            {matchingProfile && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Actif</span>
            )}
          </div>
          <div className="p-6">
            <MatchingProfileForm existing={matchingProfile} />
          </div>
        </div>

        {/* Opportunities */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Demandes correspondantes ({matches.length})
          </h2>

          {matches.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400 mb-2">Aucune demande correspondante pour le moment.</p>
              <p className="text-xs text-gray-300">
                Complétez votre profil RFQ ci-dessus pour être inclus dans les prochains matchings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((m) => {
                const badge = STATUS_BADGE[m.status]
                const sr = m.sourcing_request
                const daysLeft = sr?.delivery_deadline
                  ? Math.ceil((new Date(sr.delivery_deadline).getTime() - now) / 86400000)
                  : null
                const isUrgent = daysLeft != null && daysLeft <= URGENCY_DAYS

                const canRespond = ['new', 'notified', 'clarification'].includes(m.status)

                return (
                  <div key={m.id} className={`bg-white rounded-xl border overflow-hidden ${isUrgent ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">
                              {sr?.product_name ?? 'Produit non précisé'}
                            </p>
                            {isUrgent && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">🔴 Urgent — {daysLeft}j</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5">
                            {sr?.category && (
                              <span className="text-xs text-gray-500">Catégorie : <span className="font-medium text-gray-700">{sr.category}</span></span>
                            )}
                            {sr?.quantity != null && (
                              <span className="text-xs text-gray-500">Quantité : <span className="font-medium text-gray-700">{sr.quantity} u.</span></span>
                            )}
                            {sr?.target_country && (
                              <span className="text-xs text-gray-500">Destination : <span className="font-medium text-gray-700">{sr.target_country}</span></span>
                            )}
                          </div>
                          {sr?.notes && (
                            <p className="text-xs text-gray-600 mt-1.5 italic">&ldquo;{sr.notes}&rdquo;</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Reçu le {new Date(m.created_at).toLocaleDateString('fr-FR')}
                            {sr?.delivery_deadline && ` · Deadline ${new Date(sr.delivery_deadline).toLocaleDateString('fr-FR')}`}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                          {/* Score bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.min(100, m.total_score)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-700">{Math.round(m.total_score)}/100</span>
                          </div>
                        </div>
                      </div>

                      {/* Score breakdown */}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        {[
                          { label: 'Catégorie', val: m.score_category, max: 30 },
                          { label: 'Pays',      val: m.score_country, max: 20 },
                          { label: 'MOQ',       val: m.score_moq, max: 20 },
                          { label: 'Délai',     val: m.score_lead_time, max: 10 },
                          { label: 'Fiabilité', val: m.score_reliability, max: 12 },
                          { label: 'Réactivité', val: m.score_response_rate, max: 8 },
                        ].map((s) => (
                          <span key={s.label} className="text-gray-400">
                            {s.label}: <span className={`font-medium ${s.val > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{Math.round(s.val)}/{s.max}</span>
                          </span>
                        ))}
                      </div>

                      {/* Offer form */}
                      {canRespond && <OfferForm matchId={m.id} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
