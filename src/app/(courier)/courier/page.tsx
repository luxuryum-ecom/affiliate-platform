import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCourierDashboard } from '@/app/actions/courier-dashboard'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { formatMAD } from '@/lib/utils'

export async function generateMetadata() {
  const t = await getTranslations('courier.dashboard')
  return { title: t('metaTitle') }
}

interface PageProps {
  searchParams: Promise<{ code?: string }>
}

/**
 * Tableau de bord livreur cloisonné — `/courier?code=...` (module Livreurs, Lot C).
 *
 * Même auth que /courier/scan (access_code hashé, mig 127). Le livreur voit
 * UNIQUEMENT son périmètre : ses colis en cours (avec contact de SES livraisons),
 * son cash à déposer, son solde EXACT (grand livre), ses retours à rendre, et
 * l'accès direct au scan. Zéro marge, zéro autre livreur, zéro total plateforme.
 */
export default async function CourierDashboardPage({ searchParams }: PageProps) {
  const { code } = await searchParams
  const cleanCode = (code ?? '').trim()

  const t = await getTranslations('courier.dashboard')
  const { error, dashboard } = await getCourierDashboard(cleanCode)

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-bg grid place-items-center px-4">
        <div className="max-w-sm w-full text-center space-y-3 bg-surface border border-line rounded-xl p-6">
          <p className="text-3xl" aria-hidden="true">🔒</p>
          <h1 className="text-base font-semibold text-foreground">{t('invalidTitle')}</h1>
          <p className="text-sm text-muted">{t('invalidMessage')}</p>
        </div>
      </div>
    )
  }

  const { courierName, toDepositMad, productDebtMad, totalBalanceMad, deliveries, returns } = dashboard
  const scanHref = `/courier/scan?code=${encodeURIComponent(cleanCode)}`

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{courierName}</p>
            <p className="text-[11px] text-muted">{t('pageTitle')}</p>
          </div>
          <LanguageSwitcher variant="light" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Soldes — chiffres EXACTS du grand livre */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-4 bg-warning-soft border-warning col-span-2">
            <p className="text-xs text-warning-fg/80 leading-tight">{t('toDeposit')}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-warning-fg">{formatMAD(toDepositMad)}</p>
            <p className="text-[11px] text-warning-fg/70 mt-1">{t('toDepositHint')}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('productDebt')}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${productDebtMad > 0 ? 'text-danger-fg' : 'text-foreground'}`}>
              {formatMAD(productDebtMad)}
            </p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('totalBalance')}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatMAD(totalBalanceMad)}</p>
          </div>
        </div>

        {/* Accès direct au scan — gros bouton tactile */}
        <Link
          href={scanHref}
          className="flex items-center justify-center gap-2 w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold hover:opacity-90 transition-opacity"
        >
          <span aria-hidden="true">📷</span> {t('scanCta')}
        </Link>

        {/* Mes livraisons en cours */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint px-1">
            {t('deliveriesTitle')} · {deliveries.length}
          </h2>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted bg-surface border border-line rounded-xl p-4">{t('deliveriesEmpty')}</p>
          ) : (
            deliveries.map((d) => (
              <div key={d.orderId} className="bg-surface border border-line rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted">{d.reference}</p>
                    <p className="text-sm font-semibold text-foreground truncate">{d.customerName || '—'}</p>
                    <p className="text-xs text-muted mt-0.5">{d.customerCity || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted">{t('codLabel')}</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">{formatMAD(d.amountMad)}</p>
                  </div>
                </div>
                {d.customerAddress && <p className="text-xs text-muted mt-2">{d.customerAddress}</p>}
                {d.customerPhone && (
                  <a
                    href={`tel:${d.customerPhone}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs px-3 py-1.5 bg-surface-2 text-foreground rounded-lg"
                  >
                    <span aria-hidden="true">📞</span> {d.customerPhone}
                  </a>
                )}
              </div>
            ))
          )}
        </section>

        {/* Retours à rendre */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint px-1">
            {t('returnsTitle')} · {returns.length}
          </h2>
          {returns.length === 0 ? (
            <p className="text-sm text-muted bg-surface border border-line rounded-xl p-4">{t('returnsEmpty')}</p>
          ) : (
            returns.map((r) => (
              <div key={r.orderId} className="bg-surface border border-line rounded-xl p-3 flex items-center justify-between">
                <span className="font-mono text-xs text-foreground">{r.reference}</span>
                <span className="text-xs text-muted">{r.customerCity || '—'}</span>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  )
}
