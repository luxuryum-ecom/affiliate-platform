import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { MarketplaceFilters } from '@/components/wholesale/marketplace-filters'
import { WholesaleCatalogCard } from '@/components/wholesale/wholesale-catalog-card'
import { formatMAD } from '@/lib/utils'
import { PRODUCT_CATEGORIES, getSubcategories, ORIGIN_COUNTRIES, CATEGORY_ICONS, CATEGORY_IMAGES, resolveCategoryLabel } from '@/lib/taxonomy'
import { CategoryRail, type CategoryChip } from '@/components/shared/category-rail'
import { CategoryShowcase, type CategoryCardData } from '@/components/shared/category-showcase'
import type { WholesaleCatalogRow, WholesaleCartItem } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.products')
  return { title: t('metaTitle') }
}

interface SearchParams {
  tab?: string
  q?: string
  category?: string
  subcategory?: string
  origin?: string
  max_moq?: string
  in_stock?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function WholesaleProductsPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, tc, tCat, profileResult, catalogResult, cartResult] = await Promise.all([
    getTranslations('wholesale.products'),
    getTranslations('wholesale.common'),
    getTranslations('categories'),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('wholesale_catalog_read')
      .select('*')
      .order('is_verified', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('wholesale_cart_items').select('*').eq('buyer_id', user.id),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const allRows = (catalogResult.data ?? []) as WholesaleCatalogRow[]
  const cartItems = (cartResult.data ?? []) as WholesaleCartItem[]

  // Build cart lookup: product_id → quantity
  const cartMap = new Map(cartItems.map((c) => [c.product_id, c.quantity]))
  const cartCount = cartItems.length

  // ── Tab ────────────────────────────────────────────────────────────────────
  const activeTab = filters.tab === 'import' ? 'import' : 'local'

  // ── Filters (applied in memory after single DB fetch) ─────────────────────
  let rows = allRows

  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    )
  }
  if (filters.category) {
    rows = rows.filter((r) => r.category === filters.category)
  }
  if (filters.subcategory) {
    const sub = filters.subcategory.toLowerCase()
    rows = rows.filter((r) => r.subcategory.toLowerCase().includes(sub))
  }
  if (filters.origin) {
    const orig = filters.origin.toLowerCase()
    rows = rows.filter((r) => r.origin_country.toLowerCase().includes(orig))
  }
  if (filters.max_moq) {
    const qty = parseInt(filters.max_moq, 10)
    if (!isNaN(qty)) rows = rows.filter((r) => r.min_qty <= qty)
  }
  if (filters.in_stock === '1') {
    rows = rows.filter((r) => (r.stock ?? 0) > 0)
  }

  // ── Tab split ──────────────────────────────────────────────────────────────
  const localRows = rows.filter((r) => r.availability_type === 'local_stock')
  const importRows = rows.filter((r) => r.availability_type === 'import_on_demand')
  const visibleRows = activeTab === 'local' ? localRows : importRows
  const otherTab = activeTab === 'local' ? 'import' : 'local'
  const otherRows = activeTab === 'local' ? importRows : localRows

  const isFiltered = !!(
    filters.q ||
    filters.category ||
    filters.subcategory ||
    filters.origin ||
    filters.max_moq ||
    filters.in_stock
  )

  const subcategoryOptions = filters.category ? getSubcategories(filters.category) : []

  // Construction des chips CategoryRail côté serveur — aucune fonction passée au composant.
  const allHref = filters.tab ? `/wholesale/products?tab=${filters.tab}` : '/wholesale/products'
  const chips: CategoryChip[] = PRODUCT_CATEGORIES.map((cat) => {
    const sp = new URLSearchParams()
    if (filters.tab) sp.set('tab', filters.tab)
    sp.set('category', cat)
    if (filters.q) sp.set('q', filters.q)
    return {
      value: cat,
      label: resolveCategoryLabel(cat, tCat),
      icon: CATEGORY_ICONS[cat] ?? '📦',
      isActive: filters.category === cat,
      href: `/wholesale/products?${sp.toString()}`,
    }
  })

  // Grandes cartes-rayons (navigation visuelle, EN HAUT) — mêmes liens que les chips
  // (onglet + recherche préservés, ciblent le ?category= déjà fonctionnel du catalogue).
  const categoryCards: CategoryCardData[] = chips.map((chip) => ({
    value: chip.value,
    label: chip.label,
    href: chip.href,
    image: CATEGORY_IMAGES[chip.value] ?? '',
    icon: chip.icon,
    isActive: chip.isActive,
  }))

  // Helper: build a tab href preserving current filters
  function tabHref(tab: string) {
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (filters.q) params.set('q', filters.q)
    if (filters.category) params.set('category', filters.category)
    if (filters.subcategory) params.set('subcategory', filters.subcategory)
    if (filters.origin) params.set('origin', filters.origin)
    if (filters.max_moq) params.set('max_moq', filters.max_moq)
    if (filters.in_stock) params.set('in_stock', filters.in_stock)
    return `/wholesale/products?${params.toString()}`
  }

  // Helper: build the clear-filters href (preserves tab only)
  const clearHref = `/wholesale/products?tab=${activeTab}`

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      {/* Navbar */}
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/wholesale/dashboard"
        backLabel={tc('backToDashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5">
              {t('subtitle', { count: allRows.length })}
            </p>
            <Link
              href="/wholesale/marketplace"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              {t('browseMarketplace')}
            </Link>
          </div>
          {cartCount > 0 && (
            <Link
              href="/wholesale/cart"
              className="shrink-0 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              {t('viewCart', { count: cartCount })}
            </Link>
          )}
        </div>

        {/* ── Cartes-rayons (navigation visuelle, EN HAUT pour clients peu lettrés) ── */}
        <section aria-label={t('categoryShowcaseTitle')} className="mb-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('categoryShowcaseTitle')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('categoryShowcaseSubtitle')}</p>
            </div>
            <Link
              href="/wholesale/products/categories"
              className="shrink-0 text-xs font-medium text-gold-400 hover:underline whitespace-nowrap"
            >
              {t('categoryShowcaseSeeAll')}
            </Link>
          </div>
          <CategoryShowcase cards={categoryCards} layout="scroll" />
        </section>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-5 border-b border-line">
          <Link
            href={tabHref('local')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'local'
                ? 'bg-surface border border-b-0 border-line text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {t('tabLocal')}
            <span className="ms-1.5 text-xs text-faint">
              ({t('tabCount', { count: localRows.length })})
            </span>
          </Link>
          <Link
            href={tabHref('import')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'import'
                ? 'bg-surface border border-b-0 border-line text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {t('tabImport')}
            <span className="ms-1.5 text-xs text-faint">
              ({t('tabCount', { count: importRows.length })})
            </span>
          </Link>
        </div>

        {/* Rayons — navigation par famille */}
        <CategoryRail
          chips={chips}
          allHref={allHref}
          allLabel={tCat('all')}
          isAllActive={!filters.category}
        />

        {/* ── Filters ─────────────────────────────────────────────────────────── */}
        <MarketplaceFilters filterTitle={t('filterTitle')}>
          <form method="GET" className="bg-surface rounded-xl border border-line p-4 shadow-premium">
            {/* Preserve tab */}
            <input type="hidden" name="tab" value={activeTab} />

            {/* Row 1: keyword + category + subcategory + origin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {t('filterSearch')}
                </label>
                <input
                  name="q"
                  type="text"
                  defaultValue={filters.q ?? ''}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                  placeholder={t('filterSearchPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {t('filterCategory')}
                </label>
                <select
                  name="category"
                  defaultValue={filters.category ?? ''}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                >
                  <option value="">{t('filterCategoryAll')}</option>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {t('filterSubcategory')}
                </label>
                {subcategoryOptions.length > 0 ? (
                  <select
                    name="subcategory"
                    defaultValue={filters.subcategory ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                  >
                    <option value="">{t('filterSubcategoryAll')}</option>
                    {subcategoryOptions.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="subcategory"
                    type="text"
                    defaultValue={filters.subcategory ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder={t('filterSubcategoryPlaceholder')}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {t('filterOrigin')}
                </label>
                <select
                  name="origin"
                  defaultValue={filters.origin ?? ''}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                >
                  <option value="">{t('filterOriginAll')}</option>
                  {ORIGIN_COUNTRIES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: max MOQ + in stock */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  {t('filterMaxMoq')}
                </label>
                <input
                  name="max_moq"
                  type="number"
                  min={1}
                  defaultValue={filters.max_moq ?? ''}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                  placeholder={t('filterMaxMoqPlaceholder')}
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    name="in_stock"
                    type="checkbox"
                    value="1"
                    defaultChecked={filters.in_stock === '1'}
                    className="rounded border-line w-4 h-4 accent-gold-500"
                  />
                  <span className="text-xs text-muted font-medium">{t('filterInStock')}</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('filterSubmit')}
              </button>
              {isFiltered && (
                <Link
                  href={clearHref}
                  className="px-4 py-2 border border-line text-muted text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors"
                >
                  {t('filterClear')}
                </Link>
              )}
            </div>
          </form>
        </MarketplaceFilters>

        {/* ── Result count ────────────────────────────────────────────────────── */}
        <p className="text-sm text-muted mb-4">
          <span className="font-semibold text-foreground">
            {visibleRows.length !== 1
              ? t('resultFoundPlural', { count: visibleRows.length })
              : t('resultFound', { count: visibleRows.length })}
          </span>
        </p>

        {/* ── Product grid ────────────────────────────────────────────────────── */}
        {visibleRows.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-12 text-center">
            <p className="text-sm text-faint">
              {isFiltered ? t('emptyFiltered') : t('empty')}
            </p>
            {isFiltered && (
              <Link
                href={clearHref}
                className="mt-3 inline-block text-sm text-gold-400 hover:underline"
              >
                {t('filterClear')}
              </Link>
            )}
            {/* Renvoi vers l'autre onglet quand l'actif est vide mais l'autre a des résultats filtrés */}
            {isFiltered && otherRows.length > 0 && (
              <Link
                href={tabHref(otherTab)}
                className="mt-3 ms-3 inline-block text-sm text-gold-400 hover:underline"
              >
                {filters.q
                  ? t('otherTabHintQ', { count: otherRows.length, term: filters.q })
                  : t('otherTabHint', { count: otherRows.length })}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleRows.map((row) => {
              // ⚠️ source is resolved server-side. Never passed to the card component.
              const href =
                row.source === 'internal'
                  ? `/wholesale/products/${row.id}`
                  : `/wholesale/marketplace/${row.id}`

              const isLocalStock = row.availability_type === 'local_stock'
              const inCartQty = cartMap.get(row.id)

              // All strings resolved server-side
              const availabilityBadge = isLocalStock ? t('badgeStock') : t('badgeImport')
              const fromPriceLabel = formatMAD(Number(row.from_price_mad))
              const minQtyLabel = t('minQty', { count: row.min_qty })
              const ctaLabel = isLocalStock ? t('ctaOrder') : t('ctaRfq')
              const inCartLabel =
                inCartQty != null ? t('inCart', { count: inCartQty }) : undefined

              return (
                <WholesaleCatalogCard
                  key={row.id}
                  href={href}
                  name={row.name}
                  imageUrl={row.image}
                  fromPriceLabel={fromPriceLabel}
                  minQtyLabel={minQtyLabel}
                  availabilityBadge={availabilityBadge}
                  isLocalStock={isLocalStock}
                  isVerified={row.is_verified}
                  isFeatured={row.is_featured}
                  verifiedLabel={t('badgeVerified')}
                  featuredLabel={t('badgeFeatured')}
                  ctaLabel={ctaLabel}
                  inCartLabel={inCartLabel}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
