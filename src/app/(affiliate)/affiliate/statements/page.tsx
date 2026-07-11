import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import { getMyPayoutStatements } from '@/app/actions/statements'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.statements')
  return { title: t('metaTitle') }
}

export default async function AffiliateStatementsPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliate.statements')
  const tCommon = await getTranslations('affiliate.common')
  const locale = await getLocale()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const affiliateId = user!.id

  const [profileRes, statements] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', affiliateId).single() as unknown as Promise<{
      data: Pick<Profile, 'full_name'> | null
      error: unknown
    }>,
    getMyPayoutStatements(),
  ])

  const profile = profileRes.data

  const METHOD_LABEL: Record<string, string> = {
    virement: t('methodVirement'),
    cash: t('methodCash'),
    cheque: t('methodCheque'),
    autre: t('methodAutre'),
  }

  function methodLabel(method: string | null) {
    if (!method) return t('methodUnknown')
    return METHOD_LABEL[method] ?? method
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  function fmtPeriod(start: string | null, end: string | null) {
    if (!start && !end) return '—'
    return `${fmtDate(start)} – ${fmtDate(end)}`
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/affiliate/commissions"
        backLabel={t('backLabel')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <p className="text-sm text-muted">{t('intro')}</p>

        {statements.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-10 text-center">
            <p className="text-sm text-faint">{t('emptyState')}</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {statements.map((s) => (
              <div key={s.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {fmtPeriod(s.periodStart, s.periodEnd)}
                  </p>
                  <p className="text-xs text-faint mt-0.5">
                    {t('colMethod')} : {methodLabel(s.paymentMethod)}
                    {s.reference && <> · {t('colReference')} : {s.reference}</>}
                  </p>
                  <p className="text-xs text-faint mt-0.5">
                    {t('colDate')} {fmtDate(s.generatedAt)}
                  </p>
                </div>
                <div className="shrink-0 text-end space-y-2">
                  {/* ARGENT: formatMAD inchangé */}
                  <p className="text-base font-bold text-foreground tabular-nums">
                    {formatMAD(s.totalAmountMad)}
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/api/statements/payout/${s.payoutId}?lang=fr`}
                      target="_blank"
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t('downloadFr')}
                    </Link>
                    <Link
                      href={`/api/statements/payout/${s.payoutId}?lang=ar`}
                      target="_blank"
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t('downloadAr')}
                    </Link>
                    <Link
                      href={`/api/statements/payout/${s.payoutId}?lang=en`}
                      target="_blank"
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {t('downloadEn')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
