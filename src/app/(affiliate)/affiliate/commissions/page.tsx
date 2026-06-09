import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
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
    pending:  'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    paid:     'bg-green-100 text-green-700',
  }

  const PAYOUT_LABEL: Record<string, string> = {
    pending:    t('payoutStatusPending'),
    processing: t('payoutStatusProcessing'),
    paid:       t('payoutStatusPaid'),
  }

  const PAYOUT_CLS: Record<string, string> = {
    pending:    'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    paid:       'bg-green-100 text-green-700',
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/affiliate/dashboard"><MozounaLogo size="sm" /></Link>
            <span className="text-gray-300 shrink-0">{tCommon('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm truncate">{t('pageTitle')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                {tCommon('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Balance highlight */}
        <div className={`rounded-xl border p-5 ${
          pendingBalance > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-gray-200'
        }`}>
          <p className="text-xs text-gray-500">{t('pendingBalanceLabel')}</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${
            pendingBalance > 0 ? 'text-amber-700' : 'text-gray-400'
          }`}>
            {formatMAD(pendingBalance)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{t('pendingBalanceNote')}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700">{t('statPending')}</p>
            <p className="mt-1 text-xl font-bold text-amber-800 tabular-nums">{formatMAD(totalPending)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{t('statPendingCount', { count: countByStatus.pending ?? 0 })}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-700">{t('statApproved')}</p>
            <p className="mt-1 text-xl font-bold text-blue-800 tabular-nums">{formatMAD(totalApproved)}</p>
            <p className="text-xs text-blue-600 mt-0.5">{t('statApprovedCount', { count: countByStatus.approved ?? 0 })}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-700">{t('statPaid')}</p>
            <p className="mt-1 text-xl font-bold text-green-800 tabular-nums">{formatMAD(totalPaid)}</p>
            <p className="text-xs text-green-600 mt-0.5">{t('statPaidCount', { count: countByStatus.paid ?? 0 })}</p>
          </div>
        </div>

        {/* Commission list */}
        <section>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <Link
              href={buildHref({})}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !filterStatus
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
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
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t('filterLabel', { label: STATUS_LABEL[s], count: countByStatus[s] ?? 0 })}
              </Link>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-400">{t('emptyFilter')}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {filtered.map((commission) => {
                const order = commission.order
                return (
                  <div key={commission.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">
                          #{commission.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLS[commission.status]}`}>
                          {STATUS_LABEL[commission.status]}
                        </span>
                      </div>
                      {order && (
                        <p className="text-sm text-gray-700">
                          {order.customer_name} · {order.customer_city} · ×{order.quantity}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(commission.created_at)}
                        {commission.paid_at && (
                          <> · {t('paidOn', { date: fmtDate(commission.paid_at) })}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-base font-bold text-gray-900 tabular-nums">
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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              {t('payoutsTitle', { count: payouts.length })}
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {payouts.map((payout) => {
                const cls = PAYOUT_CLS[payout.status] ?? 'bg-gray-100 text-gray-600'
                const label = PAYOUT_LABEL[payout.status] ?? payout.status
                return (
                  <div key={payout.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">
                          #{payout.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {fmtDate(payout.created_at)}
                        {payout.reference && (
                          <> · {t('payoutRef', { ref: payout.reference })}</>
                        )}
                        {payout.notes && <> · {payout.notes}</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-base font-bold text-green-700 tabular-nums">
                        +{formatMAD(Number(payout.amount))}
                      </p>
                      {payout.paid_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
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
