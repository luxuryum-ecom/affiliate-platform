import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
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
    new:                { label: t('statusNew'),              cls: 'bg-surface-2 text-muted border border-line' },
    studying:           { label: t('statusStudying'),         cls: 'bg-warning-soft text-warning-fg' },
    quoted:             { label: t('statusQuoted'),           cls: 'bg-surface-2 text-muted border border-line' },
    quote_prepared:     { label: t('statusQuotePrepared'),    cls: 'bg-warning-soft text-warning-fg' },
    accepted_by_client: { label: t('statusAcceptedByClient'), cls: 'bg-success-soft text-success-fg' },
    rejected_by_client: { label: t('statusRejectedByClient'), cls: 'bg-danger-soft text-danger-fg' },
    negotiating:        { label: t('statusNegotiating'),      cls: 'bg-warning-soft text-warning-fg' },
    approved:           { label: t('statusApproved'),         cls: 'bg-success-soft text-success-fg' },
    rejected:           { label: t('statusRejected'),         cls: 'bg-danger-soft text-danger-fg' },
    converted_to_order: { label: t('statusConvertedToOrder'), cls: 'bg-surface-2 text-faint' },
  }

  const MARKETPLACE_STATUS_BADGE: Record<SupplierQuoteRequestStatus, { label: string; cls: string }> = {
    new:      { label: t('statusNew'),      cls: 'bg-surface-2 text-muted border border-line' },
    studying: { label: t('statusStudying'), cls: 'bg-warning-soft text-warning-fg' },
    quoted:   { label: t('statusQuoted'),   cls: 'bg-surface-2 text-muted border border-line' },
    approved: { label: t('statusApproved'), cls: 'bg-success-soft text-success-fg' },
    rejected: { label: t('statusRejected'), cls: 'bg-danger-soft text-danger-fg' },
  }

  const isRtl = locale === 'ar'

  return (
    <div className="min-h-screen bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/dashboard"
        backLabel={t('breadcrumbParent')}
        userName={profile?.full_name}
        signOutLabel={t('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-sm font-semibold text-foreground">{t('pageTitle')}</h1>
          <span className="text-xs px-2 py-0.5 bg-surface-2 text-muted rounded-full border border-line">
            {unified.length}
          </span>
        </div>

        {unified.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint mb-4">
              {t('emptyState')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/wholesale/products"
                className="text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('emptyCatalogCta')}
              </Link>
              <Link
                href="/wholesale/marketplace"
                className="text-xs px-4 py-2 bg-surface-2 text-muted rounded-lg hover:bg-surface border border-line transition-colors"
              >
                {t('emptyMarketplaceCta')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {unified.map((row) => {
              if (row.kind === 'catalog') {
                const req = row.data
                const badge = CATALOG_STATUS_BADGE[req.status] ?? CATALOG_STATUS_BADGE.new
                return (
                  <div key={`cat-${req.id}`} className="flex items-start gap-3 p-4 hover:bg-bg transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted font-medium border border-line">
                          {t('badgeCatalog')}
                        </span>
                        <span className="text-xs font-mono text-faint">
                          #{req.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{req.product?.name}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {t('units', { count: req.quantity_requested })} · {req.destination_country}
                        {req.destination_city ? `, ${req.destination_city}` : ''}
                      </p>
                      <p className="text-xs text-faint mt-0.5">
                        {new Date(req.created_at).toLocaleDateString(
                          locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA',
                          { day: '2-digit', month: 'short', year: 'numeric' },
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/wholesale/quote-requests/${req.id}`}
                      className="shrink-0 text-xs text-muted hover:text-foreground hover:underline transition-colors"
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
                <div key={`mkt-${req.id}`} className="flex items-start gap-3 p-4 hover:bg-bg transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent-soft text-accent-fg font-medium border border-gold-300">
                        {t('badgeMarketplace')}
                      </span>
                      <span className="text-xs font-mono text-faint">
                        #{req.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{productName}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {t('units', { count: req.quantity_requested })} · {req.destination_country}
                      {req.destination_city ? `, ${req.destination_city}` : ''}
                    </p>
                    <p className="text-xs text-faint mt-0.5">
                      {new Date(req.created_at).toLocaleDateString(
                        locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA',
                        { day: '2-digit', month: 'short', year: 'numeric' },
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/wholesale/marketplace/${req.supplier_product_id}`}
                    className="shrink-0 text-xs text-muted hover:text-foreground hover:underline transition-colors"
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
