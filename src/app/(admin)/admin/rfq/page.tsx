import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { RunMatchingButton, NotifyButton, MatchStatusButton } from './AdminRfqActions'
import type {
  Profile,
  RfqMatch,
  RfqMatchStatus,
  RfqOffer,
  SourcingRequest,
} from '@/types/database'

export const metadata = { title: 'Moteur RFQ — Administration' }

const STATUS_BADGE: Record<RfqMatchStatus, { label: string; cls: string }> = {
  new:            { label: 'Nouveau',          cls: 'bg-blue-100 text-blue-700' },
  notified:       { label: 'Notifié',          cls: 'bg-indigo-100 text-indigo-700' },
  offer_received: { label: 'Offre reçue',      cls: 'bg-amber-100 text-amber-700' },
  declined:       { label: 'Décliné',          cls: 'bg-gray-100 text-gray-500' },
  clarification:  { label: 'Clarification',    cls: 'bg-purple-100 text-purple-700' },
  selected:       { label: 'Sélectionné',      cls: 'bg-green-100 text-green-700' },
  expired:        { label: 'Expiré',           cls: 'bg-red-100 text-red-500' },
}

type MatchRow = RfqMatch & {
  supplier: Pick<Profile, 'id' | 'full_name'> | null
  sourcing_request: Pick<SourcingRequest, 'id' | 'product_name' | 'category' | 'quantity' | 'target_country' | 'delivery_deadline'> | null
  offers: RfqOffer[]
}

type SourcingGroup = {
  request: Pick<SourcingRequest, 'id' | 'product_name' | 'category' | 'quantity' | 'target_country' | 'delivery_deadline'>
  matches: MatchRow[]
}

