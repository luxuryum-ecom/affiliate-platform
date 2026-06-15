import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { Profile, WholesaleOrderBuyerView } from '@/types/database'

type QuoteCountRow = { status: string }
type SupplierQuoteCountRow = { status: string }

export async function generateMetadata() {
  const t = await getTranslations('wholesaleDashboard')
  return { title: t('metaTitle') }
}

export default async function WholesaleDashboardPage() {
  const supabase = await createClient()
  const t = await getTranslations('wholesaleDashboard')
  const tc = await getTranslations('common')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const [
    { count: totalOrders },
    { count: cartItemCount },
    { data: orderRows },
    { data: quoteStatusRows },
    { data: supplierQuoteRows },
    { count: pendingSampleCount },
  ] = await Promise.all([
    supabase
      .from('wholesale_orders_buyer_read')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', user!.id),
    supabase
      .from('wholesale_cart_items')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', user!.id),
    supabase
      .from('wholesale_orders_buyer_read')
      .select('*')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: WholesaleOrderBuyerView[] | null; error: unknown }>,
    supabase
      .from('quote_requests')
      .select('status')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: QuoteCountRow[] | null; error: unknown }>,
    supabase
      .from('supplier_quote_requests')
      .select('status')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: SupplierQuoteCountRow[] | null; error: unknown }>,
    supabase
      .from('sample_requests')
      .select('*', { count: 'exact', head: true })
      .eq('wholesaler_id', user!.id)
      .eq('status', 'pending'),
  ])

  const totalSpend = (orderRows ?? [])
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + Number(o.total_amount), 0)

  const pendingOrders = (orderRows ?? []).filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length

  const quoteRows = quoteStatusRows ?? []
  const sqRows = supplierQuoteRows ?? []
  const preparedQuotes  = quoteRows.filter((q) => q.status === 'quote_prepared').length
                        + sqRows.filter((q) => q.status === 'quoted').length
  const acceptedQuotes  = quoteRows.filter((q) => q.status === 'accepted_by_client').length
                        + sqRows.filter((q) => q.status === 'approved').length
  const rejectedQuotes  = quoteRows.filter((q) => q.status === 'rejected_by_client').length
                        + sqRows.filter((q) => q.status === 'rejected').length

  const stats = [
    { label: t('statTotalOrders'), value: String(totalOrders ?? 0) },
    { label: t('statPending'), value: String(pendingOrders) },
    { label: t('statCartItems'), value: String(cartItemCount ?? 0) },
    { label: t('statTotalSpent'), value: formatMAD(totalSpend) },
  ]

  const quoteStats = [
    { label: t('quotePrepared'), value: String(preparedQuotes), cls: preparedQuotes > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line', textCls: preparedQuotes > 0 ? 'text-warning-fg' : 'text-foreground' },
    { label: t('quoteAccepted'), value: String(acceptedQuotes), cls: 'bg-surface border-line', textCls: 'text-success-fg' },
    { label: t('quoteRejected'), value: String(rejectedQuotes), cls: 'bg-surface border-line', textCls: 'text-danger-fg' },
  ]

  return (
    <div className="min-h-screen bg-bg">
      {/* Navbar */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <span className="hidden sm:block text-sm font-medium text-muted">{t('spaceLabel')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">
            {t('greeting', { name: profile?.full_name ?? '' })}
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle')}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-surface rounded-xl border border-line p-4"
            >
              <p className="text-xs text-muted leading-tight">{stat.label}</p>
              <p className="mt-1.5 text-xl font-bold text-foreground tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardCatalogTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">
                {t('cardCatalogDesc')}
              </p>
            </div>
            <Link
              href="/wholesale/products"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {t('cardCatalogCta')}
            </Link>
          </div>

          <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardCartTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">
                {cartItemCount
                  ? t('cartItems', { count: cartItemCount })
                  : t('cartEmpty')}
              </p>
            </div>
            <Link
              href="/wholesale/cart"
              className="text-xs px-4 py-2 bg-surface border border-line text-muted rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              {t('cardCartCta')}
            </Link>
          </div>
        </div>

        {/* Orders CTA */}
        <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('cardOrdersTitle')}</h2>
            <p className="text-xs text-muted mt-0.5">
              {pendingOrders > 0
                ? t('ordersPending', { count: pendingOrders })
                : t('ordersDesc')}
            </p>
          </div>
          <Link
            href="/wholesale/orders"
            className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('cardOrdersCta')}
          </Link>
        </div>

        {/* Supplier marketplace */}
        <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('cardMarketplaceTitle')}</h2>
            <p className="text-xs text-muted mt-0.5">
              {t('cardMarketplaceDesc')}
            </p>
          </div>
          <Link
            href="/wholesale/marketplace"
            className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('cardMarketplaceCta')}
          </Link>
        </div>

        {/* Quote requests */}
        <div className="bg-surface rounded-xl border border-line p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('cardQuotesTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">
                {t('cardQuotesDesc')}
              </p>
            </div>
            <Link
              href="/wholesale/quote-requests"
              className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              {t('cardQuotesCta')}
            </Link>
          </div>
          {/* Quote decision counters */}
          <div className="grid grid-cols-3 gap-2">
            {quoteStats.map((qs) => (
              <div key={qs.label} className={`rounded-lg border p-3 ${qs.cls}`}>
                <p className="text-xs text-muted leading-tight">{qs.label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${qs.textCls}`}>{qs.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sample requests */}
        <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('cardSamplesTitle')}</h2>
              {(pendingSampleCount ?? 0) > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 bg-warning-soft text-warning-fg rounded-full">
                  {pendingSampleCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {(pendingSampleCount ?? 0) > 0
                ? t('samplesPending', { count: pendingSampleCount ?? 0 })
                : t('samplesDesc')}
            </p>
          </div>
          <Link
            href="/wholesale/samples"
            className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('cardSamplesCta')}
          </Link>
        </div>

        {/* Intelligent Sourcing */}
        <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-foreground">{t('cardSourcingTitle')}</h2>
              <span className="text-xs px-2 py-0.5 bg-accent-soft text-accent-fg rounded-full font-medium border border-gold-300">{t('sourcingBadge')}</span>
            </div>
            <p className="text-xs text-muted">
              {t('cardSourcingDesc')}
            </p>
          </div>
          <Link
            href="/wholesale/sourcing"
            className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            {t('cardSourcingCta')}
          </Link>
        </div>

        {/* Account / billing */}
        <div className="bg-surface rounded-xl border border-line p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('cardAccountTitle')}</h2>
            <p className="text-xs text-muted mt-0.5">
              {t('cardAccountDesc')}
            </p>
          </div>
          <Link
            href="/wholesale/account"
            className="text-xs px-4 py-2 bg-surface border border-line text-muted rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
          >
            {t('cardAccountCta')}
          </Link>
        </div>
      </main>
    </div>
  )
}
