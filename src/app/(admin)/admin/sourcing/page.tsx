import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeSourcingMatches } from '@/app/actions/sourcing'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import SelectSupplierButton from './SelectSupplierButton'
import type {
  SourcingRequest,
  SourcingRequestStatus,
  Profile,
  ScoredSupplier,
  Product,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.sourcing')
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

type RequestRow = SourcingRequest & {
  wholesaler: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'> | null
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

export default async function AdminSourcingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  const t  = await getTranslations('admin.sourcing')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  function statusLabel(status: SourcingRequestStatus): string {
    const map: Record<SourcingRequestStatus, string> = {
      pending:  t('statusPending'),
      matching: t('statusMatching'),
      matched:  t('statusMatched'),
      quoted:   t('statusQuoted'),
      closed:   t('statusClosed'),
    }
    return map[status] ?? status
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const [
    { data: allData },
    { count: totalCount },
    { count: matchedCount },
    { count: quotedCount },
  ] = await Promise.all([
    supabase
      .from('sourcing_requests')
      .select('*, wholesaler:profiles!wholesaler_id(id,full_name,phone,company_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }).in('status', ['matched', 'quoted']),
    supabase.from('sourcing_requests').select('*', { count: 'exact', head: true }).eq('status', 'quoted'),
  ])

  const requests = (allData ?? []) as unknown as RequestRow[]

  const total    = totalCount ?? 0
  const matched  = matchedCount ?? 0
  const quoted   = quotedCount ?? 0
  const convRate = total > 0 ? Math.round((quoted / total) * 100) : 0

  // ── Products (for convert-to-quote form) ──────────────────────────────────
  const { data: productsData } = await supabase
    .from('products')
    .select('id, name')
    .eq('approval_status', 'approved')
    .eq('availability_type', 'import_on_demand')
    .order('name')

  const products = (productsData ?? []) as unknown as Pick<Product, 'id' | 'name'>[]

  // ── Compute matches for pending requests (top 3 each) ───────────────────
  const pendingIds = requests.filter((r) => r.status === 'pending').map((r) => r.id)
  const matchesMap = new Map<string, ScoredSupplier[]>()
  await Promise.all(
    pendingIds.map(async (id) => {
      const matches = await computeSourcingMatches(id)
      matchesMap.set(id, matches.slice(0, 3))
    })
  )

  const stats = [
    { label: t('statReceived'),   value: String(total),    highlight: false },
    { label: t('statMatched'),    value: String(matched),  highlight: matched > 0 },
    { label: t('statQuoted'),     value: String(quoted),   highlight: false },
    { label: t('statConvRate'),   value: `${convRate}%`,   highlight: false },
  ]

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

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border p-4 ${s.highlight ? 'bg-warning-subtle border-warning-line' : 'bg-surface border-line'}`}
            >
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`mt-1.5 text-2xl font-bold tabular-nums ${s.highlight ? 'text-warning-dark' : 'text-foreground'}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Requests list */}
        {requests.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const badgeCls = STATUS_BADGE_CLS[r.status]
              const matches  = matchesMap.get(r.id) ?? []

              return (
                <div key={r.id} className="bg-surface rounded-xl border border-line overflow-hidden">
                  {/* Header */}
                  <div className="p-5 border-b border-line">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{r.product_name}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {r.category} · {t('units', { qty: r.quantity })} · {t('budgetPerUnit', { amount: Number(r.target_budget_mad).toFixed(2) })}
                          {r.target_country ? ` · ${r.target_country}` : ''}
                        </p>
                        {r.wholesaler && (
                          <p className="text-xs text-faint mt-1">
                            {r.wholesaler.full_name}
                            {r.wholesaler.company_name ? ` (${r.wholesaler.company_name})` : ''}
                            {r.wholesaler.phone ? ` · ${r.wholesaler.phone}` : ''}
                          </p>
                        )}
                        {r.notes && (
                          <p className="text-xs text-muted mt-1 italic">&ldquo;{r.notes}&rdquo;</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${badgeCls}`}>
                          {statusLabel(r.status)}
                        </span>
                        <Link
                          href={`/admin/sourcing/${r.id}`}
                          className="text-xs px-3 py-1.5 bg-surface-2 hover:bg-line text-foreground rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-gold-400"
                        >
                          {t('detailLink')}
                        </Link>
                      </div>
                    </div>
                    {r.delivery_deadline && (
                      <p className="text-xs text-faint mt-2">
                        {t('deadline', { date: new Date(r.delivery_deadline).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                      </p>
                    )}
                  </div>

                  {/* Matched suppliers (for pending requests) */}
                  {matches.length > 0 && (
                    <div className="p-5 border-b border-line">
                      <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">
                        {t('bestSuppliers')}
                      </p>
                      <div className="space-y-3">
                        {matches.map((m, idx) => (
                          <div key={m.supplierId} className="rounded-lg border border-line p-3">
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
                              <span>{t('scoreCategory', { val: m.scoreBreakdown.categoryMatch })}</span>
                              <span>{t('scoreCountry', { val: m.scoreBreakdown.countryMatch })}</span>
                              <span>{t('scoreReliability', { val: m.scoreBreakdown.reliability })}</span>
                              <span>{t('scoreMoq', { val: m.scoreBreakdown.moqCompatibility })}</span>
                              <span>{t('scorePerf', { val: m.scoreBreakdown.performance })}</span>
                              {m.minMoq != null && <span>{t('minMoq', { val: m.minMoq })}</span>}
                            </div>
                            <p className="text-xs text-faint mt-1">
                              {m.categories} · {m.countries}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Convert to quote */}
                  {(r.status === 'pending' || r.status === 'matched') && products.length > 0 && (
                    <div className="p-5 bg-surface-2">
                      <p className="text-xs font-semibold text-muted mb-3">{t('createQuote')}</p>
                      <form action="/admin/sourcing/convert" method="POST" className="flex flex-wrap gap-3 items-end">
                        <input type="hidden" name="sourcing_request_id" value={r.id} />
                        <input type="hidden" name="quantity" value={r.quantity} />
                        <input type="hidden" name="target_budget_mad" value={r.target_budget_mad} />
                        <input type="hidden" name="notes" value={r.notes ?? ''} />
                        <div>
                          <label className="block text-xs text-muted mb-1">{t('catalogProduct')}</label>
                          <select
                            name="product_id"
                            className="border border-line rounded-lg px-3 py-2 text-xs bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                          >
                            <option value="">{t('chooseProduct')}</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <Link
                          href="/admin/quote-requests"
                          className="text-xs px-3 py-2 bg-surface-2 text-muted hover:bg-line rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
                        >
                          {t('viewQuotes')}
                        </Link>
                      </form>
                    </div>
                  )}

                  {r.status === 'quoted' && r.quote_request_id && (
                    <div className="p-4 bg-success-subtle border-t border-success-line">
                      <p className="text-xs text-success-dark">
                        {t('quotedBanner')}{' '}
                        <Link href="/admin/quote-requests" className="underline font-medium text-success-dark hover:text-success transition-colors">
                          {t('quotedLink')}
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
