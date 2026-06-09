import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { Profile, SupplierProduct, SupplierQuoteRequest, SupplierPayoutStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplierDashboard')
  return { title: t('metaTitle') }
}

/** Couleurs des badges de statut de reversement (libellé résolu via i18n). */
const PAYOUT_BADGE_CLS: Record<SupplierPayoutStatus, string> = {
  not_due:        'bg-gray-100 text-gray-500',
  pending:        'bg-amber-100 text-amber-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  paid:           'bg-green-100 text-green-700',
}

/** Safe columns visible to supplier — no client identity exposed. */
type SafeQuoteRow = Pick<
  SupplierQuoteRequest,
  | 'id'
  | 'supplier_product_id'
  | 'quantity_requested'
  | 'destination_country'
  | 'destination_city'
  | 'status'
  | 'supplier_payout_amount_mad'
  | 'supplier_payout_status'
  | 'created_at'
>

type ProductWithQuotes = Pick<SupplierProduct, 'id' | 'product_name' | 'approval_status' | 'created_at'> & {
  quotes: SafeQuoteRow[]
}

export default async function SupplierDashboardPage() {
  const supabase = await createClient()
  const t = await getTranslations('supplierDashboard')
  const tc = await getTranslations('common')
  const locale = await getLocale()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, productsResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      .select('id, product_name, approval_status, created_at')
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  // RFQ match counters
  const { count: rfqOpportunities } = await supabase
    .from('rfq_matches')
    .select('*', { count: 'exact', head: true })
    .eq('supplier_id', user.id)
    .in('status', ['new', 'notified'])

  // Sample request counters (supplier sees requests for their products, not buyer identity)
  const { data: ownProductIds } = await supabase
    .from('supplier_products')
    .select('id')
    .eq('supplier_id', user.id)
  const productIdsForSamples = (ownProductIds ?? []).map((p: { id: string }) => p.id)

  let samplePendingCount = 0
  let sampleTotalCount = 0
  if (productIdsForSamples.length > 0) {
    const { count: total } = await supabase
      .from('sample_requests')
      .select('*', { count: 'exact', head: true })
      .in('supplier_product_id', productIdsForSamples)
    const { count: pending2 } = await supabase
      .from('sample_requests')
      .select('*', { count: 'exact', head: true })
      .in('supplier_product_id', productIdsForSamples)
      .eq('status', 'pending')
    sampleTotalCount = total ?? 0
    samplePendingCount = pending2 ?? 0
  }

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  const products = (productsResult.data ?? []) as Pick<SupplierProduct, 'id' | 'product_name' | 'approval_status' | 'created_at'>[]

  const approvedProductIds = products
    .filter((p) => p.approval_status === 'approved')
    .map((p) => p.id)

  // Fetch quotes for approved products — only safe columns (no client identity)
  let safeQuotes: SafeQuoteRow[] = []
  if (approvedProductIds.length > 0) {
    const { data: quotesData } = await supabase
      .from('supplier_quote_requests_supplier_read')
      .select(
        'id, supplier_product_id, quantity_requested, destination_country, destination_city, status, supplier_payout_amount_mad, supplier_payout_status, created_at'
      )
      .in('supplier_product_id', approvedProductIds)
      .order('created_at', { ascending: false })
    safeQuotes = (quotesData ?? []) as SafeQuoteRow[]
  }

  const pending = products.filter((p) => p.approval_status === 'pending_review').length
  const approved = products.filter((p) => p.approval_status === 'approved').length
  const rejected = products.filter((p) => p.approval_status === 'blocked').length

  // Payout aggregates (supplier-safe: payout amounts only, no commission breakdown)
  const totalPayoutDue = safeQuotes
    .filter((q) => ['pending', 'partially_paid'].includes(q.supplier_payout_status))
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
  const totalPayoutPaid = safeQuotes
    .filter((q) => q.supplier_payout_status === 'paid')
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)

  // Group quotes by product
  const productMap = new Map<string, ProductWithQuotes>()
  for (const p of products.filter((p) => p.approval_status === 'approved')) {
    productMap.set(p.id, { ...p, quotes: [] })
  }
  for (const q of safeQuotes) {
    productMap.get(q.supplier_product_id)?.quotes.push(q)
  }
  const approvedProducts = Array.from(productMap.values())

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-gray-300">|</span>
            <span className="hidden sm:block text-sm font-medium text-gray-600">{t('spaceLabel')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('greeting', { name: profile?.full_name ?? '' })}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>

        {/* Product stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
            <p className="text-xs text-gray-500 mt-1">{t('statPending')}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-green-600">{approved}</p>
            <p className="text-xs text-gray-500 mt-1">{t('statApproved', { count: approved })}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-red-500">{rejected}</p>
            <p className="text-xs text-gray-500 mt-1">{t('statRejected', { count: rejected })}</p>
          </div>
        </div>

        {/* RFQ widget */}
        {(rfqOpportunities ?? 0) > 0 && (
          <div className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${(rfqOpportunities ?? 0) > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
            <div>
              <p className="text-xs text-gray-500">{t('rfqLabel')}</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{rfqOpportunities ?? 0}</p>
            </div>
            <Link href="/supplier/opportunities" className="text-xs px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              {t('rfqCta')}
            </Link>
          </div>
        )}

        {/* Sample request counters */}
        {sampleTotalCount > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{t('samplesTotal')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{sampleTotalCount}</p>
            </div>
            <div className={`rounded-xl border p-4 ${samplePendingCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
              <p className="text-xs text-gray-500">{t('samplesPendingResponse')}</p>
              <p className={`text-2xl font-bold mt-1 ${samplePendingCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{samplePendingCount}</p>
            </div>
          </div>
        )}

        {/* Payout summary (only if there are approved products with quotes) */}
        {safeQuotes.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-amber-200 p-5">
              <p className="text-xs text-amber-600 mb-1">{t('payoutDue')}</p>
              <p className="text-2xl font-bold text-amber-700 tabular-nums">{formatMAD(totalPayoutDue)}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-5">
              <p className="text-xs text-green-600 mb-1">{t('payoutPaid')}</p>
              <p className="text-2xl font-bold text-green-700 tabular-nums">{formatMAD(totalPayoutPaid)}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/supplier/products/new"
            className="flex items-center gap-3 bg-gray-900 text-white rounded-xl p-5 hover:bg-gray-700 transition-colors"
          >
            <span className="text-2xl">+</span>
            <div>
              <p className="font-medium text-sm">{t('navSubmitTitle')}</p>
              <p className="text-xs text-gray-300 mt-0.5">{t('navSubmitDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/products"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">📦</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navProductsTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navProductsDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/products/import"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">📥</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navImportTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navImportDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/analytics"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">📊</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navAnalyticsTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navAnalyticsDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/catalogs"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">📒</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navCatalogsTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navCatalogsDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/samples"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">🧪</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navSamplesTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navSamplesDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/opportunities"
            className="flex items-center gap-3 bg-white rounded-xl border border-indigo-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">⚡</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navOpportunitiesTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navOpportunitiesDesc')}</p>
            </div>
          </Link>
          <Link
            href="/supplier/premium"
            className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-amber-50 rounded-xl border border-amber-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">★</span>
            <div>
              <p className="font-medium text-sm text-gray-900">{t('navSubscriptionTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('navSubscriptionDesc')}</p>
            </div>
          </Link>
        </div>

        {/* Approved products with order & payout tracking */}
        {approvedProducts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('approvedSectionTitle')}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {approvedProducts.map((product) => {
                const orderCount = product.quotes.length
                const payoutDue = product.quotes
                  .filter((q) => ['pending', 'partially_paid'].includes(q.supplier_payout_status))
                  .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
                const payoutPaid = product.quotes
                  .filter((q) => q.supplier_payout_status === 'paid')
                  .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)

                return (
                  <div key={product.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="font-medium text-gray-900 text-sm">{product.product_name}</p>
                      <span className="text-xs text-gray-500 shrink-0">
                        {t('orderCount', { count: orderCount })}
                      </span>
                    </div>

                    {orderCount > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-amber-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-amber-600">{t('payoutDueShort')}</p>
                            <p className="font-semibold tabular-nums text-amber-700 text-sm">{formatMAD(payoutDue)}</p>
                          </div>
                          <div className="bg-green-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-green-600">{t('payoutPaidShort')}</p>
                            <p className="font-semibold tabular-nums text-green-700 text-sm">{formatMAD(payoutPaid)}</p>
                          </div>
                        </div>

                        {/* Per-order payout rows (no client identity) */}
                        <div className="space-y-1.5">
                          {product.quotes.map((q) => {
                            const badgeCls = PAYOUT_BADGE_CLS[q.supplier_payout_status]
                            return (
                              <div key={q.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <span>{t('unitsShort', { count: q.quantity_requested })}</span>
                                  <span className="text-gray-300">·</span>
                                  <span>{q.destination_country}{q.destination_city ? ` — ${q.destination_city}` : ''}</span>
                                  <span className="text-gray-300">·</span>
                                  <span>{new Date(q.created_at).toLocaleDateString(locale)}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {q.supplier_payout_amount_mad != null && (
                                    <span className="font-semibold tabular-nums text-gray-900">
                                      {formatMAD(q.supplier_payout_amount_mad)}
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeCls}`}>
                                    {t(`payoutBadge.${q.supplier_payout_status}`)}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">{t('noOrders')}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
