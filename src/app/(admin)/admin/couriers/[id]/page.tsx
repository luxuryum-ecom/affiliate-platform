import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { CourierStatusToggle } from '@/components/admin/courier-status-toggle'
import { CourierRegenerateLink } from '@/components/admin/courier-regenerate-link'
import { CourierTourCreateForm } from '@/components/admin/courier-tour-create-form'
import { CourierReturnActions } from '@/components/admin/courier-return-actions'
import { CourierStatementGenerator } from '@/components/admin/courier-statement-generator'
import { getCourierDetail } from '@/app/actions/couriers'
import { listCourierTours, getTourDetail, listCourierReturns } from '@/app/actions/courier-tours'
import { getCourierStatements } from '@/app/actions/statements'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.couriers')
  return { title: t('detailTitle') }
}

export default async function AdminCourierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const t = await getTranslations('admin.couriers')
  const tc = await getTranslations('admin.common')
  const ts = await getTranslations('admin.courierStatements')

  const { error, detail } = await getCourierDetail(id)
  if (!detail) {
    if (error) {
      // Erreur non "introuvable" : afficher un message plutôt qu'un 404 sec.
      return (
        <div className="min-h-screen bg-bg text-foreground grid place-items-center px-4">
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('errorState', { message: error })}
          </p>
        </div>
      )
    }
    notFound()
  }

  const { courier, balance, remittances, orders, productDebts } = detail
  const typeLabel = courier.courierType === 'company' ? t('typeCompany') : t('typePersonal')
  const overCap = balance?.overCap ?? false

  const shortRef = (s: string) => s.slice(0, 8).toUpperCase()

  // Tournées + nb colis (Lot D).
  const { tours } = await listCourierTours(id)
  const tourDetails = await Promise.all(tours.map((tr) => getTourDetail(tr.id)))
  const tourParcelCounts = new Map(tours.map((tr, i) => [tr.id, tourDetails[i]?.detail?.orders.length ?? 0]))
  const tourStatusLabel = (status: string) =>
    status === 'closed' ? t('tourStatusClosed') : status === 'dispatched' ? t('tourStatusDispatched') : t('tourStatusOpen')
  const tourStatusClass = (status: string) =>
    status === 'closed'
      ? 'bg-success-soft text-success-fg'
      : status === 'dispatched'
        ? 'bg-warning-soft text-warning-fg'
        : 'bg-surface-2 text-muted'

  // Retours — chaîne de garde (Lot D).
  const { returns } = await listCourierReturns(id)

  // Relevés signables (Lot F) — RPC SECURITY DEFINER, calcul entièrement serveur.
  const statements = await getCourierStatements(id)
  const fmtStatementDate = (iso: string) => iso.slice(0, 10)
  const returnStateLabel = (state: string) =>
    state === 'lost' ? t('returnStateLost') : state === 'declared' ? t('returnStateDeclared') : t('returnStateConfirmed')
  const returnStateClass = (state: string) =>
    state === 'lost'
      ? 'bg-danger-soft text-danger-fg'
      : state === 'declared'
        ? 'bg-warning-soft text-warning-fg'
        : 'bg-success-soft text-success-fg'

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:flex items-center gap-2 text-line">|</span>
            <Link
              href="/admin/couriers"
              className="hidden sm:block text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              {t('backToList')}
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

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* En-tête livreur */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{courier.name || t('unnamedCourier')}</h1>
            <p className="text-sm text-muted mt-0.5">
              {typeLabel}
              {courier.companyName ? ` · ${courier.companyName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                courier.status === 'active' ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
              }`}
            >
              {courier.status === 'active' ? t('statusActive') : t('statusBlocked')}
            </span>
            <CourierStatusToggle courierId={courier.id} status={courier.status} />
          </div>
        </div>

        {/* Soldes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('colCashOwed')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {formatMAD(balance?.cashOwedMad ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('colProductDebt')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {formatMAD(balance?.productDebtMad ?? 0)}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${overCap ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('colTotal')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${overCap ? 'text-warning-fg' : 'text-foreground'}`}>
              {formatMAD(balance?.totalBalanceMad ?? 0)}
            </p>
            {overCap && <p className="text-[11px] text-warning-fg font-medium mt-1">{t('overCapWarning')}</p>}
          </div>
        </div>

        {/* Identité + accès */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-4">{t('identitySection')}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t('phoneLabel')}</dt>
                <dd className="text-foreground font-medium">{courier.phone || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t('balanceCapLabel')}</dt>
                <dd className="text-foreground font-medium tabular-nums">{formatMAD(courier.balanceCapMad)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t('createdLabel')}</dt>
                <dd className="text-foreground font-medium">{courier.createdAt.slice(0, 10)}</dd>
              </div>
              {courier.notes && (
                <div className="pt-2 border-t border-line">
                  <dt className="text-muted mb-1">{t('notesLabel')}</dt>
                  <dd className="text-foreground">{courier.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-4">{t('accessSection')}</h2>
            <CourierRegenerateLink courierId={courier.id} />
          </div>
        </div>

        {/* Historique — bordereaux */}
        <section className="bg-surface rounded-xl border border-line overflow-hidden">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint px-5 pt-5 pb-3">
            {t('remittancesSection')}
          </h2>
          {remittances.length === 0 ? (
            <p className="text-sm text-muted px-5 pb-5">{t('remitEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-faint text-left border-y border-line bg-surface-2">
                    <th className="py-2.5 px-5 font-medium">{t('remitColRef')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('remitColExpected')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('remitColReceived')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('remitColStatus')}</th>
                    <th className="py-2.5 px-5 font-medium text-right">{t('remitColDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {remittances.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 px-5 font-mono text-foreground">{r.reference || shortRef(r.id)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted">{formatMAD(r.expectedAmountMad)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-foreground">{formatMAD(r.receivedAmountMad)}</td>
                      <td className="py-2.5 px-4 text-muted">{r.status}</td>
                      <td className="py-2.5 px-5 text-right text-muted">{(r.reconciledAt ?? r.createdAt).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Historique — commandes assignées */}
        <section className="bg-surface rounded-xl border border-line overflow-hidden">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint px-5 pt-5 pb-3">
            {t('ordersSection')}
          </h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted px-5 pb-5">{t('ordersEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="text-faint text-left border-y border-line bg-surface-2">
                    <th className="py-2.5 px-5 font-medium">{t('orderColRef')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('orderColCity')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('orderColStatus')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('orderColAmount')}</th>
                    <th className="py-2.5 px-5 font-medium text-right">{t('orderColDelivered')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderId} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 px-5 font-mono text-foreground">{shortRef(o.reference)}</td>
                      <td className="py-2.5 px-4 text-muted">{o.customerCity || '—'}</td>
                      <td className="py-2.5 px-4 text-muted">{o.status}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-foreground">{formatMAD(o.totalAmount)}</td>
                      <td className="py-2.5 px-5 text-right text-muted">{o.deliveredAt ? o.deliveredAt.slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Historique — créances produit */}
        <section className="bg-surface rounded-xl border border-line overflow-hidden">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint px-5 pt-5 pb-3">
            {t('debtsSection')}
          </h2>
          {productDebts.length === 0 ? (
            <p className="text-sm text-muted px-5 pb-5">{t('debtsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="text-faint text-left border-y border-line bg-surface-2">
                    <th className="py-2.5 px-5 font-medium">{t('debtColReason')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('debtColQty')}</th>
                    <th className="py-2.5 px-4 font-medium text-right">{t('debtColAmount')}</th>
                    <th className="py-2.5 px-5 font-medium text-right">{t('debtColDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productDebts.map((d) => (
                    <tr key={d.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 px-5 text-foreground">{d.reason || '—'}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted">{d.quantity}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-danger-fg font-medium">{formatMAD(d.amountMad)}</td>
                      <td className="py-2.5 px-5 text-right text-muted">{d.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Tournées (Lot D) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">{t('toursSection')}</h2>
            <CourierTourCreateForm courierId={courier.id} />
          </div>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {tours.length === 0 ? (
              <p className="text-sm text-muted px-5 py-5">{t('toursEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead>
                    <tr className="text-faint text-left border-y border-line bg-surface-2">
                      <th className="py-2.5 px-5 font-medium">{t('tourColDate')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('tourColStatus')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('tourColParcels')}</th>
                      <th className="py-2.5 px-5 font-medium text-right">{t('printSlip')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tours.map((tr) => (
                      <tr key={tr.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 px-5 text-foreground">{tr.tourDate}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${tourStatusClass(tr.status)}`}>
                            {tourStatusLabel(tr.status)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-muted">
                          {tourParcelCounts.get(tr.id) ?? 0}
                        </td>
                        <td className="py-2.5 px-5 text-right">
                          <Link
                            href={`/admin/couriers/tours/${tr.id}/slip`}
                            target="_blank"
                            className="text-primary hover:underline font-medium"
                          >
                            {t('printSlip')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Retours — chaîne de garde (Lot D) */}
        <section className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-2">{t('returnsSection')}</h2>
            <p className="text-[11px] text-faint">{t('returnChainNote')}</p>
          </div>
          {returns.length === 0 ? (
            <p className="text-sm text-muted px-5 pb-5">{t('returnsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-faint text-left border-y border-line bg-surface-2">
                    <th className="py-2.5 px-5 font-medium">{t('returnColRef')}</th>
                    <th className="py-2.5 px-4 font-medium">{t('returnColStatus')}</th>
                    <th className="py-2.5 px-5 font-medium">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 px-5 font-mono text-foreground align-top">{shortRef(r.orderId)}</td>
                      <td className="py-2.5 px-4 align-top">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${returnStateClass(r.state)}`}>
                          {returnStateLabel(r.state)}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 align-top">
                        {r.state === 'declared' ? (
                          <CourierReturnActions orderId={r.orderId} />
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Relevés signables (Lot F) */}
        <section className="space-y-3">
          <CourierStatementGenerator courierId={courier.id} />

          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {statements.length === 0 ? (
              <p className="text-sm text-muted px-5 py-5">{ts('listEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-faint text-left border-y border-line bg-surface-2">
                      <th className="py-2.5 px-5 font-medium">{ts('colPeriod')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{ts('colBalance')}</th>
                      <th className="py-2.5 px-4 font-medium">{ts('colDate')}</th>
                      <th className="py-2.5 px-5 font-medium text-right">{ts('colDownload')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map((s) => (
                      <tr key={s.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 px-5 text-foreground">
                          {fmtStatementDate(s.periodStart)} – {fmtStatementDate(s.periodEnd)}
                        </td>
                        {/* ARGENT: formatMAD inchangé */}
                        <td className="py-2.5 px-4 text-right tabular-nums text-foreground font-medium">
                          {formatMAD(s.finalBalanceMad)}
                        </td>
                        <td className="py-2.5 px-4 text-muted">{fmtStatementDate(s.generatedAt)}</td>
                        <td className="py-2.5 px-5 text-right">
                          <Link
                            href={`/api/statements/courier/${s.id}?lang=fr`}
                            target="_blank"
                            className="text-primary hover:underline font-medium"
                          >
                            {ts('langFr')}
                          </Link>
                          {' · '}
                          <Link
                            href={`/api/statements/courier/${s.id}?lang=ar`}
                            target="_blank"
                            className="text-primary hover:underline font-medium"
                          >
                            {ts('langAr')}
                          </Link>
                        </td>
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
