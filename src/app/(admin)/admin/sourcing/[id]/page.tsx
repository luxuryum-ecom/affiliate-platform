import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeSourcingMatches } from '@/app/actions/sourcing'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import SelectSupplierButton from '../SelectSupplierButton'
import type {
  SourcingRequest,
  SourcingRequestStatus,
  Profile,
  ScoredSupplier,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.sourcingDetail')
  return { title: t('metaTitle') }
}

// CSS only — no label in this map (labels via t())
const STATUS_BADGE_CLS: Record<SourcingRequestStatus, string> = {
  pending:  'bg-surface-2 text-muted border border-line',
  matching: 'bg-warning-subtle text-warning border border-warning-line',
  matched:  'bg-warning-subtle text-warning-dark border border-warning-line',
  quoted:   'bg-success-subtle text-success border border-success-line',
  closed:   'bg-surface-2 text-faint border border-line',
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? 'bg-success' : score >= 35 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface-2 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-foreground tabular-nums w-6 text-right">{score}</span>
    </div>
  )
}

type RequestRow = SourcingRequest & {
  wholesaler: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'> & { email?: string } | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSourcingDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  const t  = await getTranslations('admin.sourcingDetail')
  const ts = await getTranslations('admin.sourcing')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  function statusLabel(status: SourcingRequestStatus): string {
    const map: Record<SourcingRequestStatus, string> = {
      pending:  ts('statusPending'),
      matching: ts('statusMatching'),
      matched:  ts('statusMatched'),
      quoted:   ts('statusQuoted'),
      closed:   ts('statusClosed'),
    }
    return map[status] ?? status
  }

  const { data } = await supabase
    .from('sourcing_requests')
    .select('*, wholesaler:profiles!wholesaler_id(id,full_name,phone,company_name)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const r = data as unknown as RequestRow

  const matches: ScoredSupplier[] = r.status === 'pending' || r.status === 'matching'
    ? (await computeSourcingMatches(id)).slice(0, 5)
    : []

  const badgeCls = STATUS_BADGE_CLS[r.status]

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={r.product_name}
        backHref="/admin/sourcing"
        backLabel={t('backLabel')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Status + date */}
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${badgeCls}`}>
            {statusLabel(r.status)}
          </span>
          <span className="text-xs text-faint">
            {t('receivedAt', { date: new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Request details */}
          <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">{t('requestTitle')}</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('productLabel')}</dt>
                <dd className="font-medium text-foreground text-right">{r.product_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('categoryLabel')}</dt>
                <dd className="font-medium text-foreground text-right">{r.category}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('quantityLabel')}</dt>
                <dd className="font-medium text-foreground text-right">
                  {t('quantityValue', { qty: r.quantity })}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('budgetLabel')}</dt>
                <dd className="font-medium text-foreground text-right">
                  {t('budgetValue', { amount: Number(r.target_budget_mad).toFixed(2) })}
                </dd>
              </div>
              {r.target_country && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('targetCountry')}</dt>
                  <dd className="font-medium text-foreground text-right">{r.target_country}</dd>
                </div>
              )}
              {r.delivery_deadline && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('deadline')}</dt>
                  <dd className="font-medium text-foreground text-right">
                    {new Date(r.delivery_deadline).toLocaleDateString(locale)}
                  </dd>
                </div>
              )}
            </dl>
            {r.notes && (
              <div className="pt-3 border-t border-line">
                <p className="text-xs text-muted mb-1">{t('wholesalerNotes')}</p>
                <p className="text-sm text-foreground italic">&ldquo;{r.notes}&rdquo;</p>
              </div>
            )}
            {r.admin_notes && (
              <div className="pt-3 border-t border-line">
                <p className="text-xs text-muted mb-1">{t('adminNotes')}</p>
                <p className="text-sm text-foreground">{r.admin_notes}</p>
              </div>
            )}
          </div>

          {/* Wholesaler contact */}
          <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">{t('contactTitle')}</h2>
            {r.wholesaler ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{tc('name')}</dt>
                  <dd className="font-medium text-foreground text-right">{r.wholesaler.full_name}</dd>
                </div>
                {r.wholesaler.company_name && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t('companyLabel')}</dt>
                    <dd className="font-medium text-foreground text-right">{r.wholesaler.company_name}</dd>
                  </div>
                )}
                {r.wholesaler.phone && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t('phoneLabel')}</dt>
                    <dd className="text-right">
                      <a
                        href={`tel:${r.wholesaler.phone}`}
                        className="font-medium text-gold-500 hover:text-gold-600 transition-colors"
                      >
                        {r.wholesaler.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-faint">{t('noWholesaler')}</p>
            )}

            <div className="pt-3 border-t border-line space-y-2">
              <p className="text-xs font-medium text-muted">{t('actionsTitle')}</p>
              <Link
                href="/admin/quote-requests"
                className="block w-full text-center text-xs px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                {t('viewQuoteRequests')}
              </Link>
              <Link
                href="/admin/supplier-quotes"
                className="block w-full text-center text-xs px-3 py-2 bg-surface-2 text-muted hover:bg-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                {t('viewMarketplaceQuotes')}
              </Link>
            </div>
          </div>
        </div>

        {/* Matched suppliers */}
        {matches.length > 0 && (
          <div className="bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {t('suppliersTitle')}{' '}
              <span className="text-xs font-normal text-faint">{t('suppliersConfidential')}</span>
            </h2>
            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div key={m.supplierId} className="rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-faint font-semibold w-4">#{idx + 1}</span>
                      <p className="text-sm font-medium text-foreground">{m.supplierName}</p>
                    </div>
                    <SelectSupplierButton
                      requestId={r.id}
                      supplierId={m.supplierId}
                      isSelected={r.selected_supplier_id === m.supplierId}
                    />
                  </div>
                  <ScoreBar score={m.matchScore} />
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted">
                    <span>{ts('scoreCategory', { val: m.scoreBreakdown.categoryMatch })}</span>
                    <span>{ts('scoreCountry', { val: m.scoreBreakdown.countryMatch })}</span>
                    <span>{ts('scoreReliability', { val: m.scoreBreakdown.reliability })}</span>
                    <span>{ts('scoreMoq', { val: m.scoreBreakdown.moqCompatibility })}</span>
                    <span>{ts('scorePerf', { val: m.scoreBreakdown.performance })}</span>
                    {m.minMoq != null && <span>{ts('minMoq', { val: m.minMoq })}</span>}
                  </div>
                  <p className="text-xs text-faint mt-1">
                    {m.categories} · {m.countries}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.status === 'quoted' && r.quote_request_id && (
          <div className="bg-success-subtle border border-success-line rounded-xl p-4">
            <p className="text-sm text-success-dark">
              {t('quotedBanner')}{' '}
              <Link href="/admin/quote-requests" className="underline font-medium text-success-dark hover:text-success transition-colors">
                {t('quotedLink')}
              </Link>
            </p>
          </div>
        )}

      </main>
    </div>
  )
}
