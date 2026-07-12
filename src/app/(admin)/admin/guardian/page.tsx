import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { GuardianAlertsPanel, type GuardianAlertItem } from '@/components/admin/guardian/guardian-alerts-panel'
import { GuardianPendingCashPanel, type PendingCashItem } from '@/components/admin/guardian/guardian-pending-cash-panel'
import { GuardianCourierRiskPanel, type CourierRiskItem } from '@/components/admin/guardian/guardian-courier-risk-panel'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.guardian')
  return { title: t('metaTitle') }
}

interface AlertRow {
  id: string
  alert_type: string
  severity: 'info' | 'warning' | 'critical'
  status: string
  courier_id: string | null
  courier_name: string | null
  courier_type: string | null
  order_id: string | null
  staff_id: string | null
  related_courier_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}
interface PendingCashRow {
  id: string
  courier_id: string
  courier_name: string
  courier_type: string
  declared_amount_mad: number
  method: 'cash' | 'virement'
  declared_at: string
  declared_by: string | null
  orders_count: number
}
interface OpenReturnRow {
  order_id: string
  courier_id: string
  courier_name: string
  declared_at: string
  age_hours: number
}
interface CourierRiskRow {
  courier_id: string
  name: string
  courier_type: string
  status: string
  total_balance_mad: number
  balance_cap_mad: number
  over_cap: boolean
  open_alerts: number
}
interface PairRow {
  id: string
  courier_id: string
  staff_id: string
  event_count: number
  window_days: number
  last_event_at: string | null
}

/**
 * Cockpit desktop de l'Agent Gardien anti-collusion (module Livreurs, Lot G).
 * Lecture pure sur les vues `v_guardian_*` (RLS admin-only déjà appliquée en
 * base, security_invoker) + `courier_staff_pairs`. Toute écriture passe par
 * les server actions de `src/app/actions/guardian.ts` (jamais ici).
 */
