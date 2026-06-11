import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { CommissionStatusForm } from '@/components/admin/commission-status-form'
import { BulkApproveButton } from '@/components/admin/bulk-approve-button'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Commission, Profile, Order, CommissionStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.commissions')
  return { title: t('metaTitle') }
}

// CSS-only map — no labels in JS (resolved via t() at render)
const STATUS_CLS: Record<CommissionStatus, string> = {
  pending:  'bg-warning-soft text-warning-fg border border-warning',
  approved: 'bg-success-soft text-success-fg border border-success',
  paid:     'bg-success-soft text-success-fg border border-success',
}

type CommissionRow = Commission & {
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
  order: Pick<Order, 'id' | 'customer_name' | 'customer_city' | 'quantity' | 'total_amount' | 'status' | 'created_at'> | null
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    affiliate_id?: string
  }>
}

const STATUSES: CommissionStatus[] = ['pending', 'approved', 'paid']

export default async function AdminCommissionsPage({ searchParams }: PageProps) {
  const { status: filterStatus, affiliate_id } = await searchParams
  const supabase = await createClient()
  const t = await getTranslations('admin.commissions')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  // Affiliates for filter dropdown
  const { data: affiliateRows } = (await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'affiliate')
    .eq('status', 'approved')
    .order('full_name')) as { data: { id: string; full_name: string }[] | null; error: unknown }
  const affiliates = affiliateRows ?? []

  // Build commissions query
  let query = supabase
    .from('commissions')
    .select(`
      *,
      affiliate:profiles!affiliate_id(id, full_name, phone),
      order:orders!order_id(id, customer_name, customer_city, quantity, total_amount, status, created_at)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  if (filterStatus && STATUSES.includes(filterStatus as CommissionStatus)) {
    query = query.eq('status', filterStatus)
  }
  if (affiliate_id) {
    query = query.eq('affiliate_id', affiliate_id)
  }

  const { data: rows } = (await query) as { data: CommissionRow[] | null; error: unknown }
  const list = rows ?? []

  // Totals over full dataset (unfiltered) — ARGENT: calculs inchangés
  const { data: allRows } = (await supabase
    .from('commissions')
    .select('status, amount')) as { data: { status: CommissionStatus; amount: number }[] | null; error: unknown }
  const all = allRows ?? []

  const totalPending  = all.filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0)
  const totalApproved = all.filter((c) => c.status === 'approved').reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid     = all.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0)
  const countMap = all.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  const isFiltered = !!(filterStatus || affiliate_id)

  // IDs of pending commissions in the current view — passed to bulk-approve button.
  const pendingIdsInView = list
    .filter((c) => c.status === 'pending')
    .map((c) => c.id)

  function buildHref(params: { status?: string; affiliate_id?: string }) {
    const p = new URLSearchParams()
    if (params.status) p.set('status', params.status)
    if (params.affiliate_id) p.set('affiliate_id', params.affiliate_id)
    const s = p.toString()
    return `/admin/commissions${s ? `?${s}` : ''}`
  }

  // i18n status label helper
  function statusLabel(s: CommissionStatus) {
    if (s === 'pending')  return t('statusPending')
    if (s === 'approved') return t('statusApproved')
    return t('statusPaid')
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        userName={profileData?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-warning-soft border border-warning rounded-xl p-4">
            <p className="text-xs text-warning-fg">{t('kpiPending')}</p>
            {/* ARGENT: formatMAD inchangé */}
            <p className="mt-1 text-xl font-bold text-warning-fg tabular-nums">{formatMAD(totalPending)}</p>
            <p className="text-xs text-warning-fg/80 mt-0.5">{t('kpiCount', { count: countMap.pending ?? 0 })}</p>
          </div>
          <div className="bg-surface-2 border border-line rounded-xl p-4">
            <p className="text-xs text-muted">{t('kpiApproved')}</p>
            {/* ARGENT: formatMAD inchangé */}
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{formatMAD(totalApproved)}</p>
            <p className="text-xs text-muted mt-0.5">{t('kpiCount', { count: countMap.approved ?? 0 })}</p>
          </div>
          <div className="bg-success-soft border border-success rounded-xl p-4">
            <p className="text-xs text-success-fg">{t('kpiPaid')}</p>
            {/* ARGENT: formatMAD inchangé */}
            <p className="mt-1 text-xl font-bold text-success-fg tabular-nums">{formatMAD(totalPaid)}</p>
            <p className="text-xs text-success-fg/80 mt-0.5">{t('kpiCount', { count: countMap.paid ?? 0 })}</p>
          </div>
        </div>

        {/* Affiliate filter */}
        {affiliates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-muted shrink-0">{t('affiliateLabel')}</span>
            <Link
              href={buildHref({ status: filterStatus })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !affiliate_id
                  ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 transition-opacity'
                  : 'bg-surface border-line text-muted hover:bg-surface-2'
              }`}
            >
              {t('allAffiliates')}
            </Link>
            {affiliates.map((a) => (
              <Link
                key={a.id}
                href={buildHref({ status: filterStatus, affiliate_id: a.id })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  affiliate_id === a.id
                    ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 transition-opacity'
                    : 'bg-surface border-line text-muted hover:bg-surface-2'
                }`}
              >
                {a.full_name}
              </Link>
            ))}
          </div>
        )}

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={buildHref({ affiliate_id })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterStatus
                ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 transition-opacity'
                : 'bg-surface border-line text-muted hover:bg-surface-2'
            }`}
          >
            {tc('all')} ({all.length})
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s, affiliate_id })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary hover:opacity-90 transition-opacity'
                  : 'bg-surface border-line text-muted hover:bg-surface-2'
              }`}
            >
              {statusLabel(s)} ({countMap[s] ?? 0})
            </Link>
          ))}
        </div>

        {/* Results header + bulk action */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-xs text-muted">
            {isFiltered
              ? t('resultFiltered', { count: list.length })
              : t('resultCount', { count: list.length })}
          </p>
          <BulkApproveButton pendingIds={pendingIdsInView} />
        </div>

        {/* Commission list */}
        {list.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">
              {isFiltered ? t('emptyFiltered') : t('empty')}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {list.map((commission) => {
              const badgeCls = STATUS_CLS[commission.status]
              const order = commission.order
              const affiliate = commission.affiliate

              return (
                <div key={commission.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">

                    {/* Left: commission info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-xs font-mono text-faint">
                          #{commission.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>
                          {statusLabel(commission.status)}
                        </span>
                        {/* ARGENT: formatMAD inchangé */}
                        <span className="text-xs font-bold text-foreground tabular-nums ml-auto sm:ml-0">
                          {formatMAD(Number(commission.amount))}
                        </span>
                      </div>

                      {/* Affiliate */}
                      {affiliate && (
                        <p className="text-sm font-medium text-foreground">
                          {affiliate.full_name}
                          {affiliate.phone && (
                            <span className="text-xs text-faint font-normal ml-1.5">
                              {affiliate.phone}
                            </span>
                          )}
                        </p>
                      )}

                      {/* Order details */}
                      {order && (
                        <p className="text-xs text-muted mt-0.5">
                          {t('order')}{' '}
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-gold-500 hover:text-gold-600 font-mono"
                          >
                            #{order.id.slice(0, 8).toUpperCase()}
                          </Link>
                          {' · '}{order.customer_name}
                          {' · '}{order.customer_city}
                          {' · '}×{order.quantity}
                          {/* ARGENT: formatMAD inchangé */}
                          {' · '}<strong className="text-foreground">{formatMAD(order.total_amount)}</strong>
                        </p>
                      )}

                      <p className="text-xs text-faint mt-0.5">
                        {t('createdAt', {
                          date: new Date(commission.created_at).toLocaleDateString(locale, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }),
                        })}
                        {commission.paid_at && (
                          <> · {t('paidAt', {
                            date: new Date(commission.paid_at).toLocaleDateString(locale, {
                              day: '2-digit', month: 'short', year: 'numeric',
                            }),
                          })}</>
                        )}
                      </p>
                    </div>

                    {/* Right: action buttons */}
                    <div className="shrink-0">
                      <CommissionStatusForm commission={commission} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
