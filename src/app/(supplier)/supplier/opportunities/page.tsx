import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import MatchingProfileForm from './MatchingProfileForm'
import OfferForm from './OfferForm'
import type {
  Profile,
  SupplierMatchingProfile,
  RfqMatch,
  RfqMatchStatus,
  SourcingRequest,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.opportunities')
  return { title: t('metaTitle') }
}

const STATUS_BADGE_CLS: Record<RfqMatchStatus, string> = {
  new:            'bg-surface-2 text-foreground',
  notified:       'bg-surface-2 text-muted',
  offer_received: 'bg-warning-soft text-warning-fg',
  declined:       'bg-surface-2 text-muted',
  clarification:  'bg-surface-2 text-muted',
  selected:       'bg-success-soft text-success-fg',
  expired:        'bg-danger-soft text-danger-fg',
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

  const t = await getTranslations('supplier.opportunities')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  const now = Date.now()
  const newCount     = matches.filter((m) => m.status === 'new' || m.status === 'notified').length
  const urgentCount  = matches.filter((m) => {
    const dd = m.sourcing_request?.delivery_deadline
    if (!dd) return false
    return (new Date(dd).getTime() - now) / 86400000 <= URGENCY_DAYS
  }).length

  const STATUS_BADGE_LABEL: Record<RfqMatchStatus, string> = {
    new:            t('statusNew'),
    notified:       t('statusNotified'),
    offer_received: t('statusOfferReceived'),
    declined:       t('statusDeclined'),
    clarification:  t('statusClarification'),
    selected:       t('statusSelected'),
    expired:        t('statusExpired'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-line p-4">
            <p className="text-xs text-muted">{t('statActive')}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{matches.length}</p>
          </div>
          <div className={`rounded-xl border p-4 ${newCount > 0 ? 'bg-accent-soft border-gold-300' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted">{t('statNew')}</p>
            <p className={`text-2xl font-bold mt-1 ${newCount > 0 ? 'text-accent-fg' : 'text-foreground'}`}>{newCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${urgentCount > 0 ? 'bg-danger-soft border-danger' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted">{t('statUrgent', { days: URGENCY_DAYS })}</p>
            <p className={`text-2xl font-bold mt-1 ${urgentCount > 0 ? 'text-danger-fg' : 'text-foreground'}`}>{urgentCount}</p>
          </div>
        </div>

        {/* Matching profile */}
        <div id="matching-profile" className="bg-surface rounded-xl border border-line overflow-hidden scroll-mt-20">
          <div className="px-6 py-4 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('matchingTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('matchingSubtitle')}</p>
            </div>
            {matchingProfile && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-success-soft text-success-fg font-medium">{t('matchingActiveBadge')}</span>
            )}
          </div>
          <div className="p-6">
            <MatchingProfileForm existing={matchingProfile} />
          </div>
        </div>

        {/* Opportunities */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            {t('opportunitiesTitle', { count: matches.length })}
          </h2>

          {matches.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-10 text-center">
              {matchingProfile ? (
                <>
                  <p className="text-sm text-faint mb-2">{t('emptyTitle')}</p>
                  <p className="text-xs text-faint">{t('emptySubtitle')}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground mb-2">{t('emptyNoProfileTitle')}</p>
                  <p className="text-xs text-muted mb-4">{t('emptyNoProfileSubtitle')}</p>
                  <a
                    href="#matching-profile"
                    className="inline-block text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    {t('emptyNoProfileCta')}
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((m) => {
                const badgeCls = STATUS_BADGE_CLS[m.status]
                const badgeLabel = STATUS_BADGE_LABEL[m.status]
                const sr = m.sourcing_request
                const daysLeft = sr?.delivery_deadline
                  ? Math.ceil((new Date(sr.delivery_deadline).getTime() - now) / 86400000)
                  : null
                const isUrgent = daysLeft != null && daysLeft <= URGENCY_DAYS

                const canRespond = ['new', 'notified', 'clarification'].includes(m.status)

                return (
                  <div key={m.id} className={`bg-surface rounded-xl border overflow-hidden ${isUrgent ? 'border-danger' : 'border-line'}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">
                              {sr?.product_name ?? t('labelProduct')}
                            </p>
                            {isUrgent && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-danger-soft text-danger-fg font-medium">🔴 {t('urgentBadge', { days: daysLeft })}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5">
                            {sr?.category && (
                              <span className="text-xs text-muted">{t('labelCategory', { value: sr.category })}</span>
                            )}
                            {sr?.quantity != null && (
                              <span className="text-xs text-muted">{t('labelQty', { value: sr.quantity })}</span>
                            )}
                            {sr?.target_country && (
                              <span className="text-xs text-muted">{t('labelDestination', { value: sr.target_country })}</span>
                            )}
                          </div>
                          {sr?.notes && (
                            <p className="text-xs text-muted mt-1.5 italic">&ldquo;{sr.notes}&rdquo;</p>
                          )}
                          <p className="text-xs text-faint mt-1">
                            {t('receivedOn', { date: new Date(m.created_at).toLocaleDateString(locale) })}
                            {sr?.delivery_deadline && t('deadline', { date: new Date(sr.delivery_deadline).toLocaleDateString(locale) })}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badgeCls}`}>{badgeLabel}</span>
                          {/* Score bar */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-success rounded-full"
                                style={{ width: `${Math.min(100, m.total_score)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted">{Math.round(m.total_score)}/100</span>
                          </div>
                        </div>
                      </div>

                      {/* Score breakdown */}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        {[
                          { label: t('scoreCategory'), val: m.score_category, max: 30 },
                          { label: t('scoreCountry'),  val: m.score_country, max: 20 },
                          { label: t('scoreMoq'),      val: m.score_moq, max: 20 },
                          { label: t('scoreLead'),     val: m.score_lead_time, max: 10 },
                          { label: t('scoreReliability'), val: m.score_reliability, max: 12 },
                          { label: t('scoreResponse'), val: m.score_response_rate, max: 8 },
                        ].map((s) => (
                          <span key={s.label} className="text-faint">
                            {s.label}: <span className={`font-medium ${s.val > 0 ? 'text-muted' : 'text-faint'}`}>{Math.round(s.val)}/{s.max}</span>
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
