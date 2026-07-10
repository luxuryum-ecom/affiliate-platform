import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { getTreasuryOverview, type CommissionStatusTotal } from '@/app/actions/treasury'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.treasury')
  return { title: t('metaTitle') }
}

const ACCOUNT_CODES = [
  'platform_cash',
  'cash_in_transit_courier',
  'supplier_payable',
  'affiliate_commission_payable',
  'platform_margin_income',
  'delivery_income',
  'confirmation_income',
  'packaging_income',
] as const

const TYPE_KEY: Record<string, string> = {
  asset: 'typeAsset',
  liability: 'typeLiability',
  revenue: 'typeRevenue',
  expense: 'typeExpense',
  equity: 'typeEquity',
}

const COMMISSION_BAR_CLS: Record<CommissionStatusTotal['status'], string> = {
  pending: 'bg-warning',
  approved: 'bg-primary',
  paid: 'bg-success',
}

export default async function AdminTreasuryPage() {
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

  const t = await getTranslations('admin.treasury')
  const tc = await getTranslations('admin.common')

  const { error, data } = await getTreasuryOverview()

  const accounts = data?.accounts ?? []
  const balanceByCode = new Map(accounts.map((a) => [a.accountCode, a]))
  const commissionsByStatus = data?.commissionsByStatus ?? []
  const pendingRemittance = data?.pendingRemittance ?? { ordersCount: 0, totalExpectedMad: 0 }

  const platformCash = balanceByCode.get('platform_cash')?.balanceMad ?? 0
  const cashInTransit = data?.courierCashInTransitMad ?? balanceByCode.get('cash_in_transit_courier')?.balanceMad ?? 0
  // KPIs de MAGNITUDE : les comptes de passif (supplier_payable, affiliate_commission_payable)
  // et de revenu (platform_margin_income) ont un solde SIGNÉ négatif dans la convention
  // double-entrée (crédit = −). Sur les cartes KPI on affiche la MAGNITUDE (Math.abs) de façon
  // COHÉRENTE — « à payer » / « accumulée » se lisent en positif. Le signe réel (convention
  // comptable) reste visible dans le tableau détaillé des comptes plus bas (avec légende).
  const supplierPayable = Math.abs(balanceByCode.get('supplier_payable')?.balanceMad ?? 0)
  // « Commissions à payer » = commissions APPROUVÉES non encore payées (payables via create_payout) —
  // définition UNIQUE et actionnable. Le solde ledger `affiliate_commission_payable` agrège aussi les
  // pending accumulées (passif global) → il reste visible dans le tableau détaillé des comptes, pas ici.
  const commissionsPayable = commissionsByStatus
    .filter((c) => c.status === 'approved')
    .reduce((s, c) => s + c.totalMad, 0)
  const marginIncome = Math.abs(balanceByCode.get('platform_margin_income')?.balanceMad ?? 0)

  const maxCommissionTotal = Math.max(1, ...commissionsByStatus.map((c) => c.totalMad))

  function accountLabel(code: string) {
    return t(`accounts.${code}`)
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

        {error && (
          <p className="mb-6 text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('errorState', { message: error })}
          </p>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('kpiPlatformCash')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(platformCash)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${cashInTransit > 0 ? 'bg-warning-soft border-warning' : 'bg-surface border-line'}`}>
            <p className="text-xs text-muted leading-tight">{t('kpiCashInTransit')}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${cashInTransit > 0 ? 'text-warning-fg' : 'text-foreground'}`}>
              {formatMAD(cashInTransit)}
            </p>
            {cashInTransit > 0 && <p className="text-xs text-warning-fg mt-1">{t('kpiCashInTransitNote')}</p>}
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('kpiSupplierPayable')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(supplierPayable)}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('kpiCommissionsPayable')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(commissionsPayable)}</p>
          </div>
          <div className="rounded-xl border p-4 bg-surface border-line">
            <p className="text-xs text-muted leading-tight">{t('kpiMarginIncome')}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{formatMAD(marginIncome)}</p>
          </div>
        </div>

        {/* Sous-KPI : réconciliation en attente */}
        {pendingRemittance.ordersCount > 0 && (
          <div className="rounded-xl border p-4 bg-warning-soft border-warning mb-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-warning-fg">
              {t('pendingRemittanceLabel', {
                count: pendingRemittance.ordersCount,
                amount: formatMAD(pendingRemittance.totalExpectedMad),
              })}
            </p>
            <Link
              href="/admin/remittances"
              className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity shrink-0"
            >
              {t('pendingRemittanceLink')}
            </Link>
          </div>
        )}
        {pendingRemittance.ordersCount === 0 && <div className="mb-8" />}

        {/* Commissions par statut */}
        <div className="bg-surface rounded-xl border border-line p-5 mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-faint mb-4">
            {t('commissionsSectionTitle')}
          </h2>
          <div className="space-y-3">
            {commissionsByStatus.map((c) => (
              <div key={c.status}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">
                    {c.status === 'pending' ? t('statusPending') : c.status === 'approved' ? t('statusApproved') : t('statusPaid')}
                  </span>
                  <span className="tabular-nums text-foreground font-medium">
                    {formatMAD(c.totalMad)} · {t('countLabel', { count: c.count })}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${COMMISSION_BAR_CLS[c.status]}`}
                    style={{ width: `${Math.max(2, Math.round((c.totalMad / maxCommissionTotal) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tableau des soldes de comptes */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('accountsSectionTitle')}
          </h2>
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted p-5">{t('emptyState')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-faint text-left border-b border-line bg-surface-2">
                      <th className="py-2.5 px-4 font-medium">{t('colAccount')}</th>
                      <th className="py-2.5 px-4 font-medium">{t('colType')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colBalance')}</th>
                      <th className="py-2.5 px-4 font-medium text-right">{t('colMovements')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACCOUNT_CODES.filter((code) => balanceByCode.has(code)).map((code) => {
                      const a = balanceByCode.get(code)!
                      // Rouge SEULEMENT si le solde est ANORMAL (contraire au sens normal du compte).
                      // En double-entrée un passif/revenu a un solde signé négatif SAIN → pas d'alarme.
                      const abnormal =
                        (a.normalBalance === 'credit' && a.balanceMad > 0) ||
                        (a.normalBalance === 'debit' && a.balanceMad < 0)
                      return (
                        <tr key={code} className="border-b border-line/60 last:border-0">
                          <td className="py-2.5 px-4 font-medium text-foreground">{accountLabel(code)}</td>
                          <td className="py-2.5 px-4 text-muted">{t(TYPE_KEY[a.type] ?? 'typeAsset')}</td>
                          <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${abnormal ? 'text-danger-fg' : 'text-foreground'}`}>
                            {formatMAD(a.balanceMad)}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-muted">{a.movements}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-faint mt-3">{t('legend')}</p>
          <p className="text-xs text-faint mt-1">{t('noteLedger')}</p>
        </div>
      </main>
    </div>
  )
}
