import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { Profile, SupplierProduct, SupplierQuoteRequest } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplier.analytics')
  return { title: t('metaTitle') }
}

export default async function SupplierAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'supplier') redirect('/login')

  // ── Products ────────────────────────────────────────────────────────────────
  // Fuite M1 (mig 116) : lecture via la vue redacted OWNER (plus de SELECT base).
  const { data: productsData } = await supabase
    .from('supplier_products_owner_read')
    .select('id, product_name, approval_status, created_at')
    .eq('supplier_id', user.id)
    .order('created_at', { ascending: false })

  const products = (productsData ?? []) as Pick<SupplierProduct, 'id' | 'product_name' | 'approval_status' | 'created_at'>[]
  const approvedProducts  = products.filter((p) => p.approval_status === 'approved')
  const pendingProducts   = products.filter((p) => p.approval_status === 'pending_review')
  const rejectedProducts  = products.filter((p) => p.approval_status === 'blocked')
  const approvedIds       = approvedProducts.map((p) => p.id)

  // ── Quote requests for approved products ─────────────────────────────────────
  type QuoteRow = Pick<SupplierQuoteRequest, 'id' | 'supplier_product_id' | 'quantity_requested' | 'status' | 'supplier_payout_amount_mad' | 'created_at'>
  let quotes: QuoteRow[] = []

  if (approvedIds.length > 0) {
    const { data: quotesData } = await supabase
      .from('supplier_quote_requests_supplier_read')
      .select('id, supplier_product_id, quantity_requested, status, supplier_payout_amount_mad, created_at')
      .in('supplier_product_id', approvedIds)
      .order('created_at', { ascending: false })
    quotes = (quotesData ?? []) as QuoteRow[]
  }

  const totalQuotes     = quotes.length
  const approvedQuotes  = quotes.filter((q) => q.status === 'approved').length
  const newQuotes       = quotes.filter((q) => q.status === 'new').length

  const totalRevenueMad = quotes
    .filter((q) => q.status === 'approved')
    .reduce((s, q) => s + Number(q.supplier_payout_amount_mad ?? 0), 0)

  // ── Per-product stats ───────────────────────────────────────────────────────
  const productStats = approvedProducts.map((p) => {
    const pQuotes     = quotes.filter((q) => q.supplier_product_id === p.id)
    const pApproved   = pQuotes.filter((q) => q.status === 'approved').length
    const pRevenue    = pQuotes.filter((q) => q.status === 'approved').reduce((s, q) => s + Number(q.supplier_payout_amount_mad ?? 0), 0)
    return { ...p, quoteCount: pQuotes.length, approvedQuotes: pApproved, revenue: pRevenue }
  }).sort((a, b) => b.quoteCount - a.quoteCount)

  const t = await getTranslations('supplier.analytics')
  const tc = await getTranslations('supplier.common')

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('statApproved'),  value: String(approvedProducts.length),  cls: 'bg-success-soft border-success text-success-fg' },
            { label: t('statPending'),   value: String(pendingProducts.length),    cls: 'bg-warning-soft border-warning text-warning-fg' },
            { label: t('statRejected'),  value: String(rejectedProducts.length),   cls: 'bg-danger-soft border-danger text-danger-fg' },
            { label: t('statQuotes'),    value: String(totalQuotes),               cls: 'bg-surface border-line text-foreground' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-muted leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Quote stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: t('statNewQuotes'),      value: String(newQuotes),            cls: 'bg-surface-2 border-line text-foreground' },
            { label: t('statApprovedQuotes'), value: String(approvedQuotes),       cls: 'bg-success-soft border-success text-success-fg' },
            { label: t('statRevenue'),        value: formatMAD(totalRevenueMad),   cls: 'bg-surface border-line text-foreground' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Per-product breakdown */}
        {productStats.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('productBreakdownTitle')}</h2>
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {productStats.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.product_name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {t('quoteCount', { count: p.quoteCount })} · {t('approvedCount', { count: p.approvedQuotes })}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-bold text-foreground">{formatMAD(p.revenue)}</p>
                    <p className="text-xs text-faint">{t('revenueLabel')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {approvedProducts.length === 0 && (
          <div className="bg-surface rounded-xl border border-line p-10 text-center">
            <p className="text-sm text-faint">{t('emptyState')}</p>
            <Link href="/supplier/products" className="mt-3 inline-block text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
              {t('emptyCtaProducts')}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
