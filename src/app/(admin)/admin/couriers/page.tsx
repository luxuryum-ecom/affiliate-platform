import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { CourierCreateForm } from '@/components/admin/courier-create-form'
import { CourierStatusToggle } from '@/components/admin/courier-status-toggle'
import { listCouriers } from '@/app/actions/couriers'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.couriers')
  return { title: t('metaTitle') }
}

export default async function AdminCouriersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/admin/dashboard')

  const t = await getTranslations('admin.couriers')
  const tc = await getTranslations('admin.common')

  const { error, couriers } = await listCouriers()

  const activeCount = couriers.filter((c) => c.status === 'active').length
  const blockedCount = couriers.filter((c) => c.status === 'blocked').length
  const totalOutstanding = couriers.reduce((s, c) => s + c.totalBalanceMad, 0)
  const overCapCount = couriers.filter((c) => c.overCap).length

  function typeLabel(courierType: string) {
    return courierType === 'company' ? t('typeCompany') : t('typePersonal')
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar — identique au dashboard admin */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:flex items-center gap-2 text-line">|</span>
            <Link href="/admin/dashboard" className="hidden sm:block text-sm font-medium text-muted hover:text-foreground transition-colors">
              {tc('dashboard')}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <NotificationBell />
            <span className="text-sm text-muted hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/couriers/pickup"
              className="text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('pickupScanLink')}
            </Link>
            <Link
              href="/admin/couriers/reception"
              className="text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('receptionScanLink')}
            </Link>
            <Link
              href="/admin/couriers/inventory"
              className="text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('inventoryLink')}
            </Link>
            <Link
              href="/admin/guardian"
              className="text-xs px-3 py-1.5 bg-warning-soft text-warning-fg rounded-lg hover:opacity-90 transition-opacity"
            >
              🛡️ {t('guardianLink')}
            </Link>
            <a
              href="/admin/couriers/labels"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('printLabels')}
            </a>
          </div>
        </div>

        {error && (
          <p className="mb-6 text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('errorState', { message: error })}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('statActive')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{activeCount}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('statBlocked')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{blockedCount}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('statOutstanding')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(totalOutstanding)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${overCapCount > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('statOverCap')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${overCapCount > 0 ? 'text-warning-fg' : 'text-foreground'}`}>
              {overCapCount}
            </p>
          </div>
        </div>

        {/* Créer un livreur */}
        <CourierCreateForm />

        {/* Tableau des livreurs */}
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          {couriers.length === 0 ? (
            <p className="text-sm text-muted p-5">{t('emptyState')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="text-faint text-left border-b border-line bg-surface-2">
                    <th className="py-2.5 px-4 font-medium">{t('colName')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('colType')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('colStatus')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('colCashOwed')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('colProductDebt')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('colTotal')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('colCap')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {couriers.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-b border-line/60 last:border-0 ${c.overCap ? 'bg-danger-soft' : ''}`}
                    >
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        <Link href={`/admin/couriers/${c.id}`} className="hover:underline">
                          {c.name || t('unnamedCourier')}
                        </Link>
                        {c.companyName && <p className="text-faint text-[11px] mt-0.5">{c.companyName}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-muted">{typeLabel(c.courierType)}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.status === 'active' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
                          }`}
                        >
                          {c.status === 'active' ? t('statusActive') : t('statusBlocked')}
                        </span>
                        {c.overCap && (
                          <span className="block text-[11px] text-danger-fg font-medium mt-1">{t('overCapLabel')}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(c.cashOwedMad)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(c.productDebtMad)}</td>
                      <td
                        className={`py-2.5 px-4 text-right tabular-nums font-semibold ${
                          c.overCap ? 'text-danger-fg' : 'text-foreground'
                        }`}
                      >
                        {formatMAD(c.totalBalanceMad)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(c.balanceCapMad)}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/couriers/${c.id}`}
                            className="text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg hover:opacity-90 transition-opacity"
                          >
                            {t('viewDetail')}
                          </Link>
                          <CourierStatusToggle courierId={c.id} status={c.status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
