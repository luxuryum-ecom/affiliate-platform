import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Commission, CommissionStatus, Payout } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('affiliate.commissions')
  return { title: t('metaTitle') }
}

type CommissionWithOrder = Commission & {
  order: { id: string; customer_name: string; customer_city: string; quantity: number } | null
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const STATUSES: CommissionStatus[] = ['pending', 'approved', 'paid']

export default async function AffiliateCommissionsPage({ searchParams }: PageProps) {
  const { status: filterStatus } = await searchParams
  const supabase = await createClient()
  const t = await getTranslations('affiliate.commissions')
  const tCommon = await getTranslations('affiliate.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  const affiliateId = user!.id

  const [profileRes, commissionsRes, payoutsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', affiliateId).single() as unknown as Promise<{
      data: { full_name: string } | null; error: unknown
    }>,
    supabase
      .from('commissions')
      .select('*, order:orders!order_id(id, customer_name, customer_city, quantity)')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false }) as unknown as Promise<{
        data: CommissionWithOrder[] | null; error: unknown
      }>,
    supabase
      .from('payouts')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false }) as unknown as Promise<{
        data: Payout[] | null; error: unknown
      }>,
  ])

  const profile = profileRes.data
  const allCommissions = commissionsRes.data ?? []
  const payouts = payoutsRes.data ?? []

  const filtered =
    filterStatus && STATUSES.includes(filterStatus as CommissionStatus)
      ? allCommissions.filter((c) => c.status === filterStatus)
      : allCommissions

  const sum = (s: CommissionStatus) =>
    allCommissions.filter((c) => c.status === s).reduce((acc, c) => acc + Number(c.amount), 0)

  const totalPending  = sum('pending')
  const totalApproved = sum('approved')
  const totalPaid     = sum('paid')
  const pendingBalance = totalPending + totalApproved
  const countByStatus = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = allCommissions.filter((c) => c.status === s).length
    return acc
  }, {})

  const STATUS_LABEL: Record<CommissionStatus, string> = {
    pending:  t('statusPending'),
    approved: t('statusApproved'),
    paid:     t('statusPaid'),
  }

  const STATUS_CLS: Record<CommissionStatus, string> = {
    pending:  'bg-warning-soft text-warning-fg border-warning',
    approved: 'bg-surface-2 text-muted border-line',
    paid:     'bg-success-soft text-success-fg border-success',
  }

  const PAYOUT_LABEL: Record<string, string> = {
    pending:    t('payoutStatusPending'),
    processing: t('payoutStatusProcessing'),
    paid:       t('payoutStatusPaid'),
  }

  const PAYOUT_CLS: Record<string, string> = {
    pending:    'bg-warning-soft text-warning-fg border-warning',
    processing: 'bg-surface-2 text-muted border-line',
    paid:       'bg-success-soft text-success-fg border-success',
  }

  function buildHref(params: { status?: string }) {
    const p = new URLSearchParams()
    if (params.status) p.set('status', params.status)
    const s = p.toString()
    return `/affiliate/commissions${s ? `?${s}` : ''}`
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  function fmtDateShort(iso: string) {
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
    })
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        userName={profile?.full_name}
        signOutLabel={tCommon('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Balance highlight */}
        <div className={`rounded-xl border p-5 ${
          pendingBalance > 0
            ? 'bg-warning-soft border-warning'
            : 'bg-surface border-line'
        }`}>
          <p className="text-xs text-muted">{t('pendingBalanceLabel')}</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${
            pendingBalance > 0 ? 'text-warning-fg' : 'text-faint'
          }`}>
            {formatMAD(pendingBalance)}
          </p>
          <p className="text-xs text-faint mt-1">{t('pendingBalanceNote')}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-warning-soft border border-warning rounded-xl p-4">
            <p className="text-xs text-warning-fg">{t('statPending')}</p>
            <p className="mt-1 text-xl font-bold text-warning-fg tabular-nums">{formatMAD(totalPending)}</p>
            <p className="text-xs text-warning-fg mt-0.5 opacity-80">{t('statPendingCount', { count: countByStatus.pending ?? 0 })}</p>
          </div>
          <div className="bg-surface-2 border border-line rounded-xl p-4">
            <p className="text-xs text-muted">{t('statApproved')}</p>
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{formatMAD(totalApproved)}</p>
            <p className="text-xs text-muted mt-0.5">{t('statApprovedCount', { count: countByStatus.approved ?? 0 })}</p>
          </div>
          <div className="bg-success-soft border border-success rounded-xl p-4">
            <p className="text-xs text-success-fg">{t('statPaid')}</p>
            <p className="mt-1 text-xl font-bold text-success-fg tabular-nums">{formatMAD(totalPaid)}</p>
            <p className="text-xs text-success-fg mt-0.5 opacity-80">{t('statPaidCount', { count: countByStatus.paid ?? 0 })}</p>
          </div>
        </div>

        {/* Commission list */}
        <section>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <Link
              href={buildHref({})}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !filterStatus
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface border-line text-muted hover:bg-surface-2'
              }`}
            >
              {t('filterAll', { count: allCommissions.length })}
            </Link>
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={buildHref({ status: s })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterStatus === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface border-line text-muted hover:bg-surface-2'
                }`}
              >
                {t('filterLabel', { label: STATUS_LABEL[s], count: countByStatus[s] ?? 0 })}
              </Link>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-10 text-center">
              <p className="text-sm text-faint">{t('emptyFilter')}</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {filtered.map((commission) => {
                const order = commission.order
                return (
                  <div key={commission.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-faint">
                          #{commission.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLS[commission.status]}`}>
                          {STATUS_LABEL[commission.status]}
                        </span>
                      </div>
                      {order && (
                        <p className="text-sm text-foreground">
                          {order.customer_name} · {order.customer_city} · ×{order.quantity}
                        </p>
                      )}
                      <p className="text-xs text-faint mt-0.5">
                        {fmtDate(commission.created_at)}
                        {commission.paid_at && (
                          <> · {t('paidOn', { date: fmtDate(commission.paid_at) })}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-base font-bold text-foreground tabular-nums">
                        {formatMAD(Number(commission.amount))}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Payout history */}
        {payouts.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                {t('payoutsTitle', { count: payouts.length })}
              </h2>
              <Link
                href="/affiliate/statements"
                className="text-xs text-primary hover:underline font-medium shrink-0"
              >
                {t('statementsLink')}
              </Link>
            </div>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {payouts.map((payout) => {
                const cls = PAYOUT_CLS[payout.status] ?? 'bg-surface-2 text-muted border-line'
                const label = PAYOUT_LABEL[payout.status] ?? payout.status
                return (
                  <div key={payout.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-faint">
                          #{payout.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-faint">
                        {fmtDate(payout.created_at)}
                        {payout.reference && (
                          <> · {t('payoutRef', { ref: payout.reference })}</>
                        )}
                        {payout.notes && <> · {payout.notes}</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-base font-bold text-success-fg tabular-nums">
                        +{formatMAD(Number(payout.amount))}
                      </p>
                      {payout.paid_at && (
                        <p className="text-xs text-faint mt-0.5">
                          {t('payoutPaidOn', { date: fmtDateShort(payout.paid_at) })}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