export default async function AdminRfqPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('full_name, role').eq('id', user.id).single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }
  if (profile?.role !== 'admin') redirect('/login')

  // Fetch all matches with supplier and sourcing request info
  const { data: matchesData } = await supabase
    .from('rfq_matches')
    .select('*, supplier:profiles!supplier_id(id,full_name), sourcing_request:sourcing_requests!sourcing_request_id(id,product_name,category,quantity,target_country,delivery_deadline)')
    .is('quote_request_id', null)
    .order('total_score', { ascending: false })
    .limit(200)

  const matches = (matchesData ?? []) as unknown as MatchRow[]
  const matchIds = matches.map((m) => m.id)

  // Fetch all offers for these matches
  let allOffers: RfqOffer[] = []
  if (matchIds.length > 0) {
    const { data: offersData } = await supabase
      .from('rfq_offers')
      .select('*')
      .in('rfq_match_id', matchIds)
      .order('created_at', { ascending: false })
    allOffers = (offersData ?? []) as RfqOffer[]
  }

  // Attach offers to matches
  const matchesWithOffers = matches.map((m) => ({
    ...m,
    offers: allOffers.filter((o) => o.rfq_match_id === m.id),
  }))

  // Fetch all sourcing requests for RunMatchingButton
  const { data: sourcingData } = await supabase
    .from('sourcing_requests')
    .select('id, product_name, category, quantity, target_country, delivery_deadline, status')
    .order('created_at', { ascending: false })
    .limit(50)

  type SourcingRow = Pick<SourcingRequest, 'id' | 'product_name' | 'category' | 'quantity' | 'target_country' | 'delivery_deadline'> & { status: string }
  const sourcingRequests = (sourcingData ?? []) as SourcingRow[]

  // Group matches by sourcing request
  const grouped = new Map<string, SourcingGroup>()
  for (const m of matchesWithOffers) {
    if (!m.sourcing_request) continue
    const reqId = m.sourcing_request.id
    if (!grouped.has(reqId)) {
      grouped.set(reqId, { request: m.sourcing_request, matches: [] })
    }
    grouped.get(reqId)!.matches.push(m)
  }

  // Analytics
  const totalMatches   = matches.length
  const newMatches     = matches.filter((m) => m.status === 'new').length
  const offers         = allOffers.filter((o) => o.response_type === 'offer').length
  const totalSourcing  = sourcingRequests.length
  const converted      = sourcingRequests.filter((r) => r.status === 'quoted' || r.status === 'closed').length
  const conversionRate = totalSourcing > 0 ? Math.round((converted / totalSourcing) * 100) : 0

  // New matches to notify
  const newMatchIds = matches.filter((m) => m.status === 'new').map((m) => m.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Moteur RFQ</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Moteur de matching RFQ</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scores automatiques, réponses fournisseurs, suivi des offres.</p>
          </div>
          {newMatchIds.length > 0 && (
            <NotifyButton matchIds={newMatchIds} />
          )}
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'RFQs créés',       value: totalSourcing,  cls: 'bg-white border-gray-200 text-gray-900' },
            { label: 'Suppliers matchés', value: totalMatches,   cls: 'bg-white border-gray-200 text-gray-900' },
            { label: 'Offres reçues',     value: offers,         cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Taux conversion',   value: `${conversionRate}%`, cls: newMatches > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-900' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0,2).join(' ')}`}>
              <p className="text-xs text-gray-500 leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Sourcing requests without matches */}
        {sourcingRequests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Lancer le matching</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {sourcingRequests.map((req) => {
                const hasMatches = grouped.has(req.id)
                return (
                  <div key={req.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{req.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {req.category} · {req.quantity} u.
                        {req.target_country ? ` · ${req.target_country}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasMatches && <span className="text-xs text-green-700 font-medium">✓ {grouped.get(req.id)!.matches.length} match(es)</span>}
                      <RunMatchingButton sourcingId={req.id} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Grouped matches by sourcing request */}
        {grouped.size > 0 && (
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-gray-900">Matches & réponses fournisseurs</h2>
            {Array.from(grouped.values()).map(({ request, matches: reqMatches }) => (
              <div key={request.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <p className="text-sm font-semibold text-gray-900">
                    {request.product_name}
                    <span className="font-normal text-gray-500 ml-2 text-xs">
                      {request.category} · {request.quantity} u.
                      {request.target_country ? ` · ${request.target_country}` : ''}
                    </span>
                  </p>
                </div>

                <div className="divide-y divide-gray-100">
                  {reqMatches.map((m, idx) => {
                    const badge = STATUS_BADGE[m.status]
                    return (
                      <div key={m.id} className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-gray-400 w-5">#{idx + 1}</span>
                              <p className="text-sm font-medium text-gray-900">{m.supplier?.full_name ?? '—'}</p>
                            </div>

                            {/* Score bar */}
                            <div className="flex items-center gap-2 mt-1 ml-7">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${Math.min(100, m.total_score)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-600 font-semibold">{Math.round(m.total_score)}/100</span>
                            </div>

                            {/* Score details */}
                            <div className="flex flex-wrap gap-2 mt-1.5 ml-7 text-xs text-gray-400">
                              <span className={m.score_category === 0 ? 'text-red-500 font-semibold' : ''}>
                                Cat:{Math.round(m.score_category)}/30
                              </span>
                              <span className={m.score_country === 0 && request.target_country ? 'text-amber-600 font-semibold' : ''}>
                                Pays:{Math.round(m.score_country)}/20
                              </span>
                              <span>MOQ:{Math.round(m.score_moq)}/20</span>
                              <span>Délai:{Math.round(m.score_lead_time)}/10</span>
                              <span>Fiab:{Math.round(m.score_reliability)}/12</span>
                              <span>React:{Math.round(m.score_response_rate)}/8</span>
                            </div>
                            {/* Eligibility warnings */}
                            <div className="flex flex-wrap gap-1.5 mt-1.5 ml-7">
                              {m.score_category === 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                  ⚠ Pas de catégorie commune
                                </span>
                              )}
                              {m.score_country === 0 && request.target_country && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                  Pays non couvert
                                </span>
                              )}
                              {m.total_score < 20 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                                  Match faible
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {m.status === 'new' && <MatchStatusButton matchId={m.id} newStatus="notified" label="Notifier" />}
                              {m.status === 'offer_received' && <MatchStatusButton matchId={m.id} newStatus="selected" label="Sélectionner" />}
                              {!['expired','selected'].includes(m.status) && <MatchStatusButton matchId={m.id} newStatus="expired" label="Expirer" />}
                            </div>
                          </div>
                        </div>

                        {/* Offers */}
                        {m.offers.length > 0 && (
                          <div className="mt-3 ml-7 bg-amber-50 rounded-lg p-3 space-y-2">
                            {m.offers.map((o) => (
                              <div key={o.id} className="text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                                    o.response_type === 'offer' ? 'bg-green-100 text-green-700' :
                                    o.response_type === 'decline' ? 'bg-red-100 text-red-600' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {o.response_type === 'offer' ? 'Offre' : o.response_type === 'decline' ? 'Décliné' : 'Clarification'}
                                  </span>
                                  {o.unit_price_usd != null && <span className="text-gray-700 font-medium">${o.unit_price_usd}/u.</span>}
                                  {o.moq_offered != null && <span className="text-gray-600">MOQ: {o.moq_offered}</span>}
                                  {o.lead_time_days != null && <span className="text-gray-600">Délai: {o.lead_time_days}j</span>}
                                  <span className="text-gray-400">{new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                                </div>
                                {o.message && <p className="mt-1 text-gray-600 italic">&ldquo;{o.message}&rdquo;</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
