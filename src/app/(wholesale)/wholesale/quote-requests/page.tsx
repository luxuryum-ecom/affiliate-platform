import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { QuoteRequest, QuoteRequestStatus, SupplierQuoteRequestStatus, Profile, Product } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.quoteRequests')
  return { title: t('metaTitle') }
}

type CatalogRow = QuoteRequest & { product: Pick<Product, 'id' | 'name'> }

type MarketplaceRow = {
  id: string
  supplier_product_id: string
  quantity_requested: number
  destination_country: string
  destination_city: string | null
  status: SupplierQuoteRequestStatus
  created_at: string
  supplier_product: { id: string; product_name: string } | null
}

type UnifiedRow =
  | { kind: 'catalog';     data: CatalogRow }
  | { kind: 'marketplace'; data: MarketplaceRow }

export default async function WholesaleQuoteRequestsPage() {
  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.quoteRequests'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const [catalogRes, marketplaceRes] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('*, product:products!product_id(id,name)')
      .eq('buyer_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('supplier_quote_requests')
      .select('id, supplier_product_id, quantity_requested, destination_country, destination_city, status, created_at, supplier_product:supplier_products!supplier_product_id(id, product_name)')
      .eq('buyer_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const catalogRows = (catalogRes.data ?? []) as unknown as CatalogRow[]
  const marketplaceRows = (marketplaceRes.data ?? []) as unknown as MarketplaceRow[]

  const unified: UnifiedRow[] = [
    ...catalogRows.map((d): UnifiedRow => ({ kind: 'catalog', data: d })),
    ...marketplaceRows.map((d): UnifiedRow => ({ kind: 'marketplace', data: d })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime())

  // Status badge maps using translations
  const CATALOG_STATUS_BADGE: Record<QuoteRequestStatus, { label: string; cls: string }> = {
    new:                { label: t('statusNew'),              cls: 'bg-blue-100 text-blue-700' },
    studying:           { label: t('statusStudying'),         cls: 'bg-amber-100 text-amber-700' },
    quoted:             { label: t('statusQuoted'),           cls: 'bg-purple-100 text-purple-700' },
    quote_prepared:     { label: t('statusQuotePrepared'),    cls: 'bg-indigo-100 text-indigo-700' },
    accepted_by_client: { label: t('statusAcceptedByClient'), cls: 'bg-green-100 text-green-700' },
    rejected_by_client: { label: t('statusRejectedByClient'), cls: 'bg-red-100 text-red-600' },
    negotiating:        { label: t('statusNegotiating'),      cls: 'bg-orange-100 text-orange-700' },
    approved:           { label: t('statusApproved'),         cls: 'bg-green-100 text-green-700' },
    rejected:           { label: t('statusRejected'),         cls: 'bg-red-100 text-red-600' },
    converted_to_order: { label: t('statusConvertedToOrder'), cls: 'bg-gray-100 text-gray-500' },
  }

  const MARKETPLACE_STATUS_BADGE: Record<SupplierQuoteRequestStatus, { label: string; cls: string }> = {
    new:      { label: t('statusNew'),      cls: 'bg-blue-100 text-blue-700' },
    studying: { label: t('statusStudying'), cls: 'bg-amber-100 text-amber-700' },
    quoted:   { label: t('statusQuoted'),   cls: 'bg-purple-100 text-purple-700' },
    approved: { label: t('statusApproved'), cls: 'bg-green-100 text-green-700' },
    rejected: { label: t('statusRejected'), cls: 'bg-red-100 text-red-600' },
  }

  const isRtl = locale === 'ar'

  return (
    <div className="min-h-screen bg-gray-50" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              {t('breadcrumbParent')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-semibold text-gray-900 text-sm">{t('pageTitle')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                {t('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-sm font-semibold text-gray-900">{t('pageTitle')}</h1>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
            {unified.length}
          </span>
        </div>

        {unified.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400 mb-4">
              {t('emptyState')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/wholesale/products"
                className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t('emptyCatalogCta')}
              </Link>
              <Link
                href="/wholesale/marketplace"
                className="text-xs px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('emptyMarketplaceCta')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {unified.map((row) => {
              if (row.kind === 'catalog') {
                const req = row.data
                const badge = CATALOG_STATUS_BADGE[req.status] ?? CATALOG_STATUS_BADGE.new
                return (
                  <div key={`cat-${req.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                          {t('badgeCatalog')}
                        </span>
                        <span className="text-xs font-mono text-gray-400">
                          #{req.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{req.product?.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('units', { count: req.quantity_requested })} · {req.destination_country}
                        {req.destination_city ? `, ${req.destination_city}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString(
                          locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA',
                          { day: '2-digit', month: 'short', year: 'numeric' },
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/wholesale/quote-requests/${req.id}`}
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      {t('viewLink')}
                    </Link>
                  </div>
                )
              }

              // marketplace row
              const req = row.data
              const badge = MARKETPLACE_STATUS_BADGE[req.status] ?? MARKETPLACE_STATUS_BADGE.new
              const productName = req.supplier_product?.product_name ?? t('unknownProduct')
              return (
                <div key={`mkt-${req.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                        {t('badgeMarketplace')}
                      </span>
                      <span className="text-xs font-mono text-gray-400">
                        #{req.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{productName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('units', { count: req.quantity_requested })} · {req.destination_country}
                      {req.destination_city ? `, ${req.destination_city}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(req.created_at).toLocaleDateString(
                        locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA',
                        { day: '2-digit', month: 'short', year: 'numeric' },
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/wholesale/marketplace/${req.supplier_product_id}`}
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    {t('productLink')}
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
