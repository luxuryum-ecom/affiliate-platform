import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { RemittanceReconcileForm, type RemittanceOrderRow } from '@/components/admin/remittance-reconcile-form'
import { listPendingRemittances, listRemittanceHistory } from '@/app/actions/remittances'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.remittances')
  return { title: t('metaTitle') }
}

export default async function AdminRemittancesPage() {
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

  const t = await getTranslations('admin.remittances')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const [pendingRes, historyRes] = await Promise.all([
    listPendingRemittances(),
    listRemittanceHistory(),
  ])

  const orders = pendingRes.orders
  const groups = pendingRes.groups
  const history = historyRes.history
  const pageError = pendingRes.error ?? historyRes.error

  const totalExpected = orders.reduce((s, o) => s + o.expectedAmountMad, 0)

  function courierLabel(code: string) {
    return code === 'inconnu' ? t('unknownCourier') : code
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function shortRef(reference: string | null, orderId: string) {
    return (reference ?? orderId).slice(0, 8).toUpperCase()
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
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {pageError && (
          <p className="mb-6 text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('errorState', { message: pageError })}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <div className={`rounded-xl border p-4 ${orders.length > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('statPendingOrders')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${orders.length > 0 ? 'text-warning-fg' : 'text-foreground'}`}>
              {orders.length}
            </p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('statTotalExpected')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(totalExpected)}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('statCouriers')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{groups.length}</p>
          </div>
        </div>

        {/* Groupes par livreur */}
        {groups.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-5 mb-8">
            <p className="text-sm text-muted">{t('emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {groups.map((g) => {
              const groupOrders: RemittanceOrderRow[] = orders
                .filter((o) => (o.courierCode ?? 'inconnu') === g.courierCode)
                .map((o) => ({
                  orderId: o.orderId,
                  reference: shortRef(o.reference, o.orderId),
                  expectedAmountMad: o.expectedAmountMad,
                  city: o.city ?? '—',
                  deliveredAtLabel: formatDate(o.deliveredAt),
                  affiliateCommissionMad: o.affiliateCommissionMad,
                  affiliateName: o.affiliateName ?? '',
                }))

              return (
                <div key={g.courierCode} className="bg-surface rounded-xl border border-line p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                    <h2 className="text-sm font-semibold text-foreground">
                      {g.courierCode === 'inconnu' ? t('unknownCourier') : t('groupTitle', { code: g.courierCode })}
                    </h2>
                    <p className="text-xs text-muted">
                      {t('groupOrdersCount', { count: g.ordersCount })} · {t('groupTotalExpected', { amount: formatMAD(g.totalExpectedMad) })}
                    </p>
                  </div>
                  <RemittanceReconcileForm
                    courierCode={g.courierCode}
                    courierDisplayName={courierLabel(g.courierCode)}
                    orders={groupOrders}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Historique */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t('historyTitle')}</h2>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {history.length === 0 ? (
              <p className="text-sm text-muted p-5">{t('historyEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="text-faint text-left border-b border-line bg-surface-2">
                      <th className="py-2.5 px-4 font-medium">{t('historyColCourier')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('historyColExpected')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('historyColReceived')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('historyColGap')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('historyColOrders')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('historyColStatus')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('historyColDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const gap = h.expectedAmountMad - h.receivedAmountMad
                      return (
                        <tr key={h.id} className="border-b border-line/60 last:border-0">
                          <td className="py-2.5 px-4 font-medium text-foreground">{h.courierName}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(h.expectedAmountMad)}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-foreground">{formatMAD(h.receivedAmountMad)}</td>
                          <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${gap > 0 ? 'text-warning-fg' : 'text-foreground'}`}>
                            {formatMAD(gap)}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-muted">{h.ordersCount}</td>
                          <td className="py-2.5 px-4">
                            <span className="text-xs px-2 py-0.5 bg-success-soft text-success-fg rounded-full">
                              {h.status === 'reconciled' ? t('historyStatusReconciled') : h.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-muted tabular-nums">
                            {formatDate(h.reconciledAt ?? h.createdAt)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
