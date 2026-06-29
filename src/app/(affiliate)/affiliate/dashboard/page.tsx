import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { formatConversionRate, formatReturnRate } from '@/lib/order-analytics'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { signOut } from '@/app/actions/auth'
import type { Profile, Commission } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliateDashboard')
  return { title: t('metaTitle') }
}

function StatCard({
  label,
  value,
  sub,
  variant = 'default',
}: {
  label: string
  value: string
  sub?: string
  variant?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const bg = {
    default: 'bg-surface border-line',
    success: 'bg-success-soft border-success',
    warning: 'bg-warning-soft border-warning',
    muted:   'bg-surface-2 border-line',
  }[variant]

  const text = {
    default: 'text-foreground',
    success: 'text-success-fg',
    warning: 'text-warning-fg',
    muted:   'text-faint',
  }[variant]

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-muted leading-tight">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${text}`}>{value}</p>
      {sub && <p className="text-xs text-faint mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function AffiliateDashboardPage() {
  const supabase = await createClient()
  const t = await getTranslations('affiliateDashboard')
  const tc = await getTranslations('common')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const affiliateId = user!.id

  const [
    { data: profileData },
    { data: orderRows },
    { data: commissionRows },
    { count: clickCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', affiliateId).single() as unknown as Promise<{ data: Profile | null; error: unknown }>,
    supabase
      .from('orders')
      .select('status, commission_amount, affiliate_commission_mad_snapshot')
      .eq('affiliate_id', affiliateId) as unknown as Promise<{ data: { status: string; commission_amount: number; affiliate_commission_mad_snapshot: number | null }[] | null; error: unknown }>,
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', affiliateId) as unknown as Promise<{ data: Commission[] | null; error: unknown }>,
    supabase
      .from('affiliate_clicks')
      .select('*', { count: 'exact', head: true })
      .eq('affiliate_id', affiliateId),
  ])

  const profile = profileData
  const orders = orderRows ?? []
  const commissions = commissionRows ?? []
  const clicks = clickCount ?? 0

  const count = (s: string) => orders.filter((o) => o.status === s).length
  const delivered = count('delivered')
  const returned = count('returned')
  const totalOrders = orders.length

  // Reversed commissions (returned orders) are excluded from all financial totals.
  const activeCommissions = commissions.filter((c) => !c.reversed)
  const sumActive = (filter: (c: Commission) => boolean) =>
    activeCommissions.filter(filter).reduce((acc, c) => acc + Number(c.amount), 0)

  const earnedCommissions = sumActive(() => true)
  const paidCommissions   = sumActive((c) => c.status === 'paid')
  const pendingCommissions  = sumActive((c) => c.status === 'pending')
  const approvedCommissions = sumActive((c) => c.status === 'approved')
  const pendingBalance = pendingCommissions + approvedCommissions

  const conversionRate = formatConversionRate(clicks, totalOrders)
  const returnRate     = formatReturnRate(delivered, returned)

  return (
    <div className="bg-bg text-foreground min-h-screen">
      <header className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <span className="hidden sm:block text-sm font-medium text-muted">{t('spaceLabel')}</span>
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

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('greeting', { name: profile?.full_name ?? '' })}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* Traffic & conversion */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            {t('sectionTraffic')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatCard label={t('statClicks')} value={String(clicks)} />
            <StatCard label={t('statOrders')} value={String(totalOrders)} />
            <StatCard
              label={t('statConversion')}
              value={conversionRate}
              sub={clicks > 0 ? t('conversionSub', { orders: totalOrders, clicks }) : t('noClicks')}
              variant={clicks > 0 && totalOrders > 0 ? 'success' : 'muted'}
            />
            <StatCard
              label={t('statReturnRate')}
              value={returnRate}
              sub={t('returnSub', { returned, total: delivered + returned })}
              variant={returned > 0 ? 'warning' : 'muted'}
            />
          </div>
        </section>

        {/* Order breakdown */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            {t('sectionOrders')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatCard label={t('orderPending')}   value={String(count('pending_confirmation'))} variant="warning" />
            <StatCard label={t('orderConfirmed')} value={String(count('confirmed'))} />
            <StatCard label={t('orderShipped')}   value={String(count('shipped'))} />
            <StatCard label={t('orderDelivered')} value={String(delivered)} variant={delivered > 0 ? 'success' : 'default'} />
            <StatCard label={t('orderReturned')}  value={String(returned)}  variant={returned > 0 ? 'warning' : 'muted'} />
          </div>
        </section>

        {/* Commissions */}
        <section>
          <p className="text-xs font-semibold text-gold-500 uppercase tracking-wide mb-3">
            {t('sectionCommissions')}
          </p>

          <div className={`rounded-xl border p-5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            pendingBalance > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'
          }`}>
            <div>
              <p className="text-xs text-muted">{t('pendingBalance')}</p>
              <p className={`text-3xl font-bold tabular-nums mt-1 ${
                pendingBalance > 0 ? 'text-warning-fg' : 'text-faint'
              }`}>
                {formatMAD(pendingBalance)}
              </p>
              <p className="text-xs text-faint mt-1">
                {t('earnedOnlyDelivered')}
              </p>
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap self-start sm:self-center"
            >
              {t('viewOrders')}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label={t('commEarned')}
              value={formatMAD(earnedCommissions)}
              sub={t('commEarnedSub')}
            />
            <StatCard
              label={t('commPending')}
              value={formatMAD(pendingCommissions)}
              sub={t('commPendingSub')}
              variant={pendingCommissions > 0 ? 'warning' : 'muted'}
            />
            <StatCard
              label={t('commPaid')}
              value={formatMAD(paidCommissions)}
              sub={t('commPaidSub')}
              variant={paidCommissions > 0 ? 'success' : 'muted'}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardCatalogTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('cardCatalogDesc')}</p>
            </div>
            <Link
              href="/affiliate/products"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {t('cardCatalogCta')}
            </Link>
          </div>

          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardOrdersTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('cardOrdersDesc')}</p>
            </div>
            <Link
              href="/affiliate/orders"
              className="text-xs px-4 py-2 border border-line text-foreground rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              {t('viewOrders')}
            </Link>
          </div>

          <div className="bg-surface rounded-xl border border-line p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardCommTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('cardCommDesc')}</p>
            </div>
            <Link
              href="/affiliate/commissions"
              className="text-xs px-4 py-2 border border-line text-foreground rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              {t('cardCommCta')}
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
