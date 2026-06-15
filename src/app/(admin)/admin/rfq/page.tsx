import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import { RunMatchingButton, NotifyButton, MatchStatusButton } from './AdminRfqActions'
import type {
  Profile,
  RfqMatch,
  RfqMatchStatus,
  RfqOffer,
  SourcingRequest,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.rfq')
  return { title: t('metaTitle') }
}

// CSS only — no label in this map (labels via t())
const STATUS_BADGE_CLS: Record<RfqMatchStatus, string> = {
  new:            'bg-surface-2 text-muted border border-line',
  notified:       'bg-warning-subtle text-warning border border-warning-line',
  offer_received: 'bg-warning-subtle text-warning-dark border border-warning-line',
  declined:       'bg-surface-2 text-faint border border-line',
  clarification:  'bg-surface-2 text-muted border border-line',
  selected:       'bg-success-subtle text-success border border-success-line',
  expired:        'bg-danger-subtle text-danger border border-danger-line',
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

  const t  = await getTranslations('admin.rfq')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  function statusLabel(status: RfqMatchStatus): string {
    const map: Record<RfqMatchStatus, string> = {
      new:            t('statusNew'),
      notified:       t('statusNotified'),
      offer_received: t('statusOfferReceived'),
      declined:       t('statusDeclined'),
      clarification:  t('statusClarification'),
      selected:       t('statusSelected'),
      expired:        t('statusExpired'),
    }
    return map[status] ?? status
  }

  function offerTypeLabel(type: string): string {
    if (type === 'offer')         return t('offerTypeOffer')
    if (type === 'decline')       return t('offerTypeDecline')
    if (type === 'clarification') return t('offerTypeClarification')
    return type
  }

  function offerTypeCls(type: string): string {
    if (type === 'offer')         return 'bg-success-subtle text-success border border-success-line'
    if (type === 'decline')       return 'bg-danger-subtle text-danger border border-danger-line'
    return 'bg-surface-2 text-muted border border-line'
  }

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

  // Eligible new matches (score_category > 0 = at least one common category)
  const eligibleNewMatchIds = matches.filter((m) => m.status === 'new' && m.score_category > 0).map((m) => m.id)
  const ineligibleNewCount  = matches.filter((m) => m.status === 'new' && m.score_category === 0).length

  const stats = [
    { label: t('statRfqCreated'),     value: totalSourcing,        highlight: false },
    { label: t('statMatched'),        value: totalMatches,         highlight: false },
    { label: t('statOffersReceived'), value: offers,               highlight: offers > 0 },
    { label: t('statConvRate'),       value: `${conversionRate}%`, highlight: newMatches > 0 },
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
          </div>
          {(eligibleNewMatchIds.length > 0 || ineligibleNewCount > 0) && (
            <div className="flex items-center gap-2 flex-wrap">
              {ineligibleNewCount > 0 && (
                <span className="text-xs text-danger bg-danger-subtle border border-danger-line px-2.5 py-1 rounded-full">
                  {t('ineligibleBadge', { count: ineligibleNewCount })}
                </span>
              )}
              <NotifyButton matchIds={eligibleNewMatchIds} ineligibleCount={ineligibleNewCount} />
            </div>
          )}
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 ${s.highlight ? 'bg-warning-subtle border-warning-line' : 'bg-surface border-line'}`}
            >
              <p className="text-xs text-muted leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.highlight ? 'text-warning-dark' : 'text-foreground'}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Sourcing requests — run matching */}
        {sourcingRequests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('matchingTitle')}</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {sourcingRequests.map((req) => {
                const hasMatches = grouped.has(req.id)
                return (
                  <div key={req.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-foreground">{req.product_name}</p>
                      <p className="text-xs text-muted">
                        {req.category} · {req.quantity} u.
                        {req.target_country ? ` · ${req.target_country}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasMatches && (
                        <span className="text-xs text-success font-medium">
                          {t('matchCount', { count: grouped.get(req.id)!.matches.length })}
                        </span>
                      )}
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
            <h2 className="text-sm font-semibold text-foreground">{t('groupTitle')}</h2>
            {Array.from(grouped.values()).map(({ request, matches: reqMatches }) => (
              <div key={request.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-5 py-3 bg-surface-2 border-b border-line">
                  <p className="text-sm font-semibold text-foreground">
                    {request.product_name}
                    <span className="font-normal text-muted ml-2 text-xs">
                      {request.category} · {request.quantity} u.
                      {request.target_country ? ` · ${request.target_country}` : ''}
                    </span>
                  </p>
                </div>

                {/* Offer comparison table — shown when ≥2 actual offers received */}
                {(() => {
                  const offersWithPrice = reqMatches
                    .flatMap((m) => m.offers.filter((o) => o.response_type === 'offer').map((o) => ({ m, o })))
                  if (offersWithPrice.length < 2) return null
                  return (
                    <div className="px-5 py-4 border-b border-line bg-warning-subtle">
                      <p className="text-xs font-semibold text-warning-dark mb-2">{t('offersComparisonTitle')}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-muted border-b border-warning-line">
                              <th className="pb-1.5 pr-4 font-medium">{t('colSupplier')}</th>
                              <th className="pb-1.5 pr-4 font-medium">{t('colUnitPrice')}</th>
                              <th className="pb-1.5 pr-4 font-medium">{t('colMoq')}</th>
                              <th className="pb-1.5 pr-4 font-medium">{t('colLeadTime')}</th>
                              <th className="pb-1.5 font-medium">{t('colScore')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-warning-line">
                            {offersWithPrice.map(({ m, o }) => (
                              <tr key={o.id} className={m.status === 'selected' ? 'font-semibold text-success' : 'text-foreground'}>
                                <td className="py-1.5 pr-4">
                                  {m.supplier?.full_name ?? '—'}
                                  {m.status === 'selected' && <span className="ml-1 text-success">✓</span>}
                                </td>
                                <td className="py-1.5 pr-4">
                                  {o.unit_price_usd != null ? t('unitPriceValue', { price: o.unit_price_usd }) : '—'}
                                </td>
                                <td className="py-1.5 pr-4">{o.moq_offered != null ? o.moq_offered : '—'}</td>
                                <td className="py-1.5 pr-4">
                                  {o.lead_time_days != null ? t('leadTimeDays', { days: o.lead_time_days }) : '—'}
                                </td>
                                <td className="py-1.5">{t('scoreDetail', { val: Math.round(m.total_score) })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}

                <div className="divide-y divide-line">
                  {reqMatches.map((m, idx) => {
                    const badgeCls           = STATUS_BADGE_CLS[m.status]
                    const isIneligible       = m.score_category === 0
                    const hasNoReliabilityData = m.score_reliability === 0 && m.score_response_rate === 0
                    return (
                      <div key={m.id} className={`p-4 ${isIneligible ? 'bg-danger-subtle' : ''}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-faint w-5">#{idx + 1}</span>
                              <p className="text-sm font-medium text-foreground">{m.supplier?.full_name ?? '—'}</p>
                              {isIneligible && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-subtle text-danger font-semibold border border-danger-line">
                                  {t('ineligibleLabel')}
                                </span>
                              )}
                            </div>

                            {/* Score bar */}
                            <div className="flex items-center gap-2 mt-1 ml-7">
                              <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isIneligible ? 'bg-danger' : 'bg-foreground'}`}
                                  style={{ width: `${Math.min(100, m.total_score)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted font-semibold">
                                {t('scoreDetail', { val: Math.round(m.total_score) })}
                              </span>
                            </div>

                            {/* Score details */}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 ml-7 text-xs text-faint">
                              <span className={m.score_category === 0 ? 'text-danger font-semibold' : ''}>
                                {t('scoreCategoryDetail', { val: Math.round(m.score_category) })}
                              </span>
                              <span className={m.score_country === 0 && request.target_country ? 'text-warning font-semibold' : ''}>
                                {t('scoreCountryDetail', { val: Math.round(m.score_country) })}
                              </span>
                              <span>{t('scoreMoqDetail', { val: Math.round(m.score_moq) })}</span>
                              <span>{t('scoreLeadTimeDetail', { val: Math.round(m.score_lead_time) })}</span>
                              <span className={hasNoReliabilityData ? 'text-line italic' : ''}>
                                {hasNoReliabilityData
                                  ? t('scoreReliabilityNA')
                                  : t('scoreReliabilityDetail', { val: Math.round(m.score_reliability) })}
                              </span>
                              <span className={hasNoReliabilityData ? 'text-line italic' : ''}>
                                {hasNoReliabilityData
                                  ? t('scoreResponseNA')
                                  : t('scoreResponseDetail', { val: Math.round(m.score_response_rate) })}
                              </span>
                            </div>

                            {/* Eligibility warnings */}
                            <div className="flex flex-wrap gap-1.5 mt-1.5 ml-7">
                              {isIneligible && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-subtle text-danger font-medium border border-danger-line">
                                  {t('warningNoCategory')}
                                </span>
                              )}
                              {m.score_country === 0 && request.target_country && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-warning-subtle text-warning font-medium border border-warning-line">
                                  {t('warningCountry')}
                                </span>
                              )}
                              {hasNoReliabilityData && !isIneligible && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                  {t('warningNoData')}
                                </span>
                              )}
                              {!isIneligible && m.total_score < 20 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium border border-line">
                                  {t('warningWeakMatch')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${badgeCls}`}>
                              {statusLabel(m.status)}
                            </span>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {m.status === 'new' && (
                                isIneligible
                                  ? (
                                    <span
                                      className="text-xs px-2.5 py-1 bg-danger-subtle text-danger rounded-lg cursor-not-allowed border border-danger-line"
                                      title={t('warningNoCategory')}
                                    >
                                      {t('notifyBlocked')}
                                    </span>
                                  )
                                  : <MatchStatusButton matchId={m.id} newStatus="notified" label={t('actionNotify')} />
                              )}
                              {m.status === 'offer_received' && (
                                <MatchStatusButton matchId={m.id} newStatus="selected" label={t('actionSelect')} />
                              )}
                              {!['expired', 'selected'].includes(m.status) && (
                                <MatchStatusButton matchId={m.id} newStatus="expired" label={t('actionExpire')} />
                              )}
                              {m.status === 'selected' && (
                                <Link
                                  href="/admin/quote-requests"
                                  className="text-xs px-2.5 py-1 bg-success-subtle text-success hover:bg-success-line rounded-lg transition-colors font-medium border border-success-line focus:outline-none focus:ring-2 focus:ring-gold-400"
                                >
                                  {t('createQuoteLink')}
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Offers */}
                        {m.offers.length > 0 && (
                          <div className="mt-3 ml-7 bg-warning-subtle rounded-lg p-3 space-y-2">
                            {m.offers.map((o) => (
                              <div key={o.id} className="text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-full font-medium border ${offerTypeCls(o.response_type)}`}>
                                    {offerTypeLabel(o.response_type)}
                                  </span>
                                  {o.unit_price_usd != null && (
                                    <span className="text-foreground font-medium">
                                      {t('unitPriceValue', { price: o.unit_price_usd })}
                                    </span>
                                  )}
                                  {o.moq_offered != null && <span className="text-muted">MOQ: {o.moq_offered}</span>}
                                  {o.lead_time_days != null && (
                                    <span className="text-muted">{t('leadTimeDays', { days: o.lead_time_days })}</span>
                                  )}
                                  <span className="text-faint">
                                    {new Date(o.created_at).toLocaleDateString(locale)}
                                  </span>
                                </div>
                                {o.message && <p className="mt-1 text-muted italic">&ldquo;{o.message}&rdquo;</p>}
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
