import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { labelPurchaseProfile, labelVolumeTier } from '@/lib/rfq-buyer-intake'
import { PAYOUT_STATUS_CLS } from '@/components/admin/supplier-payout-form'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { SupplierQuoteRequest, SupplierProduct, SupplierQuoteRequestStatus, SupplierPayoutStatus, Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierQuotes')
  return { title: t('metaTitle') }
}

function getStatusBadgeI18n(status: SupplierQuoteRequestStatus, t: Awaited<ReturnType<typeof getTranslations<'admin.supplierQuoteDetail'>>>): { label: string; cls: string } {
  const map: Record<SupplierQuoteRequestStatus, { labelKey: string; cls: string }> = {
    new:       { labelKey: 'statusNew',      cls: 'bg-surface-2 text-muted border border-line' },
    studying:  { labelKey: 'statusStudying', cls: 'bg-warning-soft text-warning-fg border border-warning' },
    quoted:    { labelKey: 'statusQuoted',   cls: 'bg-surface-2 text-foreground border border-line' },
    approved:  { labelKey: 'statusApproved', cls: 'bg-success-soft text-success-fg border border-success' },
    rejected:  { labelKey: 'statusRejected', cls: 'bg-danger-soft text-danger-fg border border-danger' },
  }
  const entry = map[status]
  return { label: t(entry.labelKey as Parameters<typeof t>[0]), cls: entry.cls }
}

type QuoteRow = SupplierQuoteRequest & {
  supplier_product: Pick<SupplierProduct, 'id' | 'product_name' | 'supplier_id'> & {
    supplier: Pick<Profile, 'id' | 'full_name'> | null
  } | null
}

interface PageProps {
  searchParams: Promise<{ payout?: string }>
}

export default async function AdminSupplierQuotesPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()
  const t = await getTranslations('admin.supplierQuotes')
  const td = await getTranslations('admin.supplierQuoteDetail')
  const tc = await getTranslations('admin.common')
  const tp = await getTranslations('admin.supplierPayoutForm')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  let query = supabase
    .from('supplier_quote_requests')
    .select(`
      *,
      supplier_product:supplier_products!supplier_product_id(
        id, product_name, supplier_id,
        supplier:profiles!supplier_id(id, full_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.payout) {
    query = query.eq('supplier_payout_status', filters.payout)
  }

  const { data } = await query
  const quotes = (data ?? []) as unknown as QuoteRow[]

  // Analytics summary — ARGENT: calculs inchangés
  const totalDue = quotes
    .filter((q) => ['pending', 'partially_paid'].includes(q.supplier_payout_status))
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
  const totalPaid = quotes
    .filter((q) => q.supplier_payout_status === 'paid')
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
  const totalCommission = quotes
    .reduce((s, q) => s + (q.platform_commission_amount_mad ?? 0), 0)

  const payoutFilterLabels: Record<string, string> = {
    '':              t('filterAll'),
    not_due:        tp('status.not_due'),
    pending:        tp('status.pending'),
    partially_paid: tp('status.partially_paid'),
    paid:           tp('status.paid'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('subtitle')}{' '}
            <Link href="/admin/quote-requests" className="underline underline-offset-2 hover:text-foreground">
              {t('internalQuotesLink')}
            </Link>
          </p>
        </div>

        {/* Analytics strip — ARGENT: valeurs inchangées */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-warning p-4">
            <p className="text-xs text-muted mb-1">{t('kpiDue')}</p>
            <p className="text-xl font-bold text-warning-fg tabular-nums">{formatMAD(totalDue)}</p>
          </div>
          <div className="bg-surface rounded-xl border border-success p-4">
            <p className="text-xs text-muted mb-1">{t('kpiPaid')}</p>
            <p className="text-xl font-bold text-success-fg tabular-nums">{formatMAD(totalPaid)}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-4">
            <p className="text-xs text-muted mb-1">{t('kpiCommission')}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{formatMAD(totalCommission)}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          {(['', 'not_due', 'pending', 'partially_paid', 'paid'] as const).map((s) => (
            <Link
              key={s}
              href={s ? `/admin/supplier-quotes?payout=${s}` : '/admin/supplier-quotes'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (filters.payout ?? '') === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-muted border-line hover:border-foreground'
              }`}
            >
              {payoutFilterLabels[s]}
            </Link>
          ))}
        </div>

        {quotes.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('empty')}</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {quotes.map((q) => {
              const payoutCls = PAYOUT_STATUS_CLS[q.supplier_payout_status]
              const statusBadge = getStatusBadgeI18n(q.status, td)
              return (
                <div key={q.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-foreground text-sm truncate max-w-[200px]">
                        {q.supplier_product?.product_name ?? tc('productFallback')}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                        {statusBadge.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${payoutCls}`}>
                        {tp(`status.${q.supplier_payout_status}` as Parameters<typeof tp>[0])}
                      </span>
                    </div>
                    <p className="text-xs text-muted flex flex-wrap gap-x-2">
                      <span>{t('supplier')} : {q.supplier_product?.supplier?.full_name ?? '—'}</span>
                      <span className="text-faint">·</span>
                      <span>{t('units', { qty: q.quantity_requested })}</span>
                      {q.buyer_purchase_profile && (
                        <>
                          <span className="text-faint">·</span>
                          <span>{labelPurchaseProfile(q.buyer_purchase_profile)}</span>
                        </>
                      )}
                      {q.buyer_volume_tier && (
                        <>
                          <span className="text-faint">·</span>
                          <span>{labelVolumeTier(q.buyer_volume_tier)}</span>
                        </>
                      )}
                      {q.quoted_unit_price_mad != null && (
                        <>
                          <span className="text-faint">·</span>
                          <span>{formatMAD(q.quoted_unit_price_mad)}/u</span>
                        </>
                      )}
                      {q.supplier_payout_amount_mad != null && (
                        <>
                          <span className="text-faint">·</span>
                          <span className="font-medium text-foreground">
                            {t('payout', { amount: formatMAD(q.supplier_payout_amount_mad) })}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-faint mt-0.5">
                      {new Date(q.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/supplier-quotes/${q.id}`}
                    className="shrink-0 text-xs px-3 py-1.5 bg-surface-2 hover:bg-line text-foreground rounded-lg transition-colors font-medium"
                  >
                    {locale === 'ar' ? t('detailAr') : t('detail')}
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
