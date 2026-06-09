import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo, OriginBadge, VerifiedBadge, FeaturedBadge, MOQChip } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { PRODUCT_CATEGORIES, getSubcategories, ORIGIN_COUNTRIES } from '@/lib/taxonomy'
import { ProductCardImage } from '@/components/wholesale/product-card-image'
import { MarketplaceFilters } from '@/components/wholesale/marketplace-filters'
import { SourcingRequestCta } from '@/components/wholesale/sourcing-request-cta'
import { getSupplierProductCtaMode } from '@/lib/wholesale-cta'
import type { Profile, SupplierProductPublic, SupplierType } from '@/types/database'

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

  const [t, locale, profileResult, productsResult] = await Promise.all([
    getTranslations('wholesale.marketplace'),
    getLocale(),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products_wholesaler_read')
      .select(
        'id, product_name, category, subcategory, niche, description, photos, min_quantity, origin_country, availability_type, target_buyer_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, lead_time_days, export_countries, created_at, is_featured, is_verified, supplier_product_attachments(attachment_type, admin_status), supplier_product_moq_tiers(min_quantity, unit_price_usd)'
      )
      .order('created_at', { ascending: false }),
  ])

  const tCommon = await getTranslations('wholesale.common')

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null

  type MoqTierRow = { min_quantity: number; unit_price_usd: number }
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
  }
  let products = (productsResult.data ?? []) as MarketplaceProduct[]

  // Premium suppliers first
  products.sort((a, b) => {
    const scoreA = (a.is_verified ? 2 : 0) + (a.is_featured ? 1 : 0)
    const scoreB = (b.is_verified ? 2 : 0) + (b.is_featured ? 1 : 0)
    return scoreB - scoreA
  })

  // Apply filters
  if (filters.q) {
    const q = filters.q.toLowerCase()
    products = products.filter((p) =>
      (p.public_name ?? p.product_name).toLowerCase().includes(q) ||
      (p.public_description ?? p.description ?? '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.niche.toLowerCase().includes(q)
    )
  }
  if (filters.category) {
    products = products.filter((p) => p.category === filters.category)
  }
  if (filters.subcategory) {
    const sub = filters.subcategory.toLowerCase()
    products = products.filter((p) =>
      p.subcategory.toLowerCase().includes(sub) || p.niche.toLowerCase().includes(sub)
    )
  }
  if (filters.origin) {
    products = products.filter((p) =>
      p.origin_country.toLowerCase().includes(filters.origin!.toLowerCase())
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

  // Trust metrics — real counts from unfiltered approved products
  const allApproved = (productsResult.data ?? []) as MarketplaceProduct[]
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

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Page title ──────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {/* ── Country source section ───────────────────────────────────────────── */}
        <CountrySourceSection
          activeOrigin={filters.origin}
          activeAvailability={filters.availability}
          totalProducts={totalProductCount}
          verifiedSuppliers={verifiedSupplierCount}
          localStockProducts={localStockProductCount}
          locale={locale}
          t={t}
        />

        {/* ── Trust strip ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6 pb-5 border-b border-line">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-medium">
            ✓ {t('trustBadgeVerified')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            🏭 {t('trustBadgeMorocco')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            🌍 {t('trustBadgeImport')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
            🔒 {t('trustBadgeSecure')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 font-medium">
            🛡 {t('trustBadgeProtected')}
          </span>
          <Link
            href="/wholesale/marketplace?availability=import_on_demand"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium hover:bg-blue-100 transition-colors"
          >
            📦 {t('trustBadgeSeeImport')}
          </Link>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────────── */}
        <MarketplaceFilters filterTitle={t('filterTitle')}>
        <form method="GET" className="bg-surface rounded-xl border border-line p-4 shadow-premium">
          {/* Row 1: keyword + category + subcategory + origin */}
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

            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t('filterCategory')}</label>
              <select
                name="category"
                defaultValue={filters.category ?? ''}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                <option value="">{t('filterCategoryAll')}</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

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
          </div>

          {/* Row 2: supplier type + availability + MOQ max + lead time max + in stock */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
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

        {/* ── Result count ─────────────────────────────────────────────────────── */}
        <p className="text-sm text-muted mb-4">
          <span className="font-semibold text-foreground">{products.length}</span>{' '}
          {isFiltered
            ? (products.length !== 1 ? t('resultFoundPlural') : t('resultFound'))
            : (products.length !== 1 ? t('resultAvailablePlural') : t('resultAvailable'))
          }{' '}
        </p>

        {/* ── Product grid ─────────────────────────────────────────────────────── */}
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
                t={t}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Country source section ───────────────────────────────────────────────────

const INTERNATIONAL_SOURCES = [
  {
    origin: 'Turquie',
    flag: '🇹🇷',
    tagline: 'textile',
    note: 'import-7-14',
    activeCls: 'border-red-400 bg-red-500/15 ring-2 ring-red-400/50',
    inactiveCls: 'border-line bg-surface hover:border-red-400/50 hover:bg-red-500/10',
    nameCls: 'text-red-300',
    taglineCls: 'text-red-400',
  },
  {
    origin: 'Chine',
    flag: '🇨🇳',
    tagline: 'volume',
    note: 'maritime-20-45',
    activeCls: 'border-rose-400 bg-rose-500/15 ring-2 ring-rose-400/50',
    inactiveCls: 'border-line bg-surface hover:border-rose-400/50 hover:bg-rose-500/10',
    nameCls: 'text-rose-300',
    taglineCls: 'text-rose-400',
  },
  {
    origin: 'Égypte',
    flag: '🇪🇬',
    tagline: 'coton',
    note: 'stock-variable',
    activeCls: 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/50',
    inactiveCls: 'border-line bg-surface hover:border-amber-400/50 hover:bg-amber-500/10',
    nameCls: 'text-amber-300',
    taglineCls: 'text-amber-400',
  },
  {
    origin: 'Dubai',
    flag: '🇦🇪',
    tagline: 'hub',
    note: 'groupee',
    activeCls: 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/50',
    inactiveCls: 'border-line bg-surface hover:border-sky-400/50 hover:bg-sky-500/10',
    nameCls: 'text-sky-300',
    taglineCls: 'text-sky-400',
  },
] as const

// Country display names & taglines per locale — non-translatable proper nouns stay as-is
const COUNTRY_DISPLAY: Record<string, { name: string; tagline: string; note: string }> = {
  Turquie: { name: 'Turquie', tagline: 'Textile & prêt-à-porter', note: 'Import 7–14 j · MOQ souple' },
  Chine:   { name: 'Chine',   tagline: 'Gros volume · Prix usine', note: 'Maritime & aérien · 20–45 j' },
  Égypte:  { name: 'Égypte',  tagline: 'Coton & textile',          note: 'Prix avantageux · Stock variable' },
  Dubai:   { name: 'Dubai',   tagline: 'Hub logistique multi-origines', note: 'Commande groupée · Réexportation' },
}

const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CountrySourceSection({
  activeOrigin,
  activeAvailability,
  totalProducts = 0,
  verifiedSuppliers = 0,
  localStockProducts = 0,
  t,
}: {
  activeOrigin?: string
  activeAvailability?: string
  totalProducts?: number
  verifiedSuppliers?: number
  localStockProducts?: number
  locale: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const active = activeOrigin?.toLowerCase()
  const moroccoActive = activeAvailability === 'local_stock'

  return (
    <section className="mb-7 pb-6 border-b border-line">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground">{t('sourceTitle')}</h2>
          <p className="text-xs text-muted mt-0.5">{t('sourceSubtitle')}</p>
        </div>
        {active && (
          <Link
            href="/wholesale/marketplace"
            className="text-xs text-muted hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {t('sourceViewAll')}
          </Link>
        )}
      </div>

      {/* ── Section 1: Morocco hero ───────────────────────────────────────── */}
      <Link
        href="/wholesale/marketplace?availability=local_stock"
        className={`block rounded-2xl border-2 p-5 mb-4 transition-all duration-200 ${
          moroccoActive
            ? 'border-emerald-500 bg-emerald-600 shadow-lg shadow-emerald-200'
            : 'border-emerald-400 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 shadow-md'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="text-5xl leading-none flex-shrink-0">🇲🇦</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  {t('moroccoHeroTitle')}
                </h3>
                {moroccoActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200">
                    {t('badgeActive')}
                  </span>
                )}
              </div>
              <p className="text-emerald-100 text-sm font-medium mb-2">
                {t('moroccoHeroSubtitle')}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/20 text-white font-medium border border-white/30">
                  ✓ {t('moroccoTagDelivery')}
                </span>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/20 text-white font-medium border border-white/30">
                  ✓ {t('moroccoTagNoCustoms')}
                </span>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-white/20 text-white font-medium border border-white/30">
                  ✓ {t('moroccoTagPayment')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0">
            <span className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-emerald-700 font-bold text-sm shadow-sm hover:shadow transition-shadow whitespace-nowrap">
              {t('moroccoHeroCta')}
            </span>
          </div>
        </div>
      </Link>

      {/* ── Trust metrics strip ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
          📦 {t('trustTotalProducts', { count: totalProducts })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-medium">
          ✓ {t('trustVerifiedSuppliers', { count: verifiedSuppliers })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium">
          🚚 {t('trustLocalDelivery', { count: localStockProducts })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
          🔒 {t('trustSecurePayment')}
        </span>
      </div>

      {/* ── Section 2: International grid ────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gold-500 uppercase tracking-wider mb-3">
          🌍 {t('intlTitle')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {INTERNATIONAL_SOURCES.map((src) => {
            const isActive = active === src.origin.toLowerCase()
            const display = COUNTRY_DISPLAY[src.origin]
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
                <p className={`text-sm font-bold leading-tight ${src.nameCls}`}>{display.name}</p>
                <p className={`text-[11px] leading-snug ${src.taglineCls}`}>{display.tagline}</p>
                <p className="text-[10px] text-muted leading-snug mt-0.5">{display.note}</p>
              </Link>
            )
          })}
        </div>

        <SourcingRequestCta whatsappPhone={whatsappPhone} />
      </div>
    </section>
  )
}

// ─── Marketplace product card ─────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  'Textile':              '👗',
  'Matières premières':   '🧵',
  'Chaussures':           '👟',
  'Cosmétique & hygiène': '💄',
  'Alimentaire':          '🥗',
  'Maison & packaging':   '📦',
  'Artisanat':            '🧶',
}

type MoqTierRow = { min_quantity: number; unit_price_usd: number }

function MarketplaceProductCard({
  product,
  isFeatured = false,
  isVerified = false,
  locale,
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
  }
  isFeatured?: boolean
  isVerified?: boolean
  locale: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const displayName = product.public_name || product.product_name
  const categoryIcon = CATEGORY_ICONS[product.category] ?? '🏷️'
  const isMorocco = product.supplier_type === 'morocco'
  const isLocalStock = product.availability_type === 'local_stock'
  const ctaMode = getSupplierProductCtaMode(product)
  const moqTiers = product.supplier_product_moq_tiers ?? []
  const hasTiers = moqTiers.length > 1

  const cardBorder = isVerified
    ? 'border-amber-300 ring-1 ring-amber-100'
    : isFeatured
    ? 'border-indigo-300 ring-1 ring-indigo-100'
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

  const productUrl = `/wholesale/marketplace/${product.id}`
  const waText = encodeURIComponent(
    `Bonjour, je souhaite un devis grossiste pour : ${displayName} (MOQ : ${product.min_quantity} ${product.unit ?? 'u.'})`
  )
  const waUrl = `https://wa.me/${whatsappPhone}?text=${waText}`

  return (
    <article className={`group bg-surface rounded-xl border overflow-hidden flex flex-col hover:shadow-premium transition-all duration-200 ${cardBorder}`}>
      {/* Square image — compact density */}
      <Link href={productUrl} className="block relative aspect-[5/3] overflow-hidden bg-gradient-to-br from-stone-50 to-amber-50">
        {product.photos.length > 0 ? (
          <ProductCardImage src={product.photos[0]} alt={displayName} category={product.category} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-amber-50 via-stone-50 to-amber-100">
            <span className="text-4xl">{categoryIcon}</span>
            <span className="text-[10px] text-stone-500 font-semibold text-center px-3 leading-tight line-clamp-2">{displayName}</span>
          </div>
        )}

        {/* Top-left: origin badge */}
        {product.origin_country && (
          <div className="absolute top-2 start-2">
            <OriginBadge country={product.origin_country} className="bg-white/95 shadow-sm" />
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
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600/90 text-white font-semibold">
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
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 leading-none">
              ✓ {t('cardVerified')}
            </span>
          )}
          {!isVerified && isFeatured && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 leading-none">
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
          <MOQChip qty={product.min_quantity} unit={product.unit ?? 'u.'} />
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">
            🚚 {deliveryLabel}
          </span>
        </div>

        {/* Stock quantity */}
        {product.stock_quantity != null && (
          <p className="text-[10px] leading-none">
            <span className={product.stock_quantity > 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
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
              {resaleLow != null && resaleHigh != null && (
                <div className="mt-0.5 space-y-0.5">
                  <p className="text-[9px] text-muted leading-none">
                    {t('cardResale', {
                      low: resaleLow.toLocaleString(numLocale),
                      high: resaleHigh.toLocaleString(numLocale),
                    })}
                  </p>
                  {marginLow != null && marginHigh != null && (
                    <p className="text-[9px] text-emerald-400 font-semibold leading-none">
                      {t('cardMargin', {
                        low: marginLow.toLocaleString(numLocale),
                        high: marginHigh.toLocaleString(numLocale),
                      })}
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
              className="mt-1 block w-full text-center text-[8px] font-normal py-1 text-emerald-400 hover:text-emerald-300 hover:underline underline-offset-2"
            >
              🟢 {t('cardCtaWhatsapp')}
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
