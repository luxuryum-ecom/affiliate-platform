import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getCities } from '@/app/actions/cities'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { formatMAD } from '@/lib/utils'
import { CityRowActions, AddCityForm } from '@/components/admin/city-row-actions'
import type { City } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.cities')
  return { title: t('metaTitle') }
}

export default async function AdminCitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.cities')
  const tc = await getTranslations('admin.common')

  const cities = await getCities()

  const active   = cities.filter((c) => c.is_active)
  const inactive = cities.filter((c) => !c.is_active)

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/logistics"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">
            {t('subtitle')}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statActive')}</p>
            <p className="mt-2 text-3xl font-bold text-foreground">{active.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statMinFee')}</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {active.length > 0
                ? formatMAD(Math.min(...active.map((c) => Number(c.delivery_fee_mad))))
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('statMaxFee')}</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {active.length > 0
                ? formatMAD(Math.max(...active.map((c) => Number(c.delivery_fee_mad))))
                : '—'}
            </p>
          </div>
        </div>

        {/* Add city */}
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t('addTitle')}</h2>
          <AddCityForm />
        </div>

        {/* City table */}
        <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              {t('configuredTitle')} ({cities.length})
            </h2>
          </div>

          {cities.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-faint">
              {t('empty')}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colCity')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colFee')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted hidden sm:table-cell">{t('colCourierCode')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{t('colStatus')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cities.map((city) => (
                  <CityRow key={city.id} city={city} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Inactive cities section */}
        {inactive.length > 0 && (
          <p className="text-xs text-faint text-center">
            {t('inactiveNote', { count: inactive.length })}
          </p>
        )}

        {/* Courier API notice */}
        <div className="rounded-xl border border-dashed border-line bg-surface-2 px-5 py-4">
          <p className="text-xs font-medium text-muted">{t('apiNoticeTitle')}</p>
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

// ─── Table row ────────────────────────────────────────────────────────────────

async function CityRow({ city }: { city: City }) {
  const tc = await getTranslations('admin.common')
  return (
    <tr className={city.is_active ? '' : 'bg-surface-2 opacity-60'}>
      <td className="px-6 py-3 font-medium text-foreground">{city.name}</td>
      <td className="px-6 py-3 tabular-nums text-muted">
        {formatMAD(Number(city.delivery_fee_mad))}
      </td>
      <td className="px-6 py-3 hidden sm:table-cell">
        {city.courier_code ? (
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
            {city.courier_code}
          </code>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-6 py-3">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
            city.is_active
              ? 'bg-success-soft text-success-fg border-success'
              : 'bg-surface-2 text-faint border-line'
          }`}
        >
          {city.is_active ? tc('active') : tc('inactive')}
        </span>
      </td>
      <td className="px-6 py-3 text-right">
        <CityRowActions city={city} />
      </td>
    </tr>
  )
}
