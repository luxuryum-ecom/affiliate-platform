import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { MozounaLogo, OriginBadge, CategoryBadge, AvailabilityBadge, SupplierTypeBadge, VerifiedBadge, FeaturedBadge, GoldSupplierBadge, FastResponseBadge, SupplierLogoBlock, MOQChip, LeadTimeChip, StockChip } from '@/components/shared/branding'
import { PRODUCT_CATEGORIES, getSubcategories, ORIGIN_COUNTRIES } from '@/lib/taxonomy'
import type { Profile, SupplierProductPublic, SupplierType } from '@/types/database'

export const metadata = { title: 'Marketplace fournisseurs — Espace Grossiste' }

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

  const [profileResult, productsResult, premiumSubsResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      .select(
        'id, supplier_id, product_name, category, subcategory, niche, description, photos, min_quantity, origin_country, availability_type, target_buyer_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, lead_time_days, export_countries, created_at, supplier_product_attachments(attachment_type, admin_status)'
      )
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('supplier_subscriptions')
      .select('supplier_id, plan:premium_plans(featured_badge, verified_badge)')
      .eq('status', 'active'),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null

  type PremiumFlags = { featured_badge: boolean; verified_badge: boolean }
  type PremiumSubRow = { supplier_id: string; plan: PremiumFlags | PremiumFlags[] | null }
  const premiumMap = new Map<string, PremiumFlags>()
  for (const sub of (premiumSubsResult.data ?? []) as PremiumSubRow[]) {
    const flags = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan
    if (flags) premiumMap.set(sub.supplier_id, flags)
  }

  type MarketplaceProduct = SupplierProductPublic & {
    supplier_id: string
    supplier_type: SupplierType
    subcategory: string
    niche: string
    unit: string
    stock_quantity: number | null
    lead_time_days: number | null
    export_countries: string[]
    supplier_product_attachments: { attachment_type: string; admin_status: string }[]
    is_featured: boolean
    is_verified: boolean
  }
  let products = ((productsResult.data ?? []) as (MarketplaceProduct & { supplier_id: string })[])
    .map((p) => ({
      ...p,
      is_featured: premiumMap.get(p.supplier_id)?.featured_badge ?? false,
      is_verified: premiumMap.get(p.supplier_id)?.verified_badge ?? false,
    }))

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
    products = products.filter((p) => p.availability_type === filters.availability)
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

  const subcategoryOptions = filters.category ? getSubcategories(filters.category) : []
  const isFiltered = !!(
    filters.q || filters.category || filters.subcategory || filters.origin ||
    filters.availability || filters.supplier_type || filters.max_moq ||
    filters.in_stock || filters.max_lead_time
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-gray-300">|</span>
            <nav className="hidden sm:flex items-center gap-4 text-sm">
              <Link href="/wholesale/dashboard" className="text-gray-500 hover:text-gray-900 transition-colors">
                Dashboard
              </Link>
              <span className="font-semibold text-gray-900">Marketplace</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden md:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Page title ──────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Marketplace fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Produits sélectionnés de nos fournisseurs vérifiés. Demandez un devis directement.
          </p>
        </div>

        {/* ── Country source section ───────────────────────────────────────────── */}
        <CountrySourceSection activeOrigin={filters.origin} />

        {/* ── Trust strip ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6 pb-5 border-b border-gray-200">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-medium">
            ✓ Fournisseurs vérifiés
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            🏭 Stock local Maroc
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            🌍 Import international
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
            🔒 Paiement sécurisé plateforme
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 font-medium">
            🛡 Identité fournisseur protégée
          </span>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────────── */}
        <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
          {/* Row 1: keyword + category + subcategory + origin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div className="lg:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
              <input
                name="q"
                type="text"
                defaultValue={filters.q ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Nom, catégorie, description..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
              <select
                name="category"
                defaultValue={filters.category ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Toutes les catégories</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sous-catégorie</label>
              {subcategoryOptions.length > 0 ? (
                <select
                  name="subcategory"
                  defaultValue={filters.subcategory ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Toutes</option>
                  {subcategoryOptions.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              ) : (
                <input
                  name="subcategory"
                  type="text"
                  defaultValue={filters.subcategory ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="ex: Femme, Hijab..."
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pays d&apos;origine</label>
              <select
                name="origin"
                defaultValue={filters.origin ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tous pays</option>
                {ORIGIN_COUNTRIES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: supplier type + availability + MOQ max + lead time max + in stock */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fournisseur</label>
              <select
                name="supplier_type"
                defaultValue={filters.supplier_type ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tous</option>
                <option value="morocco">🇲🇦 Maroc</option>
                <option value="international">🌍 International</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Disponibilité</label>
              <select
                name="availability"
                defaultValue={filters.availability ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tout</option>
                <option value="local_stock">Stock disponible</option>
                <option value="import_on_demand">Import / Commande</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">MOQ max (unités)</label>
              <input
                name="max_moq"
                type="number"
                min={1}
                defaultValue={filters.max_moq ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Délai max (jours)</label>
              <input
                name="max_lead_time"
                type="number"
                min={1}
                defaultValue={filters.max_lead_time ?? ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 30"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  name="in_stock"
                  type="checkbox"
                  value="1"
                  defaultChecked={filters.in_stock === '1'}
                  className="rounded border-gray-300 w-4 h-4 accent-gray-900"
                />
                <span className="text-xs text-gray-600 font-medium">En stock seulement</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Filtrer
            </button>
            {isFiltered && (
              <Link
                href="/wholesale/marketplace"
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Effacer les filtres
              </Link>
            )}
          </div>
        </form>

        {/* ── Result count ─────────────────────────────────────────────────────── */}
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-semibold text-gray-900">{products.length}</span>{' '}
          produit{products.length !== 1 ? 's' : ''}
          {isFiltered ? ' trouvé' + (products.length !== 1 ? 's' : '') : ' disponible' + (products.length !== 1 ? 's' : '')}
        </p>

        {/* ── Product grid ─────────────────────────────────────────────────────── */}
        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm text-gray-500">
              {isFiltered ? 'Aucun produit ne correspond à ces filtres.' : 'Aucun produit disponible pour le moment.'}
            </p>
            {isFiltered && (
              <Link href="/wholesale/marketplace" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                Effacer les filtres
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <MarketplaceProductCard
                key={product.id}
                product={product}
                isFeatured={product.is_featured}
                isVerified={product.is_verified}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Country source section ───────────────────────────────────────────────────

const COUNTRY_SOURCES = [
  {
    origin: 'Maroc',
    flag: '🇲🇦',
    name: 'Maroc',
    tagline: 'Stock local prêt à livrer',
    bullets: ['Livraison 24–72h', 'Aucune douane', 'Paiement flexible'],
    accentCls: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100',
    activeCls: 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-400',
    inactiveCls: 'border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50',
    nameCls: 'text-emerald-800',
    taglineCls: 'text-emerald-600',
    bulletCls: 'text-emerald-700',
  },
  {
    origin: 'Turquie',
    flag: '🇹🇷',
    name: 'Turquie',
    tagline: 'Textile & prêt-à-porter',
    bullets: ['Import rapide 7–14 j', 'Qualité finition élevée', 'MOQ souple'],
    accentCls: '',
    activeCls: 'border-red-400 bg-red-50 ring-2 ring-red-300',
    inactiveCls: 'border-gray-200 bg-white hover:border-red-200 hover:bg-red-50',
    nameCls: 'text-red-800',
    taglineCls: 'text-red-600',
    bulletCls: 'text-red-700',
  },
  {
    origin: 'Chine',
    flag: '🇨🇳',
    name: 'Chine',
    tagline: 'Gros volume, prix usine',
    bullets: ['Maritime & aérien', 'Prix compétitif', 'Délai 20–45 j'],
    accentCls: '',
    activeCls: 'border-rose-400 bg-rose-50 ring-2 ring-rose-300',
    inactiveCls: 'border-gray-200 bg-white hover:border-rose-200 hover:bg-rose-50',
    nameCls: 'text-rose-800',
    taglineCls: 'text-rose-600',
    bulletCls: 'text-rose-700',
  },
  {
    origin: 'Égypte',
    flag: '🇪🇬',
    name: 'Égypte',
    tagline: 'Opportunités selon dispo.',
    bullets: ['Coton & textile', 'Prix avantageux', 'Stock variable'],
    accentCls: '',
    activeCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-300',
    inactiveCls: 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50',
    nameCls: 'text-amber-800',
    taglineCls: 'text-amber-600',
    bulletCls: 'text-amber-700',
  },
  {
    origin: 'Dubai',
    flag: '🇦🇪',
    name: 'Dubai',
    tagline: 'Opportunités selon dispo.',
    bullets: ['Hub logistique', 'Multi-origines', 'Commande groupée'],
    accentCls: '',
    activeCls: 'border-sky-400 bg-sky-50 ring-2 ring-sky-300',
    inactiveCls: 'border-gray-200 bg-white hover:border-sky-200 hover:bg-sky-50',
    nameCls: 'text-sky-800',
    taglineCls: 'text-sky-600',
    bulletCls: 'text-sky-700',
  },
] as const

const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'
const sourcingMessage = encodeURIComponent(
  'Bonjour, je souhaite demander un sourcing personnalisé pour mon activité de gros. Pouvez-vous me contacter ?'
)

function CountrySourceSection({ activeOrigin }: { activeOrigin?: string }) {
  const active = activeOrigin?.toLowerCase()

  return (
    <section className="mb-7 pb-6 border-b border-gray-200">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-900">Choisissez votre source d&apos;achat</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sélectionnez un pays pour filtrer les produits disponibles
          </p>
        </div>
        {active && (
          <Link
            href="/wholesale/marketplace"
            className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
          >
            Voir tout
          </Link>
        )}
      </div>

      {/* Country cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {COUNTRY_SOURCES.map((src) => {
          const isActive = active === src.origin.toLowerCase()
          return (
            <Link
              key={src.origin}
              href={`/wholesale/marketplace?origin=${encodeURIComponent(src.origin)}`}
              className={`rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-150 ${
                isActive ? src.activeCls : src.inactiveCls
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl leading-none">{src.flag}</span>
                {isActive && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/80 text-gray-700 border border-gray-200">
                    Actif
                  </span>
                )}
              </div>
              <div>
                <p className={`text-sm font-bold leading-tight ${src.nameCls}`}>{src.name}</p>
                <p className={`text-[11px] leading-snug mt-0.5 ${src.taglineCls}`}>{src.tagline}</p>
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {src.bullets.map((b) => (
                  <li key={b} className={`text-[10px] flex items-start gap-1 ${src.bulletCls}`}>
                    <span className="mt-px opacity-60">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Link>
          )
        })}
      </div>

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/wholesale/marketplace?origin=Maroc&in_stock=1"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          🇲🇦 Voir stock Maroc
        </Link>
        <Link
          href="/wholesale/marketplace?availability=import_on_demand"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          🌍 Importer sur commande
        </Link>
        <a
          href={`https://wa.me/${whatsappPhone}?text=${sourcingMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          💬 Demander sourcing personnalisé
        </a>
      </div>
    </section>
  )
}

// ─── Marketplace product card ─────────────────────────────────────────────────

function MarketplaceProductCard({
  product,
  isFeatured = false,
  isVerified = false,
}: {
  product: SupplierProductPublic & {
    supplier_type: SupplierType
    subcategory?: string
    niche?: string
    unit?: string
    stock_quantity?: number | null
    lead_time_days?: number | null
    supplier_product_attachments?: { attachment_type: string; admin_status: string }[]
  }
  isFeatured?: boolean
  isVerified?: boolean
}) {
  const approvedAttachments = (product.supplier_product_attachments ?? []).filter(
    (a) => a.admin_status === 'approved'
  )
  const hasCatalog = approvedAttachments.some((a) => ['pdf_catalog', 'pdf_datasheet'].includes(a.attachment_type))
  const hasVideo   = approvedAttachments.some((a) => a.attachment_type === 'video')
  const hasSample  = product.availability_type === 'local_stock' || hasCatalog
  const displayName = product.public_name || product.product_name
  const displayDescription = product.public_description || product.description
  const isMorocco = product.supplier_type === 'morocco'
  const subcategoryLabel = product.subcategory || product.niche || ''

  const cardBorder = isVerified
    ? 'border-amber-300 ring-1 ring-amber-100'
    : isFeatured
    ? 'border-indigo-300 ring-1 ring-indigo-100'
    : 'border-gray-200'

  const stockQty = product.stock_quantity ?? 0

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col hover:shadow-sm transition-all duration-200 ${cardBorder}`}>
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
        {product.photos.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.photos[0]}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-4xl text-gray-300">▢</span>
          </div>
        )}

        {/* Country flag overlay — top left */}
        {product.origin_country && (
          <div className="absolute top-2 left-2">
            <OriginBadge
              country={product.origin_country}
              className="bg-white/95 text-xs"
            />
          </div>
        )}

        {/* Premium badge — top right */}
        {(isVerified || isFeatured) && (
          <div className="absolute top-2 right-2">
            {isVerified ? <VerifiedBadge /> : <FeaturedBadge />}
          </div>
        )}
      </div>

      {/* Supplier identity block */}
      <div className="px-3 pt-3 flex items-center gap-2 min-w-0">
        <SupplierLogoBlock
          supplierType={isMorocco ? 'morocco' : 'international'}
          category={product.category}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SupplierTypeBadge type={isMorocco ? 'morocco' : 'international'} />
            {isVerified && <GoldSupplierBadge />}
            {isFeatured && !isVerified && <FastResponseBadge />}
          </div>
        </div>
      </div>

      <div className="px-3 pt-2 pb-3 flex flex-col gap-2 flex-1">
        {/* Category */}
        {product.category && (
          <CategoryBadge
            category={product.category}
            subcategory={subcategoryLabel || undefined}
          />
        )}

        {/* Name */}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
          {displayName}
        </h3>

        {displayDescription && (
          <p className="text-xs text-gray-500 line-clamp-2">{displayDescription}</p>
        )}

        {/* Spec chips */}
        <div className="flex flex-wrap gap-1.5">
          <MOQChip qty={product.min_quantity} unit={product.unit ?? 'u.'} />
          {product.lead_time_days != null && <LeadTimeChip days={product.lead_time_days} />}
          {product.stock_quantity != null && (
            <StockChip qty={stockQty} unit={product.unit ?? 'u.'} />
          )}
          <AvailabilityBadge type={product.availability_type} />
        </div>

        {/* Media capabilities */}
        {(hasCatalog || hasVideo || hasSample) && (
          <div className="flex flex-wrap gap-1">
            {hasCatalog && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                Catalogue
              </span>
            )}
            {hasVideo && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-100">
                Vidéo
              </span>
            )}
            {hasSample && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100">
                Échantillon
              </span>
            )}
          </div>
        )}

        {/* Platform guarantee note for international */}
        {!isMorocco && (
          <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 border border-blue-100">
            Paiement via plateforme — Transport & douane inclus
          </p>
        )}

        {/* Price + CTA */}
        <div className="mt-auto pt-2 border-t border-gray-100">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">
                {isMorocco ? 'Prix de gros' : 'Prix TTC'}
              </p>
              <p className="text-base font-bold text-gray-900">
                {product.suggested_wholesale_price_mad != null
                  ? `${product.suggested_wholesale_price_mad.toLocaleString('fr-MA')} MAD`
                  : 'Sur devis'}
              </p>
              {!isMorocco && product.suggested_wholesale_price_mad != null && (
                <p className="text-[10px] text-gray-400">Transport + douane inclus</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <MarketplaceQuoteForm
                supplierProductId={product.id}
                minQuantity={product.min_quantity}
              />
            </div>
            <Link
              href={`/wholesale/marketplace/${product.id}`}
              className="shrink-0 text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Profil →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