export default async function AdminGuardianPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()) as { data: Profile | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/admin/dashboard')

  const t = await getTranslations('admin.guardian')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const [alertsRes, pendingCashRes, openReturnsRes, riskRes, pairsRes] = await Promise.all([
    supabase.from('v_guardian_alerts').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(200),
    supabase.from('v_guardian_pending_cash').select('*').order('declared_at', { ascending: false }),
    supabase.from('v_guardian_open_returns').select('*').order('age_hours', { ascending: false }),
    supabase.from('v_guardian_courier_risk').select('*'),
    supabase.from('courier_staff_pairs').select('*').eq('flagged', true).order('event_count', { ascending: false }),
  ])

  const alertRows = (alertsRes.data ?? []) as AlertRow[]
  const pendingCashRows = (pendingCashRes.data ?? []) as PendingCashRow[]
  const openReturnRows = (openReturnsRes.data ?? []) as OpenReturnRow[]
  const riskRows = (riskRes.data ?? []) as CourierRiskRow[]
  const pairRows = (pairsRes.data ?? []) as PairRow[]
  const pageError = alertsRes.error ?? pendingCashRes.error ?? openReturnsRes.error ?? riskRes.error ?? pairsRes.error

  // Noms pour les paires suspectes — 2 requêtes légères, seulement si nécessaire.
  const pairCourierIds = Array.from(new Set(pairRows.map((p) => p.courier_id)))
  const pairStaffIds = Array.from(new Set(pairRows.map((p) => p.staff_id)))
  const [courierNamesRes, staffNamesRes] = await Promise.all([
    pairCourierIds.length > 0
      ? supabase.from('couriers').select('id, name').in('id', pairCourierIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    pairStaffIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', pairStaffIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])
  const courierNameById = new Map((courierNamesRes.data ?? []).map((c) => [c.id, c.name]))
  const staffNameById = new Map((staffNamesRes.data ?? []).map((s) => [s.id, s.full_name]))

  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const sortedAlerts = [...alertRows].sort((a, b) => {
    const r = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
    if (r !== 0) return r
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const alertItems: GuardianAlertItem[] = sortedAlerts.map((a) => ({
    id: a.id,
    alertType: a.alert_type,
    severity: a.severity,
    courierName: a.courier_name,
    orderId: a.order_id,
    createdAt: a.created_at,
    details: a.details ?? {},
  }))

  const pendingCashItems: PendingCashItem[] = pendingCashRows.map((c) => ({
    id: c.id,
    courierName: c.courier_name,
    courierType: c.courier_type,
    declaredAmountMad: Number(c.declared_amount_mad),
    method: c.method,
    declaredAt: c.declared_at,
    ordersCount: c.orders_count,
  }))

  const riskItems: CourierRiskItem[] = [...riskRows]
    .sort((a, b) => Number(b.over_cap) - Number(a.over_cap) || b.open_alerts - a.open_alerts)
    .map((r) => ({
      courierId: r.courier_id,
      name: r.name,
      courierType: r.courier_type,
      status: r.status,
      totalBalanceMad: Number(r.total_balance_mad),
      balanceCapMad: Number(r.balance_cap_mad),
      overCap: r.over_cap,
      openAlerts: r.open_alerts,
    }))

  const criticalCount = alertItems.filter((a) => a.severity === 'critical').length
  const warningCount = alertItems.filter((a) => a.severity === 'warning').length
  const infoCount = alertItems.filter((a) => a.severity === 'info').length
  const overdueReturnsCount = openReturnRows.filter((r) => r.age_hours > 48).length
  const blockedCouriersCount = riskItems.filter((r) => r.status === 'blocked').length

  const shortRef = (id: string) => id.slice(0, 8).toUpperCase()
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar — identique aux autres cockpits admin */}
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
              <button type="submit" className="text-sm text-muted hover:text-foreground transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">🛡️ {t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {pageError && (
          <p className="mb-6 text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('errorState', { message: pageError.message ?? '' })}
          </p>
        )}

        {/* Bandeau synthèse */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <div className={`rounded-xl border p-4 ${criticalCount > 0 ? 'bg-danger-soft border-danger' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiCritical')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${criticalCount > 0 ? 'text-danger-fg' : 'text-foreground'}`}>{criticalCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${warningCount > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiWarning')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${warningCount > 0 ? 'text-warning-fg' : 'text-foreground'}`}>{warningCount}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('kpiInfo')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{infoCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${overdueReturnsCount > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiOverdueReturns')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${overdueReturnsCount > 0 ? 'text-warning-fg' : 'text-foreground'}`}>{overdueReturnsCount}</p>
          </div>
          <div className={`rounded-xl border p-4 ${pendingCashItems.length > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiPendingCash')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${pendingCashItems.length > 0 ? 'text-warning-fg' : 'text-foreground'}`}>{pendingCashItems.length}</p>
          </div>
          <div className={`rounded-xl border p-4 ${blockedCouriersCount > 0 ? 'bg-danger-soft border-danger' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiBlockedCouriers')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${blockedCouriersCount > 0 ? 'text-danger-fg' : 'text-foreground'}`}>{blockedCouriersCount}</p>
          </div>
        </div>

        {/* Alertes actives + détections */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t('alertsSectionTitle')}</h2>
          <GuardianAlertsPanel alerts={alertItems} />
        </section>

        {/* Versements en attente de validation */}
        <section className="mb-8">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{t('pendingCashSectionTitle')}</h2>
          <p className="text-xs text-faint mb-3">{t('pendingCashNote')}</p>
          <GuardianPendingCashPanel items={pendingCashItems} />
        </section>

        {/* Retours en attente */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t('openReturnsSectionTitle')}</h2>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {openReturnRows.length === 0 ? (
              <p className="text-sm text-muted p-5">{t('openReturnsEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead>
                    <tr className="text-faint text-left border-b border-line bg-surface-2">
                      <th className="py-2.5 px-4 font-medium">{t('colOrderRef')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colCourier')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colDeclaredAt')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colAgeHours')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openReturnRows.map((r) => (
                      <tr key={r.order_id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 px-4 font-mono text-foreground">{shortRef(r.order_id)}</td>
                        <td className="py-2.5 px-4 text-foreground">{r.courier_name}</td>
                        <td className="py-2.5 px-4 text-muted">{formatDate(r.declared_at)}</td>
                        <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${r.age_hours > 48 ? 'text-danger-fg' : 'text-muted'}`}>
                          {Math.round(r.age_hours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Livreurs à risque */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t('riskSectionTitle')}</h2>
          <GuardianCourierRiskPanel items={riskItems} />
        </section>

        {/* Paires suspectes */}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{t('pairsSectionTitle')}</h2>
          <p className="text-xs text-faint mb-3">{t('pairsNote')}</p>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {pairRows.length === 0 ? (
              <p className="text-sm text-muted p-5">{t('pairsEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="text-faint text-left border-b border-line bg-surface-2">
                      <th className="py-2.5 px-4 font-medium">{t('colCourier')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colStaff')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colEventCount')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colWindowDays')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairRows.map((p) => (
                      <tr key={p.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 px-4 font-medium text-foreground">{courierNameById.get(p.courier_id) ?? shortRef(p.courier_id)}</td>
                        <td className="py-2.5 px-4 text-foreground">{staffNameById.get(p.staff_id) ?? shortRef(p.staff_id)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-medium text-warning-fg">{p.event_count}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-muted">{p.window_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
