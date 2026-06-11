import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getLogisticsSettings } from '@/app/actions/logistics'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { LogisticsForm } from '@/components/admin/logistics-form'
import { formatMAD } from '@/lib/utils'

export async function generateMetadata() {
  const t = await getTranslations('admin.logistics')
  return { title: t('metaTitle') }
}

export default async function AdminLogisticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.logistics')
  const tc = await getTranslations('admin.common')

  const settings = await getLogisticsSettings()

  const defaults = {
    id: 'default',
    casablanca_delivery_fee_mad: 25,
    default_delivery_fee_mad: 35,
    return_fee_mad: 10,
    api_config: {},
    updated_at: new Date().toISOString(),
    updated_by: null,
  }

  const current = settings ?? defaults

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('subtitle')}
          </p>
        </div>

        {/* Current values summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              {t('casablanca')}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatMAD(current.casablanca_delivery_fee_mad)}
            </p>
            <p className="mt-1 text-xs text-muted">{t('deliveryFee')}</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              {t('otherCities')}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatMAD(current.default_delivery_fee_mad)}
            </p>
            <p className="mt-1 text-xs text-muted">{t('deliveryFee')}</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              {t('returnLabel')}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {formatMAD(current.return_fee_mad)}
            </p>
            <p className="mt-1 text-xs text-muted">{t('returnFeeAllCities')}</p>
          </div>
        </div>

        {/* Commission formula reference */}
        <div className="rounded-xl border border-accent bg-accent-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg">
            {t('formulaTitle')}
          </p>
          <p className="mt-2 font-mono text-sm text-foreground">
            {t('formulaLine1')}
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{t('formulaLine2')}
          </p>
          <p className="mt-2 text-xs text-accent-fg">
            {t('formulaNote')}
          </p>
        </div>

        {/* Edit form */}
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-foreground">
            {t('editTitle')}
          </h2>
          <LogisticsForm settings={current} />
        </div>

        {/* Future API integration notice */}
        <div className="rounded-xl border border-dashed border-line bg-surface-2 px-5 py-4">
          <p className="text-xs font-medium text-muted">
            {t('apiNoticeTitle')}
          </p>
          <p className="mt-1 text-xs text-faint">
            {t.rich('apiNoticeBody', {
              code: (chunks) => <code className="rounded bg-surface px-1 text-muted">{chunks}</code>,
            })}
          </p>
        </div>
      </main>
    </div>
  )
}
