import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
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
  new:            'bg-blue-100 text-blue-700',
  notified:       'bg-indigo-100 text-indigo-700',
  offer_received: 'bg-amber-100 text-amber-700',
  declined:       'bg-gray-100 text-gray-500',
  clarification:  'bg-purple-100 text-purple-700',
  selected:       'bg-green-100 text-green-700',
  expired:        'bg-red-100 text-red-500',
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← {tc('dashboard')}</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}><button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">{tc('signOut')}</button></form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{t('statActive')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{matches.length}</p>
          </div>
          <div className={`rounded-xl border p-4 ${newCount > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500">{t('statNew')}</p>
            <p className={`text-2xl font-bold mt-1 ${newCount > 0 ? 'text-indigo-700' : 'text-gray-900'}`}>{newCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${urgentCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className="text-xs text-gray-500">{t('statUrgent', { days: URGENCY_DAYS })}</p>
            <p className={`text-2xl font-bold mt-1 ${urgentCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{urgentCount}</p>
          </div>
        </div>

        {/* Matching profile */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{t('matchingTitle')}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{t('matchingSubtitle')}</p>
            </div>
            {matchingProfile && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">{t('matchingActiveBadge')}</span>
            )}
          </div>
          <div className="p-6">
            <MatchingProfileForm existing={matchingProfile} />
          </div>
        </div>

        {/* Opportunities */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            {t('opportunitiesTitle', { count: matches.length })}
          </h2>

          {matches.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400 mb-2">{t('emptyTitle')}</p>
              <p className="text-xs text-gray-300">{t('emptySubtitle')}</p>
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
                  <div key={m.id} className={`bg-white rounded-xl border overflow-hidden ${isUrgent ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">
                              {sr?.product_name ?? t('labelProduct')}
                            </p>
                            {isUrgent && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">🔴 {t('urgentBadge', { days: daysLeft })}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1.5">
                            {sr?.category && (
                              <span className="text-xs text-gray-500">{t('labelCategory', { value: sr.category })}</span>
                            )}
                            {sr?.quantity != null && (
                              <span className="text-xs text-gray-500">{t('labelQty', { value: sr.quantity })}</span>
                            )}
                            {sr?.target_country && (
                              <span className="text-xs text-gray-500">{t('labelDestination', { value: sr.target_country })}</span>
                            )}
                          </div>
                          {sr?.notes && (
                            <p className="text-xs text-gray-600 mt-1.5 italic">&ldquo;{sr.notes}&rdquo;</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {t('receivedOn', { date: new Date(m.created_at).toLocaleDateString(locale) })}
                            {sr?.delivery_deadline && t('deadline', { date: new Date(sr.delivery_deadline).toLocaleDateString(locale) })}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badgeCls}`}>{badgeLabel}</span>
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
                          { label: t('scoreCategory'), val: m.score_category, max: 30 },
                          { label: t('scoreCountry'),  val: m.score_country, max: 20 },
                          { label: t('scoreMoq'),      val: m.score_moq, max: 20 },
                          { label: t('scoreLead'),     val: m.score_lead_time, max: 10 },
                          { label: t('scoreReliability'), val: m.score_reliability, max: 12 },
                          { label: t('scoreResponse'), val: m.score_response_rate, max: 8 },
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
