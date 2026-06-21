import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
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

  const quoteStats = [
    { label: t('quotePrepared'), value: String(preparedQuotes), cls: preparedQuotes > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line', textCls: preparedQuotes > 0 ? 'text-warning-fg' : 'text-foreground' },
    { label: t('quoteAccepted'), value: String(acceptedQuotes), cls: 'bg-surface border-line', textCls: 'text-success-fg' },
    { label: t('quoteRejected'), value: String(rejectedQuotes), cls: 'bg-surface border-line', textCls: 'text-danger-fg' },
  ]

  return (
    <div className="min-h-screen bg-bg">
      {/* Navbar */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {t('greeting', { name: profile?.full_name ?? '' })}
          </h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* ════════ ZONE 1 — ACHETER ════════ */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{t('zoneBuyTitle')}</h2>

          {/* 2 boutons mis en avant */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stock Maroc */}
            <Link
              href="/wholesale/products"
              className="min-h-[116px] flex flex-col justify-between rounded-2xl border border-gold-300 bg-accent-soft p-4 active:opacity-90 transition-opacity"
            >
              <span className="text-2xl leading-none" aria-hidden>🇲🇦</span>
              <span className="block">
                <span className="block text-base font-bold text-foreground leading-tight">{t('buyLocalTitle')}</span>
                <span className="block text-xs text-muted mt-1">{t('buyLocalDesc')}</span>
              </span>
            </Link>

            {/* Marché mondial */}
            <Link
              href="/wholesale/marketplace"
              className="min-h-[116px] flex flex-col justify-between rounded-2xl border border-gold-300 bg-accent-soft p-4 active:opacity-90 transition-opacity"
            >
              <span className="text-2xl leading-none" aria-hidden>🌍</span>
              <span className="block">
                <span className="block text-base font-bold text-foreground leading-tight">{t('buyGlobalTitle')}</span>
                <span className="block text-base leading-none mt-1" aria-hidden>🇲🇦🇨🇳🇹🇷🇪🇬🇦🇪</span>
                <span className="block text-xs text-muted mt-1">{t('buyGlobalDesc')}</span>
              </span>
            </Link>
          </div>

          {/* Sourcing intelligent — mis en avant */}
          <Link
            href="/wholesale/sourcing"
            className="flex items-center justify-between gap-3 rounded-2xl border border-gold-400 bg-primary text-primary-foreground p-4 min-h-[64px] active:opacity-90 transition-opacity"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold">{t('cardSourcingTitle')}</span>
                <span className="text-[10px] px-2 py-0.5 bg-primary-foreground/15 rounded-full font-medium">{t('sourcingBadge')}</span>
              </span>
              <span className="block text-xs opacity-80 mt-0.5 truncate">{t('cardSourcingDesc')}</span>
            </span>
            <span className="text-xl leading-none flex-shrink-0" aria-hidden>✨</span>
          </Link>
        </section>

        {/* ════════ ZONE 2 — MON ACTIVITÉ ════════ */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{t('zoneActivityTitle')}</h2>

          {/* Chips chiffres réels */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs text-muted leading-tight">{t('statPending')}</p>
              <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{pendingOrders}</p>
            </div>
            <Link
              href="/wholesale/cart"
              className="block rounded-xl border border-line bg-surface p-4 active:bg-surface-2 transition-colors"
            >
              <p className="text-xs text-muted leading-tight">{t('statCartItems')}</p>
              <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{cartItemCount ?? 0}</p>
            </Link>
          </div>

          {/* Mes commandes */}
          <Link
            href="/wholesale/orders"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 min-h-[56px] active:bg-surface-2 transition-colors"
          >
            <span className="text-sm font-medium text-foreground">{t('cardOrdersTitle')}</span>
            <span className="text-xs text-muted tabular-nums">{t('statTotalOrders')}: {totalOrders ?? 0}</span>
          </Link>

          {/* Mes devis */}
          <Link
            href="/wholesale/quote-requests"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 min-h-[56px] active:bg-surface-2 transition-colors"
          >
            <span className="text-sm font-medium text-foreground">{t('cardQuotesTitle')}</span>
            {preparedQuotes > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 bg-warning-soft text-warning-fg rounded-full">{preparedQuotes}</span>
            )}
          </Link>

          {/* Compteurs devis (chiffres réels préservés) */}
          <div className="grid grid-cols-3 gap-2">
            {quoteStats.map((qs) => (
              <div key={qs.label} className={`rounded-lg border p-3 ${qs.cls}`}>
                <p className="text-xs text-muted leading-tight">{qs.label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${qs.textCls}`}>{qs.value}</p>
              </div>
            ))}
          </div>

          {/* Mes échantillons */}
          <Link
            href="/wholesale/samples"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 min-h-[56px] active:bg-surface-2 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{t('cardSamplesTitle')}</span>
              {(pendingSampleCount ?? 0) > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 bg-warning-soft text-warning-fg rounded-full">{pendingSampleCount}</span>
              )}
            </span>
          </Link>
        </section>

        {/* ════════ ZONE 3 — MON COMPTE ════════ */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{t('zoneAccountTitle')}</h2>

          <Link
            href="/wholesale/account"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 min-h-[56px] active:bg-surface-2 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{t('cardAccountTitle')}</span>
              <span className="block text-xs text-muted mt-0.5 truncate">{t('cardAccountDesc')}</span>
            </span>
            <span className="text-sm text-accent-fg flex-shrink-0">{t('cardAccountCta')}</span>
          </Link>
        </section>
      </main>
    </div>
  )
}
