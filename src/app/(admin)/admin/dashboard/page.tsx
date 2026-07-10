import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.dashboard')
  return { title: t('metaTitle') }
}

export default async function AdminDashboardPage() {
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

  const isAdmin = profile?.role === 'admin'

  const t  = await getTranslations('admin.dashboard')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const isRtl = locale === 'ar'
  const arrow = isRtl ? '←' : '→'

  const roleLabel =
    profile?.role === 'admin' ? t('roleAdmin')
    : profile?.role === 'agent' ? t('roleAgent')
    : (profile?.role ?? '')

  // Counts — admin sees all via RLS; agent sees only their scope
  const [
    { count: pendingUsers },
    { count: approvedAffiliates },
    { count: approvedWholesalers },
    { count: totalOrders },
    { count: todayOrders },
    { count: pendingWholesaleOrders },
    { count: newQuoteRequests },
    pendingCommissionsRes,
    { count: pendingSupplierProducts },
    { count: pendingSourcingRequests },
    { count: pendingMarketplaceRFQs },
    { count: pendingSampleRequests },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'affiliate')
      .eq('status', 'approved'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'wholesaler')
      .eq('status', 'approved'),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
    supabase
      .from('wholesale_orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed', 'sourcing']),
    supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['new', 'studying', 'quoted', 'negotiating']),
    supabase
      .from('commissions')
      .select('amount')
      .in('status', ['pending', 'approved']),
    supabase
      .from('supplier_products')
      .select('*', { count: 'exact', head: true })
      .eq('approval_status', 'pending_review'),
    supabase
      .from('sourcing_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('supplier_quote_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['new', 'studying']),
    supabase
      .from('sample_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const pendingCommissionRows = (pendingCommissionsRes.data ?? []) as { amount: number }[]
  const pendingCommissionTotal = pendingCommissionRows.reduce((s, c) => s + Number(c.amount), 0)
  const pendingCommissionCount = pendingCommissionRows.length

  const platformStats = [
    {
      label: t('statAffiliates'),
      value: String(approvedAffiliates ?? 0),
      highlight: false,
    },
    {
      label: t('statWholesalers'),
      value: String(approvedWholesalers ?? 0),
      highlight: false,
    },
    {
      label: t('statPending'),
      value: String(pendingUsers ?? 0),
      highlight: (pendingUsers ?? 0) > 0,
    },
    {
      label: t('statTodayOrders'),
      value: String(todayOrders ?? 0),
      highlight: false,
    },
    {
      label: t('statTotalOrders'),
      value: String(totalOrders ?? 0),
      highlight: false,
    },
    {
      label: t('statWholesalePending'),
      value: String(pendingWholesaleOrders ?? 0),
      highlight: (pendingWholesaleOrders ?? 0) > 0,
    },
    {
      label: t('statCommissionsDue'),
      value: formatMAD(pendingCommissionTotal),
      highlight: pendingCommissionCount > 0,
    },
  ]

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:flex items-center gap-2 text-line">|</span>
            <span className="hidden sm:block text-sm font-medium text-muted">{t('spaceLabel')}</span>
            <span className="text-xs px-2 py-0.5 bg-surface-2 text-faint rounded-full hidden sm:block">
              {roleLabel}
            </span>
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
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">
            {t('pageTitle')}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle')}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {platformStats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border p-4 ${
                stat.highlight
                  ? 'bg-warning-soft border-warning'
                  : 'bg-surface border-line'
              }`}
            >
              <p className="text-xs text-muted leading-tight">{stat.label}</p>
              <p
                className={`mt-1.5 text-2xl font-bold tabular-nums ${
                  stat.highlight ? 'text-warning-fg' : 'text-foreground'
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Agent quick actions */}
        {!isAdmin && (
          <div className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
              {t('agentActionsSection')}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-surface rounded-xl border border-line p-5">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {t('mySourcingTitle')}
                </h3>
                <p className="text-xs text-muted mb-4">{t('mySourcingDesc')}</p>
                <Link
                  href="/admin/sourcing/my-requests"
                  className="inline-block text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                >
                  {t('open')} {arrow}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
          {isAdmin && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                title: t('usersTitle'),
                description: t('usersDesc'),
                badge: pendingUsers ?? 0,
                href: '/admin/users',
              },
              {
                title: t('productsTitle'),
                description: t('productsDesc'),
                badge: null,
                href: '/admin/products',
              },
              {
                title: t('stockTitle'),
                description: t('stockDesc'),
                badge: null,
                href: '/admin/stock',
              },
              {
                title: t('ordersTitle'),
                description: t('ordersDesc'),
                badge: null,
                href: '/admin/orders',
              },
              {
                title: t('wholesaleOrdersTitle'),
                description: t('wholesaleOrdersDesc'),
                badge: pendingWholesaleOrders ?? 0,
                href: '/admin/wholesale-orders',
              },
              {
                title: t('commissionsTitle'),
                description: t('commissionsDesc'),
                badge: pendingCommissionCount,
                href: '/admin/commissions',
              },
              {
                title: t('payoutsTitle'),
                description: t('payoutsDesc'),
                badge: null,
                href: '/admin/payouts',
              },
              {
                title: t('quoteRequestsTitle'),
                description: t('quoteRequestsDesc'),
                badge: newQuoteRequests ?? 0,
                href: '/admin/quote-requests',
              },
              {
                title: t('supplierQuotesTitle'),
                description: t('supplierQuotesDesc'),
                badge: pendingMarketplaceRFQs ?? 0,
                href: '/admin/supplier-quotes',
              },
              {
                title: t('supplierProductsTitle'),
                description: t('supplierProductsDesc'),
                badge: pendingSupplierProducts ?? 0,
                href: '/admin/supplier-products',
              },
              {
                title: t('analyticsTitle'),
                description: t('analyticsDesc'),
                badge: null,
                href: '/admin/analytics',
              },
              {
                title: t('supplierPerformanceTitle'),
                description: t('supplierPerformanceDesc'),
                badge: null,
                href: '/admin/supplier-performance',
              },
              {
                title: t('sourcingTitle'),
                description: t('sourcingDesc'),
                badge: pendingSourcingRequests ?? 0,
                href: '/admin/sourcing',
              },
              {
                title: t('samplesTitle'),
                description: t('samplesDesc'),
                badge: pendingSampleRequests ?? 0,
                href: '/admin/samples',
              },
              {
                title: t('rfqTitle'),
                description: t('rfqDesc'),
                badge: null,
                href: '/admin/rfq',
              },
              {
                title: t('premiumTitle'),
                description: t('premiumDesc'),
                badge: null,
                href: '/admin/premium',
              },
              {
                title: t('categoriesTitle'),
                description: t('categoriesDesc'),
                badge: null,
                href: '/admin/categories',
              },
              {
                title: t('permissionsTitle'),
                description: t('permissionsDesc'),
                badge: null,
                href: '/admin/permissions',
              },
              {
                title: t('agentSourcingTitle'),
                description: t('agentSourcingDesc'),
                badge: null,
                href: '/admin/sourcing/agents',
              },
              {
                title: t('auditTitle'),
                description: t('auditDesc'),
                badge: null,
                href: '/admin/audit',
              },
              {
                title: t('treasuryTitle'),
                description: t('treasuryDesc'),
                badge: null,
                href: '/admin/treasury',
              },
              {
                title: t('remittancesTitle'),
                description: t('remittancesDesc'),
                badge: null,
                href: '/admin/remittances',
              },
            ].map((action) => (
              <div
                key={action.title}
                className="bg-surface rounded-xl border border-line p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{action.title}</h3>
                  {action.badge != null && action.badge > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 bg-warning-soft text-warning-fg rounded-full">
                      {action.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mb-4">{action.description}</p>
                {action.href ? (
                  <Link
                    href={action.href}
                    className="inline-block text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    {t('open')} {arrow}
                  </Link>
                ) : (
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg opacity-40 cursor-not-allowed"
                  >
                    {t('soon')} {arrow}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
