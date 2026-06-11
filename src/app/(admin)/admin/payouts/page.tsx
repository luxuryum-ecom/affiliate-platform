import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { CreatePayoutForm } from '@/components/admin/create-payout-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Payout, Profile, PayoutStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.payouts')
  return { title: t('metaTitle') }
}

// CSS-only map — labels resolved via t() at render
const STATUS_CLS: Record<PayoutStatus, string> = {
  pending:    'bg-warning-soft text-warning-fg border border-warning',
  processing: 'bg-surface-2 text-foreground border border-line',
  paid:       'bg-success-soft text-success-fg border border-success',
}

type PayoutRow = Payout & { affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null }

export default async function AdminPayoutsPage() {
  const supabase = await createClient()
  const t = await getTranslations('admin.payouts')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  // All approved affiliates with their approved commission totals
  const [affiliatesRes, commissionsRes, payoutsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'affiliate')
      .eq('status', 'approved')
      .order('full_name') as unknown as Promise<{ data: Pick<Profile, 'id' | 'full_name' | 'phone'>[] | null; error: unknown }>,

    supabase
      .from('commissions')
      .select('affiliate_id, amount, status') as unknown as Promise<{
        data: { affiliate_id: string; amount: number; status: string }[] | null
        error: unknown
      }>,

    supabase
      .from('payouts')
      .select('*, affiliate:profiles!affiliate_id(id, full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(200) as unknown as Promise<{ data: PayoutRow[] | null; error: unknown }>,
  ])

  const affiliateRows = affiliatesRes.data ?? []
  const allCommissions = commissionsRes.data ?? []
  const payouts = payoutsRes.data ?? []

  // Build per-affiliate commission stats — ARGENT: calculs inchangés
  const approvedByAffiliate = allCommissions.reduce<
    Record<string, { total: number; count: number }>
  >((acc, c) => {
    if (c.status !== 'approved') return acc
    acc[c.affiliate_id] ??= { total: 0, count: 0 }
    acc[c.affiliate_id].total += Number(c.amount)
    acc[c.affiliate_id].count += 1
    return acc
  }, {})

  const affiliatesForForm = affiliateRows.map((a) => ({
    id: a.id,
    full_name: a.full_name,
    approvedCommissionTotal: approvedByAffiliate[a.id]?.total ?? 0,
    approvedCommissionCount: approvedByAffiliate[a.id]?.count ?? 0,
  }))

  // Summary totals — ARGENT: calculs inchangés
  const totalPaid = payouts
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0)
  const pendingApprovedTotal = Object.values(approvedByAffiliate).reduce(
    (s, v) => s + v.total,
    0
  )

  function statusLabel(s: PayoutStatus) {
    if (s === 'pending')    return t('statusPending')
    if (s === 'processing') return t('statusProcessing')
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

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-warning-soft border border-warning rounded-xl p-4">
            <p className="text-xs text-warning-fg">{t('kpiApprovedLabel')}</p>
            {/* ARGENT: formatMAD inchangé */}
            <p className="mt-1 text-2xl font-bold text-warning-fg tabular-nums">
              {formatMAD(pendingApprovedTotal)}
            </p>
            <p className="text-xs text-warning-fg/80 mt-0.5">
              {t('kpiApprovedAffiliates', {
                count: affiliatesForForm.filter((a) => a.approvedCommissionCount > 0).length,
              })}
            </p>
          </div>
          <div className="bg-success-soft border border-success rounded-xl p-4">
            <p className="text-xs text-success-fg">{t('kpiPaidLabel')}</p>
            {/* ARGENT: formatMAD inchangé */}
            <p className="mt-1 text-2xl font-bold text-success-fg tabular-nums">
              {formatMAD(totalPaid)}
            </p>
            <p className="text-xs text-success-fg/80 mt-0.5">
              {t('kpiPaidCount', { count: payouts.filter((p) => p.status === 'paid').length })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Create payout form — left panel */}
          <div className="lg:col-span-2">
            <div className="bg-surface rounded-xl border border-line p-5 sticky top-20">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('createPanelTitle')}</h2>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                {t('createPanelDescription')}
              </p>
              <CreatePayoutForm affiliates={affiliatesForForm} />
            </div>
          </div>

          {/* Payout history — right panel */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t('historyTitle', { count: payouts.length })}
            </h2>

            {payouts.length === 0 ? (
              <div className="bg-surface rounded-xl border border-line p-12 text-center">
                <p className="text-sm text-faint">{t('historyEmpty')}</p>
              </div>
            ) : (
              <div className="bg-surface rounded-xl border border-line divide-y divide-line">
                {payouts.map((payout) => {
                  const badgeCls = STATUS_CLS[payout.status]
                  const affiliate = payout.affiliate
                  return (
                    <div key={payout.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-mono text-faint">
                              #{payout.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCls}`}>
                              {statusLabel(payout.status)}
                            </span>
                          </div>
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
                          <p className="text-xs text-muted mt-0.5">
                            {new Date(payout.created_at).toLocaleDateString(locale, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {payout.reference && (
                              <> · {t('ref', { ref: payout.reference })}</>
                            )}
                            {payout.notes && <> · {payout.notes}</>}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {/* ARGENT: formatMAD inchangé */}
                          <p className="text-base font-bold text-foreground tabular-nums">
                            {formatMAD(Number(payout.amount))}
                          </p>
                          {payout.paid_at && (
                            <p className="text-xs text-faint mt-0.5">
                              {t('paidAt', {
                                date: new Date(payout.paid_at).toLocaleDateString(locale, {
                                  day: '2-digit',
                                  month: 'short',
                                }),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
