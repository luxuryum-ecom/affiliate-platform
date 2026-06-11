import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getTariffs } from '@/app/actions/tariffs'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { AddTariffForm, TariffRowActions } from '@/components/admin/tariff-row-actions'
import type { ImportTariff, TariffCountry } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.importTariffs')
  return { title: t('metaTitle') }
}

const COUNTRIES: TariffCountry[] = ['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre']

export default async function AdminImportTariffsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.importTariffs')
  const tc = await getTranslations('admin.common')

  const tariffs = await getTariffs()
  const active = tariffs.filter((it) => it.active)
  const inactiveCount = tariffs.filter((it) => !it.active).length

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t.rich('subtitle', { strong: (c) => <strong>{c}</strong> })}
          </p>
        </div>

        {/* Clarification banner */}
        <div className="rounded-xl border border-warning bg-warning-soft px-5 py-4">
          <p className="text-xs font-semibold text-warning-fg mb-1">{t('scopeTitle')}</p>
          <p className="text-xs text-warning-fg leading-relaxed">
            {t.rich('scopeBody', { strong: (c) => <strong>{c}</strong> })}
          </p>
        </div>

        {/* Summary cards — one per country */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {COUNTRIES.map((country) => {
            const countryTariffs = active.filter((it) => it.country === country)
            return (
              <div key={country} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                <p className="text-xs font-semibold text-muted mb-2">{t(`country.${country}`)}</p>
                {countryTariffs.length === 0 ? (
                  <p className="text-xs text-faint italic">—</p>
                ) : (
                  <div className="space-y-1">
                    {countryTariffs.map((it) => (
                      <div key={it.id}>
                        <p className="text-xs text-faint leading-none">{t(`shippingMode.${it.shipping_mode}`)}</p>
                        <p className="text-sm font-bold text-foreground tabular-nums">
                          {Number(it.transport_customs_price_mad).toFixed(0)}&nbsp;MAD
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add form */}
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-foreground">{t('addTitle')}</h2>
          <p className="text-xs text-faint mb-4">
            {t('addSubtitle')}
          </p>
          <AddTariffForm />
        </div>

        {/* Tariffs table */}
        <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-line px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t('configuredTitle')} ({tariffs.length})
            </h2>
            {inactiveCount > 0 && (
              <span className="text-xs text-faint">
                {t('deactivatedCount', { count: inactiveCount })}
              </span>
            )}
          </div>

          {tariffs.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-faint">
              {t('empty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colCountry')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colMode')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colFee')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted hidden md:table-cell">{t('colDelay')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted hidden lg:table-cell">{t('colNotes')}</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colStatus')}</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tariffs.map((tariff) => (
                    <TariffTableRow key={tariff.id} tariff={tariff} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Usage instructions */}
        <div className="rounded-xl border border-dashed border-accent bg-accent-soft px-5 py-4">
          <p className="text-xs font-semibold text-accent-fg mb-1">
            {t('usageTitle')}
          </p>
          <p className="text-xs text-accent-fg leading-relaxed">
            {t.rich('usageBody', { strong: (c) => <strong>{c}</strong> })}
          </p>
        </div>
      </main>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

async function TariffTableRow({ tariff }: { tariff: ImportTariff }) {
  const t  = await getTranslations('admin.importTariffs')
  const tc = await getTranslations('admin.common')
  const unitLabel = tariff.unit === 'cbm' ? 'CBM' : 'kg'

  return (
    <tr className={tariff.active ? '' : 'bg-surface-2 opacity-60'}>
      <td className="px-5 py-3 font-medium text-foreground">{t(`country.${tariff.country}`)}</td>
      <td className="px-5 py-3 text-muted text-xs">
        {t(`shippingMode.${tariff.shipping_mode}`)}
      </td>
      <td className="px-5 py-3 tabular-nums text-foreground font-medium">
        {Number(tariff.transport_customs_price_mad).toFixed(2)}&nbsp;MAD
        <span className="ml-1 text-faint font-normal text-xs">/ {unitLabel}</span>
      </td>
      <td className="px-5 py-3 hidden md:table-cell text-muted">
        {tariff.delivery_days != null ? t('delayDays', { days: tariff.delivery_days }) : <span className="text-faint">—</span>}
      </td>
      <td className="px-5 py-3 hidden lg:table-cell text-muted text-xs max-w-[200px] truncate">
        {tariff.notes ?? <span className="text-faint">—</span>}
      </td>
      <td className="px-5 py-3">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
            tariff.active ? 'bg-success-soft text-success-fg border-success' : 'bg-surface-2 text-faint border-line'
          }`}
        >
          {tariff.active ? tc('active') : tc('inactive')}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <TariffRowActions tariff={tariff} />
      </td>
    </tr>
  )
}
