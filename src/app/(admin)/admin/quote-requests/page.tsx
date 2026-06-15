import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTranslations, getLocale } from 'next-intl/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { QuoteRequestWithDetails, QuoteRequestStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.quoteRequests')
  return { title: t('metaTitle') }
}

type StatusRow = { status: string }

// CSS only — labels via t()
const STATUS_BADGE_CLS: Record<QuoteRequestStatus, string> = {
  new:                 'bg-surface-2 text-muted border border-line',
  studying:            'bg-warning-subtle text-warning border border-warning-line',
  quoted:              'bg-surface-2 text-foreground border border-line',
  quote_prepared:      'bg-warning-subtle text-warning-dark border border-warning-line',
  accepted_by_client:  'bg-success-subtle text-success border border-success-line',
  rejected_by_client:  'bg-danger-subtle text-danger border border-danger-line',
  negotiating:         'bg-warning-subtle text-warning border border-warning-line',
  approved:            'bg-success-subtle text-success border border-success-line',
  rejected:            'bg-danger-subtle text-danger border border-danger-line',
  converted_to_order:  'bg-surface-2 text-faint border border-line',
}

export default async function AdminQuoteRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.quoteRequests')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const isRtl = locale === 'ar'

  const [{ data }, { data: statusData }] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('*, buyer:profiles!buyer_id(id,full_name,phone,company_name), product:products!product_id(id,name,origin_country,availability_type)')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('quote_requests')
      .select('status') as unknown as Promise<{ data: StatusRow[] | null; error: unknown }>,
  ])

  const requests = (data ?? []) as unknown as QuoteRequestWithDetails[]

  const allStatuses = (statusData ?? []) as StatusRow[]
  const preparedCount = allStatuses.filter((r) => r.status === 'quote_prepared').length
  const acceptedCount = allStatuses.filter((r) => r.status === 'accepted_by_client').length
  const rejectedCount = allStatuses.filter((r) => r.status === 'rejected_by_client').length
  const decidedCount  = acceptedCount + rejectedCount
  const acceptanceRate = decidedCount > 0 ? Math.round((acceptedCount / decidedCount) * 100) : null

  function statusLabel(status: QuoteRequestStatus): string {
    const map: Record<QuoteRequestStatus, string> = {
      new:                t('statusNew'),
      studying:           t('statusStudying'),
      quoted:             t('statusQuoted'),
      quote_prepared:     t('statusQuotePrepared'),
      accepted_by_client: t('statusAcceptedByClient'),
      rejected_by_client: t('statusRejectedByClient'),
      negotiating:        t('statusNegotiating'),
      approved:           t('statusApproved'),
      rejected:           t('statusRejected'),
      converted_to_order: t('statusConvertedToOrder'),
    }
    return map[status] ?? status
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={isRtl ? `${t('backLabel')} →` : `← ${t('backLabel')}`}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-sm font-semibold text-foreground">
            {t('pageTitle')}
          </h1>
          <span className="text-xs px-2 py-0.5 bg-surface-2 text-muted rounded-full border border-line">
            {requests.length}
          </span>
        </div>
        <p className="text-xs text-muted mb-4">
          {t('subtitle')}{' '}
          <Link
            href="/admin/supplier-quotes"
            className="underline underline-offset-2 text-gold-500 hover:text-gold-600 transition-colors"
          >
            {isRtl ? t('supplierQuotesLinkAr') : t('supplierQuotesLink')}
          </Link>
        </p>

        {/* Analytics strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-warning-subtle border border-warning-line rounded-xl p-4">
            <p className="text-xs text-warning-dark">{t('statPrepared')}</p>
            <p className="mt-1 text-2xl font-bold text-warning-dark tabular-nums">{preparedCount}</p>
          </div>
          <div className="bg-success-subtle border border-success-line rounded-xl p-4">
            <p className="text-xs text-success-dark">{t('statAccepted')}</p>
            <p className="mt-1 text-2xl font-bold text-success-dark tabular-nums">{acceptedCount}</p>
          </div>
          <div className="bg-danger-subtle border border-danger-line rounded-xl p-4">
            <p className="text-xs text-danger-dark">{t('statRejected')}</p>
            <p className="mt-1 text-2xl font-bold text-danger-dark tabular-nums">{rejectedCount}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-4">
            <p className="text-xs text-muted">{t('statAcceptanceRate')}</p>
            <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
              {acceptanceRate !== null ? `${acceptanceRate}%` : '—'}
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('empty')}</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {requests.map((req) => {
              const cls = STATUS_BADGE_CLS[req.status] ?? STATUS_BADGE_CLS.new
              return (
                <div key={req.id} className="flex items-start gap-3 p-4 hover:bg-surface-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-faint">
                        #{req.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
                        {statusLabel(req.status)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {req.buyer?.company_name ?? req.buyer?.full_name}
                    </p>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {req.product?.name} · {t('unitsCount', { qty: req.quantity_requested })} · {req.destination_country}
                      {req.destination_city ? `, ${req.destination_city}` : ''}
                    </p>
                    <p className="text-xs text-faint mt-0.5">
                      {new Date(req.created_at).toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <Link
                    href={`/admin/quote-requests/${req.id}`}
                    className="shrink-0 text-xs text-gold-500 hover:text-gold-600 transition-colors"
                  >
                    {isRtl ? tc('details').replace('→', '←') : tc('details')}
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
