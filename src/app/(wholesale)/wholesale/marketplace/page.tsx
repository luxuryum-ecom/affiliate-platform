import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo, OriginBadge, VerifiedBadge, FeaturedBadge, MOQChip } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { PRODUCT_CATEGORIES, getSubcategories, ORIGIN_COUNTRIES, CATEGORY_ICONS } from '@/lib/taxonomy'
import { ProductCardImage } from '@/components/wholesale/product-card-image'
import { MarketplaceFilters } from '@/components/wholesale/marketplace-filters'
import { SourcingRequestCta } from '@/components/wholesale/sourcing-request-cta'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import { getCategoryDisplayList } from '@/lib/categories/display'
import { CategoryShowcase, type CategoryCardData } from '@/components/shared/category-showcase'
import { detectBuyerNiche } from '@/lib/wholesale/detect-niche'
import type { Profile, SupplierProductPublic, SupplierType, WholesaleCatalogRow } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('wholesale.marketplace')
  return { title: t('metaTitle') }
}

interface SearchParams {
  q?: string
  category?: string
  subcategory?: string
  origin?: string
  availability?: string
  supplier_type?: string
  max_moq?: string
  in_stock?: string
  max_lead_time?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function WholesaleMarketplacePage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, locale, profileResult, productsResult, internalResult, cats, nicheResult] = await Promise.all([
    getTranslations('wholesale.marketplace'),
    getLocale(),
    supabase.from('profiles').select('full_name, declared_niche').eq('id', user.id).single(),
    supabase
      .from('supplier_products_wholesaler_read')
      .select(
        'id, product_name, category, subcategory, niche, description, photos, min_quantity, origin_country, availability_type, target_buyer_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, lead_time_days, export_countries, created_at, is_featured, is_verified, supplier_product_attachments(attachment_type, admin_status)'
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('wholesale_catalog_read')
      .select('id, source, name, description, from_price_mad, min_qty, stock, image, category, subcategory, origin_country, availability_type, is_featured, is_verified, created_at')
      .eq('source', 'internal')
      .order('created_at', { ascending: false }),
    getCategoryDisplayList(),
    // PERSONNALISATION — niche du grossiste depuis SON comportement (RLS, lecture seule,
    // zéro argent). Cold-start → topNiche null → fallback neutre (aucun reclassement).
    detectBuyerNiche(supabase),
  ])

  const tCommon = await getTranslations('wholesale.common')

  const profile = profileResult.data as Pick<Profile, 'full_name' | 'declared_niche'> | null

  // Build icon map from dynamic category list (fallback to static CATEGORY_ICONS if absent)
  const catIconMap = new Map<string, string>(
    cats.map((c) => [c.value, c.icon ?? CATEGORY_ICONS[c.value] ?? '🏷️'])
  )

  // ── PERSONNALISATION — niche détectée (catégorie dominante du comportement) ──
  // Sert UNIQUEMENT à : (a) le boost de tri (ré-ordonnancement affichage), (b) la
  // bannière de tête. Aucune donnée produit/prix modifiée. Cold-start → null.
  // Comportement d'abord ; à défaut (cold-start), la niche DÉCLARÉE au signup
  // (mig 117) prend le relais si elle est une catégorie connue. Le comportement
  // réel écrase toujours la déclaration dès qu'un signal existe.
  const declaredNiche =
    profile?.declared_niche && cats.some((c) => c.value === profile.declared_niche)
      ? profile.declared_niche
      : null
  const niche = nicheResult.topNiche ?? declaredNiche
  const nicheLabel = niche ? (cats.find((c) => c.value === niche)?.label ?? niche) : null
  const nicheIcon = niche ? (catIconMap.get(niche) ?? CATEGORY_ICONS[niche] ?? '🎯') : null

  type MoqTierRow = { min_quantity: number }
  type MarketplaceProduct = SupplierProductPublic & {
    supplier_type: SupplierType
    subcategory: string
    niche: string
    unit: string
    stock_quantity: number | null
    lead_time_days: number | null
    export_countries: string[]
    supplier_product_attachments: { attachment_type: string; admin_status: string }[]
    supplier_product_moq_tiers: MoqTierRow[]
    is_featured: boolean
    is_verified: boolean
    /** SERVER-ONLY — never rendered, used only to resolve the detail href. */
    __source: 'internal' | 'supplier'
  }

  // Map supplier rows — mark as 'supplier' for server-side routing
  const supplierProducts: MarketplaceProduct[] = (productsResult.data ?? []).map((row) => ({
    ...(row as unknown as MarketplaceProduct),
    __source: 'supplier' as const,
  }))

  // ── Paliers MOQ (C1 — mig 115) : vue redacted, AUCUN prix ─────────────────
  // La policy base "spmt: wholesaler read approved" a été retirée (fuite unit_price_usd,
  // secret fournisseur). Seul le NOMBRE de paliers est utilisé ici (chip « paliers
  // dispo », hasTiers ci-dessous) — jamais un prix — donc on lit la vue redacted
  // (supplier_product_id, min_quantity uniquement). Comportement d'affichage IDENTIQUE.
  const supplierProductIds = supplierProducts.map((p) => p.id)
  const moqTiersByProduct = new Map<string, MoqTierRow[]>()
  if (supplierProductIds.length > 0) {
    const { data: tiersRows } = await supabase
      .from('supplier_product_moq_tiers_wholesaler_read')
      .select('supplier_product_id, min_quantity')
      .in('supplier_product_id', supplierProductIds)
    for (const row of (tiersRows ?? []) as { supplier_product_id: string; min_quantity: number }[]) {
      const list = moqTiersByProduct.get(row.supplier_product_id) ?? []
      list.push({ min_quantity: row.min_quantity })
      moqTiersByProduct.set(row.supplier_product_id, list)
    }
  }
  for (const p of supplierProducts) {
    p.supplier_product_moq_tiers = moqTiersByProduct.get(p.id) ?? []
  }

  // Map internal rows from wholesale_catalog_read — no supplier/cost/margin data exposed
  const internalRows = (internalResult.data ?? []) as WholesaleCatalogRow[]
  const internalProducts: MarketplaceProduct[] = internalRows.map((row) => ({
    id: row.id,
    product_name: row.name,
    public_name: row.name,
    description: row.description,
    public_description: row.description,
    category: row.category ?? '',
    subcategory: row.subcategory ?? '',
    niche: '',
    photos: row.image ? [row.image] : [],
    min_quantity: row.min_qty,
    origin_country: row.origin_country ?? '',
    availability_type: row.availability_type,
    target_buyer_type: 'both' as const,
    suggested_wholesale_price_mad: row.from_price_mad,
    // 'morocco' = offre locale marocaine, indistinguable d'un fournisseur marocain
    supplier_type: 'morocco' as const,
    unit: '',
    stock_quantity: row.stock,
    lead_time_days: null,
    export_countries: [],
    is_featured: row.is_featured,
    is_verified: row.is_verified,
    supplier_product_attachments: [],
    supplier_product_moq_tiers: [],
    approval_status: 'approved' as const,
    created_at: row.created_at,
    updated_at: row.created_at,
    // Moderation/workflow fields — neutral values for internal products
    moderation_flag: null,
    ai_risk_score: null,
    moderation_reason: null,
    moderation_signals: [],
    approved_at: null,
    rejected_at: null,
    archived_at: null,
    // Ingestion source field ('web' is the neutral default — does not expose internal origin)
    source: 'web' as const,
    telegram_message_id: null,
    // Platform margin fields — not used for internal products (routed to /wholesale/products)
    apply_platform_margin: false,
    final_wholesale_price_mad: row.from_price_mad,
    source_currency: 'MAD',
    price_source: null,
    fx_rate_source_to_mad: null,
    supplier_unit_price_usd: null,
    __source: 'internal' as const,
  }))

  // Merge internal + supplier before any filter/sort
  let products: MarketplaceProduct[] = [...internalProducts, ...supplierProducts]

  // Premium suppliers first — + boost NICHE (ré-ordonnancement affichage UNIQUEMENT).
  // Le boost niche (+10, borné) remonte les produits de la niche détectée EN TÊTE, mais
  // SEULEMENT quand aucun filtre catégorie/origine n'est actif (sinon on respecte le tri
  // premium d'origine et on ne masque rien de la vue filtrée). À l'intérieur de la niche,
  // l'ordre premium (vérifié/featured) reste appliqué. Aucune donnée/prix touché.
  const applyNicheBoost = !!niche && !filters.category && !filters.origin
  products.sort((a, b) => {
    const scoreA = (a.is_verified ? 2 : 0) + (a.is_featured ? 1 : 0) + (applyNicheBoost && a.category === niche ? 10 : 0)
    const scoreB = (b.is_verified ? 2 : 0) + (b.is_featured ? 1 : 0) + (applyNicheBoost && b.category === niche ? 10 : 0)
    return scoreB - scoreA
  })

  // Apply filters
  if (filters.q) {
    const q = filters.q.toLowerCase()
    products = products.filter((p) =>
      (p.public_name ?? p.product_name).toLowerCase().includes(q) ||
      (p.public_description ?? p.description ?? '').toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q) ||
      (p.niche ?? '').toLowerCase().includes(q)
    )
  }
  if (filters.category) {
    products = products.filter((p) => p.category === filters.category)
  }
  if (filters.subcategory) {
    const sub = filters.subcategory.toLowerCase()
    products = products.filter((p) =>
      (p.subcategory ?? '').toLowerCase().includes(sub) || (p.niche ?? '').toLowerCase().includes(sub)
    )
  }
  if (filters.origin) {
    products = products.filter((p) =>
      (p.origin_country ?? '').toLowerCase().includes(filters.origin!.toLowerCase())
    )
  }
  if (filters.availability) {
    products = products.filter((p) =>
      p.availability_type === filters.availability &&
      (filters.availability !== 'local_stock' || p.stock_quantity == null || p.stock_quantity > 0)
    )
  }
  if (filters.supplier_type) {
    products = products.filter((p) => p.supplier_type === filters.supplier_type)
  }
  if (filters.max_moq) {
    const qty = parseInt(filters.max_moq, 10)
    if (!isNaN(qty)) products = products.filter((p) => p.min_quantity <= qty)
  }
  if (filters.in_stock === '1') {
    products = products.filter((p) => (p.stock_quantity ?? 0) > 0)
  }
  if (filters.max_lead_time) {
    const days = parseInt(filters.max_lead_time, 10)
    if (!isNaN(days)) products = products.filter((p) => p.lead_time_days == null || p.lead_time_days <= days)
  }

  // Trust metrics — real counts from unfiltered approved products (internal + supplier)
  const allApproved = [...internalProducts, ...supplierProducts]
  const totalProductCount = allApproved.length
  const verifiedSupplierCount = allApproved.filter((p) => p.is_verified).length
  const localStockProductCount = allApproved.filter(
    (p) => p.availability_type === 'local_stock'
  ).length

  const subcategoryOptions = filters.category ? getSubcategories(filters.category) : []
  const isFiltered = !!(
    filters.q || filters.category || filters.subcategory || filters.origin ||
    filters.availability || filters.supplier_type || filters.max_moq ||
    filters.in_stock || filters.max_lead_time
  )

  // ── ZONE 3 : nav catégorie dynamique ──────────────────────────────────────
  // Quand un pays est sélectionné : restreindre aux catégories présentes parmi les
  // produits filtrés par origin (avant filtres supplémentaires). On recalcule depuis
  // allApproved filtré par origin pour ne pas dépendre des autres filtres actifs.
  let categoryNavCards: CategoryCardData[]
  if (filters.origin) {
    const originLower = filters.origin.toLowerCase()
    const originProducts = allApproved.filter((p) =>
      (p.origin_country ?? '').toLowerCase().includes(originLower)
    )
    const presentCategorySlugs = new Set(originProducts.map((p) => p.category).filter(Boolean))
    const filteredCats = cats.filter((c) => presentCategorySlugs.has(c.value))
    categoryNavCards = filteredCats.map((c) => ({
      value: c.value,
      label: c.label,
      href: `/wholesale/marketplace?origin=${encodeURIComponent(filters.origin!)}&category=${encodeURIComponent(c.value)}`,
      image: c.image ?? '',
      icon: c.icon,
      isActive: filters.category === c.value,
    }))
  } else {
    // Pas de pays sélectionné : toutes les catégories
    categoryNavCards = cats.map((c) => ({
      value: c.value,
      label: c.label,
      href: `/wholesale/marketplace?category=${encodeURIComponent(c.value)}`,
      image: c.image ?? '',
      icon: c.icon,
      isActive: filters.category === c.value,
    }))
  }

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/wholesale/dashboard" className="text-muted hover:text-foreground transition-colors">
                {tCommon('dashboard')}
              </Link>
              <span className="font-semibold text-gold-400">{t('navMarketplace')}</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-muted hidden md:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted hover:text-foreground transition-colors">
                {tCommon('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* ── Page title ──────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BANNIÈRE PERSONNALISÉE (P3) — adaptée à la niche détectée          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <NichePromoBanner
          nicheLabel={nicheLabel}
          nicheIcon={nicheIcon}
          nicheValue={niche}
          t={t}
        />

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ZONE 1 — STOCK MAROC                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="zone1-title">
          <p id="zone1-title" className="text-xs font-semibold text-gold-500 uppercase tracking-wider mb-3">
            {t('zone1Title')}
          </p>
          <MoroccoHeroCard
            activeAvailability={filters.availability}
            totalProducts={totalProductCount}
            verifiedSuppliers={verifiedSupplierCount}
            localStockProducts={localStockProductCount}
            t={t}
          />
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ZONE 2 — IMPORTER DEPUIS                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="zone2-title" className="pb-6 border-b border-line">
          <p id="zone2-title" className="text-xs font-semibold text-gold-500 uppercase tracking-wider mb-3">
            🌍 {t('zone2Title')}
          </p>
          <ImportCountryGrid activeOrigin={filters.origin} t={t} />
        </section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ZONE 3 — SOURCING + FILTRE CATÉGORIE + PRODUITS                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <section aria-labelledby="zone3-title">
          <p id="zone3-title" className="text-xs font-semibold text-gold-500 uppercase tracking-wider mb-3">
            {t('zone3Title')}
          </p>

          {/* Sourcing CTA */}
          <SourcingRequestCta whatsappPhone={whatsappPhone} />

          {/* Nav catégorie en grandes cartes-images */}
          {categoryNavCards.length > 0 && (
            <div className="mt-5 mb-5">
              <CategoryShowcase cards={categoryNavCards} layout="scroll" />
            </div>
          )}

          {/* Filtres avancés */}
          <MarketplaceFilters filterTitle={t('filterTitle')}>
            <form method="GET" className="bg-surface rounded-xl border border-line p-4 shadow-premium">
              {/* Row 1: keyword + subcategory + origin + supplier type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterSearch')}</label>
                  <input
                    name="q"
                    type="text"
                    defaultValue={filters.q ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder={t('filterSearchPlaceholder')}
                  />
                </div>

                {/* Catégorie conservée dans le form pour permettre la soumission manuelle
                    (la nav cartes pose ?category= via href, le form le préserve) */}
                {filters.origin && (
                  <input type="hidden" name="origin" value={filters.origin} />
                )}

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterSubcategory')}</label>
                  {subcategoryOptions.length > 0 ? (
                    <select
                      name="subcategory"
                      defaultValue={filters.subcategory ?? ''}
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                    >
                      <option value="">{t('filterSubcategoryAll')}</option>
                      {subcategoryOptions.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
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
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterOrigin')}</label>
                  <select
                    name="origin"
                    defaultValue={filters.origin ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                  >
                    <option value="">{t('filterOriginAll')}</option>
                    {ORIGIN_COUNTRIES.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterSupplierType')}</label>
                  <select
                    name="supplier_type"
                    defaultValue={filters.supplier_type ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                  >
                    <option value="">{t('filterSupplierAll')}</option>
                    <option value="morocco">🇲🇦 {t('filterSupplierMorocco')}</option>
                    <option value="international">🌍 {t('filterSupplierIntl')}</option>
                  </select>
                </div>
              </div>

              {/* Row 2: availability + MOQ max + lead time max + in stock */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterAvailability')}</label>
                  <select
                    name="availability"
                    defaultValue={filters.availability ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                  >
                    <option value="">{t('filterAvailabilityAll')}</option>
                    <option value="local_stock">{t('filterAvailabilityLocal')}</option>
                    <option value="import_on_demand">{t('filterAvailabilityImport')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterMaxMoq')}</label>
                  <input
                    name="max_moq"
                    type="number"
                    min={1}
                    defaultValue={filters.max_moq ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder={t('filterMaxMoqPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t('filterMaxLeadTime')}</label>
                  <input
                    name="max_lead_time"
                    type="number"
                    min={1}
                    defaultValue={filters.max_lead_time ?? ''}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder={t('filterMaxLeadTimePlaceholder')}
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
                    href="/wholesale/marketplace"
                    className="px-4 py-2 border border-line text-muted text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    {t('filterClear')}
                  </Link>
                )}
              </div>
            </form>
          </MarketplaceFilters>

          {/* Result count */}
          <p className="text-sm text-muted mt-4 mb-4">
            <span className="font-semibold text-foreground">{products.length}</span>{' '}
            {isFiltered
              ? (products.length !== 1 ? t('resultFoundPlural') : t('resultFound'))
              : (products.length !== 1 ? t('resultAvailablePlural') : t('resultAvailable'))
            }{' '}
          </p>

          {/* Product grid */}
          {products.length === 0 ? (
            <div className="bg-surface rounded-xl border border-line p-12 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm text-muted">
                {isFiltered ? t('emptyFiltered') : t('emptyDefault')}
              </p>
              {isFiltered && (
                <Link href="/wholesale/marketplace" className="mt-3 inline-block text-sm text-gold-400 hover:underline">
                  {t('filterClear')}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map((product) => (
                <MarketplaceProductCard
                  key={product.id}
                  product={product}
                  isFeatured={product.is_featured}
                  isVerified={product.is_verified}
                  locale={locale}
                  categoryIcon={catIconMap.get(product.category) ?? CATEGORY_ICONS[product.category] ?? '🏷️'}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ─── Constante WhatsApp ───────────────────────────────────────────────────────
const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

// ─── BANNIÈRE PERSONNALISÉE (P3) ──────────────────────────────────────────────
// Affichage UNIQUEMENT. Texte résolu serveur (strings passées au composant).
// niche détectée → accroche ciblée + lien vers son rayon ; cold-start → générique.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NichePromoBanner({
  nicheLabel,
  nicheIcon,
  nicheValue,
  t,
}: {
  nicheLabel: string | null
  nicheIcon: string | null
  nicheValue: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  if (nicheLabel && nicheValue) {
    return (
      <Link
        href={`/wholesale/marketplace?category=${encodeURIComponent(nicheValue)}`}
        className="block rounded-2xl border border-gold-300 bg-accent-soft p-4 shadow-gold hover:border-gold-400 transition-colors"
        aria-label={t('nichePromoTitle', { niche: nicheLabel })}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none flex-shrink-0">{nicheIcon ?? '🎯'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm sm:text-base font-bold text-foreground leading-tight">
              {t('nichePromoTitle', { niche: nicheLabel })}
            </p>
            <p className="text-xs text-muted mt-0.5">{t('nichePromoSubtitle')}</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 ms-auto flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
            {t('nichePromoCta')}
          </span>
        </div>
      </Link>
    )
  }

  // Cold-start / aucun signal : accroche générique neutre (aucune perso).
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm sm:text-base font-bold text-foreground leading-tight">
        {t('nichePromoGenericTitle')}
      </p>
      <p className="text-xs text-muted mt-0.5">{t('nichePromoGenericSubtitle')}</p>
    </div>
  )
}

// ─── ZONE 1 : Carte hero Maroc (P1 — refonte design validé) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MoroccoHeroCard({
  activeAvailability,
  totalProducts = 0,
  verifiedSuppliers = 0,
  localStockProducts = 0,
  t,
}: {
  activeAvailability?: string
  totalProducts?: number
  verifiedSuppliers?: number
  localStockProducts?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const moroccoActive = activeAvailability === 'local_stock'

  return (
    <Link
      href="/wholesale/marketplace?availability=local_stock"
      className={`block rounded-2xl border-2 p-4 sm:p-5 transition-all duration-200 ${
        moroccoActive
          ? 'border-gold-400 bg-accent-soft shadow-gold'
          : 'border-gold-300 bg-accent-soft hover:border-gold-400 hover:shadow-gold shadow-sm'
      }`}
    >
      {/* En-tête compact : drapeau + titre */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl leading-none flex-shrink-0">🇲🇦</span>
        <h2 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight flex-1 min-w-0">
          {t('moroccoHeroTitle')}
        </h2>
        {moroccoActive && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface text-accent-fg border border-gold-300 flex-shrink-0">
            {t('badgeActive')}
          </span>
        )}
      </div>

      {/* Avantages asymétriques : tuile large (+ barre or à gauche) | tuile compacte */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="col-span-2 rounded-xl bg-surface border border-line border-s-4 border-s-gold-400 px-3 py-2.5 flex items-center gap-2">
          <span className="text-lg leading-none flex-shrink-0">⚡</span>
          <span className="text-xs sm:text-sm font-bold text-foreground leading-tight">
            {t('moroccoAdvDelivery')}
          </span>
        </div>
        <div className="col-span-1 rounded-xl bg-surface border border-line px-3 py-2.5 flex items-center gap-2">
          <span className="text-lg leading-none flex-shrink-0">🛡</span>
          <span className="text-xs sm:text-sm font-bold text-foreground leading-tight">
            {t('moroccoTagNoCustoms')}
          </span>
        </div>
      </div>

      {/* Bande paiement pleine largeur */}
      <div className="rounded-xl bg-surface border border-line px-3 py-2.5 mb-4 flex items-center gap-2">
        <span className="text-lg leading-none flex-shrink-0">💳</span>
        <span className="text-xs sm:text-sm font-medium text-muted leading-tight">
          {t('moroccoAdvPayment')}
        </span>
      </div>

      {/* 3 chiffres réels alignés, séparés par traits fins */}
      <div className="flex items-stretch [&>*+*]:border-s [&>*+*]:border-line mb-4">
        <div className="flex-1 px-2 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-foreground leading-none">{totalProducts}</p>
          <p className="text-[10px] sm:text-xs text-muted mt-1 leading-tight">{t('moroccoStatProducts')}</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-accent-fg leading-none">{verifiedSuppliers}</p>
          <p className="text-[10px] sm:text-xs text-muted mt-1 leading-tight">{t('moroccoStatSuppliers')}</p>
        </div>
        <div className="flex-1 px-2 text-center">
          <p className="text-xl sm:text-2xl font-extrabold text-foreground leading-none">{localStockProducts}</p>
          <p className="text-[10px] sm:text-xs text-muted mt-1 leading-tight">{t('moroccoStatLocal')}</p>
        </div>
      </div>

      {/* Bouton or pleine largeur centré */}
      <span className="block w-full text-center px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:opacity-90 transition-opacity">
        {t('moroccoHeroCta')}
      </span>
    </Link>
  )
}

// ─── ZONE 2 : Grille pays import ─────────────────────────────────────────────

const INTERNATIONAL_SOURCES = [
  {
    origin: 'Turquie',
    flag: '🇹🇷',
    nameKey: 'countryTurkey' as const,
    taglineKey: 'countryTurkeyTagline' as const,
    noteKey: 'countryTurkeyNote' as const,
    activeCls: 'border-gold-400 bg-accent-soft ring-2 ring-gold-300',
    inactiveCls: 'border-line bg-surface hover:border-gold-300 hover:bg-accent-soft',
  },
  {
    origin: 'Chine',
    flag: '🇨🇳',
    nameKey: 'countryChina' as const,
    taglineKey: 'countryChinaTagline' as const,
    noteKey: 'countryChinaNote' as const,
    activeCls: 'border-gold-400 bg-accent-soft ring-2 ring-gold-300',
    inactiveCls: 'border-line bg-surface hover:border-gold-300 hover:bg-accent-soft',
  },
  {
    origin: 'Égypte',
    flag: '🇪🇬',
    nameKey: 'countryEgypt' as const,
    taglineKey: 'countryEgyptTagline' as const,
    noteKey: 'countryEgyptNote' as const,
    activeCls: 'border-gold-400 bg-accent-soft ring-2 ring-gold-300',
    inactiveCls: 'border-line bg-surface hover:border-gold-300 hover:bg-accent-soft',
  },
  {
    origin: 'Dubai',
    flag: '🇦🇪',
    nameKey: 'countryDubai' as const,
    taglineKey: 'countryDubaiTagline' as const,
    noteKey: 'countryDubaiNote' as const,
    activeCls: 'border-gold-400 bg-accent-soft ring-2 ring-gold-300',
    inactiveCls: 'border-line bg-surface hover:border-gold-300 hover:bg-accent-soft',
  },
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImportCountryGrid({ activeOrigin, t }: { activeOrigin?: string; t: any }) {
  const active = activeOrigin?.toLowerCase()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {INTERNATIONAL_SOURCES.map((src) => {
        const isActive = active === src.origin.toLowerCase()
        return (
          <Link
            key={src.origin}
            href={`/wholesale/marketplace?origin=${encodeURIComponent(src.origin)}`}
            className={`rounded-xl border p-3 flex flex-col gap-1 transition-all duration-150 ${
              isActive ? src.activeCls : src.inactiveCls
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl leading-none">{src.flag}</span>
              {isActive && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface text-foreground border border-line">
                  {t('badgeActive')}
                </span>
              )}
            </div>
            <p className="text-sm font-bold leading-tight text-foreground">{t(src.nameKey)}</p>
            <p className="text-[11px] leading-snug text-muted">{t(src.taglineKey)}</p>
            <p className="text-[10px] text-muted leading-snug mt-0.5">{t(src.noteKey)}</p>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Marketplace product card ─────────────────────────────────────────────────

type MoqTierRow = { min_quantity: number }

function MarketplaceProductCard({
  product,
  isFeatured = false,
  isVerified = false,
  locale,
  categoryIcon,
  t,
}: {
  product: SupplierProductPublic & {
    supplier_type: SupplierType
    subcategory?: string
    niche?: string
    unit?: string
    stock_quantity?: number | null
    lead_time_days?: number | null
    supplier_product_attachments?: { attachment_type: string; admin_status: string }[]
    supplier_product_moq_tiers?: MoqTierRow[]
    /** SERVER-ONLY routing discriminant — never rendered visually. */
    __source?: 'internal' | 'supplier'
  }
  isFeatured?: boolean
  isVerified?: boolean
  locale: string
  /** Icône catégorie résolue côté serveur depuis la map dynamique. */
  categoryIcon: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const displayName = product.public_name || product.product_name
  const isMorocco = product.supplier_type === 'morocco'
  const isLocalStock = product.availability_type === 'local_stock'
  // CTA d'affichage (A1) — décidé UNIQUEMENT sur origine + stock fournisseur (Maroc
  // local_stock + prix + stock > 0 → 'direct' ; import / rupture → 'rfq'), SANS dépendre
  // du miroir catalogue. La sur-commande (qty > stock) bascule en devis côté formulaire.
  // Le miroir reste exigé/garanti côté SERVEUR (addMarketplaceToCart + auto-provision).
  const ctaMode = getSupplierProductCtaMode(product)
  const moqTiers = product.supplier_product_moq_tiers ?? []
  const hasTiers = moqTiers.length > 1

  const cardBorder = isVerified
    ? 'border-gold-300 ring-1 ring-gold-100'
    : isFeatured
    ? 'border-gold-200 ring-1 ring-gold-100'
    : 'border-line'

  const deliveryLabel = isLocalStock
    ? '24–72h'
    : product.lead_time_days != null
    ? t('cardDeliveryDays', { days: product.lead_time_days })
    : t('cardDeliveryOnQuote')

  const price = product.suggested_wholesale_price_mad
  const resaleLow = price != null ? Math.round(price * 1.35) : null
  const resaleHigh = price != null ? Math.round(price * 1.6) : null
  const marginLow = resaleLow != null && price != null ? resaleLow - Math.round(price) : null
  const marginHigh = resaleHigh != null && price != null ? resaleHigh - Math.round(price) : null

  const numLocale = locale === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA'

  // Route to the correct detail page based on source — __source never rendered visually
  const productUrl = product.__source === 'internal'
    ? `/wholesale/products/${product.id}`
    : `/wholesale/marketplace/${product.id}`
  const waText = encodeURIComponent(
    `Bonjour, je souhaite un devis grossiste pour : ${displayName} (MOQ : ${product.min_quantity}${product.unit?.trim() ? ` ${product.unit.trim()}` : ''})`
  )
  const waUrl = `https://wa.me/${whatsappPhone}?text=${waText}`

  return (
    <article className={`group bg-surface rounded-xl border overflow-hidden flex flex-col hover:shadow-premium transition-all duration-200 ${cardBorder}`}>
      {/* Square image — compact density */}
      <Link href={productUrl} className="block relative aspect-[5/3] overflow-hidden bg-surface-2">
        {product.photos.length > 0 ? (
          <ProductCardImage src={product.photos[0]} alt={displayName} category={product.category} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-surface-2">
            <span className="text-4xl">{categoryIcon}</span>
            <span className="text-[10px] text-muted font-semibold text-center px-3 leading-tight line-clamp-2">{displayName}</span>
          </div>
        )}

        {/* Top-left: origin badge */}
        {product.origin_country && (
          <div className="absolute top-2 start-2">
            <OriginBadge country={product.origin_country} className="bg-surface/95 shadow-sm" />
          </div>
        )}

        {/* Top-right: verified / featured */}
        {(isVerified || isFeatured) && (
          <div className="absolute top-2 end-2">
            {isVerified ? <VerifiedBadge /> : <FeaturedBadge />}
          </div>
        )}

        {/* Bottom-left: stock tag */}
        {isLocalStock && (
          <div className="absolute bottom-2 start-2 flex gap-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-soft text-success-fg font-semibold border border-success">
              {t('cardStockLocal')}
            </span>
          </div>
        )}
      </Link>

      {/* Card body */}
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        {/* Supplier + verification badge */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-muted font-medium leading-none">
            {isMorocco ? `🇲🇦 ${t('cardSupplierMorocco')}` : `🌍 ${t('cardSupplierIntl')}`}
          </span>
          {isVerified && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent-soft text-accent-fg leading-none">
              ✓ {t('cardVerified')}
            </span>
          )}
          {!isVerified && isFeatured && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-accent-soft text-accent-fg leading-none">
              ★ {t('cardPremium')}
            </span>
          )}
        </div>

        {/* Product name — linked */}
        <Link href={productUrl} className="block">
          <h3 className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1 hover:text-gold-400 transition-colors">
            {displayName}
          </h3>
        </Link>

        {/* MOQ + delivery */}
        <div className="flex gap-1 flex-wrap">
          <MOQChip qty={product.min_quantity} unit={product.unit ?? ''} />
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line font-medium">
            🚚 {deliveryLabel}
          </span>
        </div>

        {/* Stock quantity */}
        {product.stock_quantity != null && (
          <p className="text-[10px] leading-none">
            <span className={product.stock_quantity > 0 ? 'text-success-fg font-semibold' : 'text-danger-fg font-semibold'}>
              {product.stock_quantity > 0
                ? t('cardStockCount', { count: product.stock_quantity.toLocaleString(numLocale) })
                : t('cardOutOfStock')
              }
            </span>
          </p>
        )}

        {/* Price + resale/margin + CTAs */}
        <div className="pt-1.5 border-t border-line mt-auto">
          {price != null ? (
            <>
              <p className="text-sm font-bold text-foreground leading-none">
                {t('cardPrice', { price: price.toLocaleString(numLocale) })}
                {hasTiers && (
                  <span className="text-[9px] font-normal text-faint ms-1">· {t('cardPriceTiers')}</span>
                )}
              </p>
              {/* Import : prix HORS transport/douane (inconnus à ce stade) — mention honnête */}
              {!isLocalStock && (
                <p className="text-[9px] text-faint leading-none mt-0.5">{t('cardImportPriceNote')}</p>
              )}
              {resaleLow != null && resaleHigh != null && (
                <div className="mt-0.5 space-y-0.5">
                  <p className="text-[9px] text-muted leading-none">
                    {t('cardResale', {
                      low: resaleLow.toLocaleString(numLocale),
                      high: resaleHigh.toLocaleString(numLocale),
                    })}
                  </p>
                  {isLocalStock ? (
                    // Stock Maroc : marge fiable (pas de transport) → chiffre affiché.
                    marginLow != null && marginHigh != null && (
                      <p className="text-[9px] text-success-fg font-semibold leading-none">
                        {t('cardMargin', {
                          low: marginLow.toLocaleString(numLocale),
                          high: marginHigh.toLocaleString(numLocale),
                        })}
                      </p>
                    )
                  ) : (
                    // Import : marge dépend du transport/douane → AUCUN chiffre, message devis.
                    <p className="text-[9px] text-accent-fg font-medium leading-none">
                      {t('cardMarginQuote')}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs font-semibold text-muted">{t('cardOnQuote')}</p>
          )}

          {/* Primary CTA */}
          <Link
            href={productUrl}
            className="mt-1.5 block w-full text-center text-[10px] font-bold py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {ctaMode === 'direct' ? t('cardCtaOrder') : t('cardCtaQuote')}
          </Link>

          {/* Secondary CTA */}
          {ctaMode === 'rfq' && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block w-full text-center text-[8px] font-normal py-1 text-muted hover:text-foreground hover:underline underline-offset-2"
            >
              🟢 {t('cardCtaWhatsapp')}
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
