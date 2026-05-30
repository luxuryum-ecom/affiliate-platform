import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { MozounaLogo, OriginBadge, CategoryBadge, AvailabilityBadge, SupplierTypeBadge, VerifiedBadge, FeaturedBadge } from '@/components/shared/branding'
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
    ? 'border-amber-300 ring-1 ring-amber-200'
    : isFeatured
    ? 'border-indigo-300 ring-1 ring-indigo-100'
    : 'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow ${cardBorder}`}>
      {/* Photo */}
      {product.photos.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.photos[0]}
          alt={displayName}
          className="w-full aspect-[4/3] object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-4xl text-gray-300">
          📦
        </div>
      )}

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Premium badges */}
        {(isVerified || isFeatured) && (
          <div className="flex gap-1.5">
            {isVerified && <VerifiedBadge />}
            {isFeatured && !isVerified && <FeaturedBadge />}
          </div>
        )}

        {/* Classification badges */}
        <div className="flex flex-wrap gap-1">
          <SupplierTypeBadge type={isMorocco ? 'morocco' : 'international'} />
          <AvailabilityBadge type={product.availability_type} />
        </div>

        {/* Category + origin row */}
        <div className="flex flex-wrap gap-1">
          {product.category && (
            <CategoryBadge category={product.category} subcategory={subcategoryLabel || undefined} />
          )}
          {product.origin_country && (
            <OriginBadge country={product.origin_country} />
          )}
        </div>

        {/* Name */}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 mt-0.5">
          {displayName}
        </h3>

        {displayDescription && (
          <p className="text-xs text-gray-500 line-clamp-2">{displayDescription}</p>
        )}

        {/* MOQ + lead time */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-xs text-gray-500">
            MOQ : <span className="font-semibold text-gray-800">{product.min_quantity} {product.unit ?? 'u.'}</span>
          </span>
          {product.lead_time_days != null && (
            <span className="text-xs text-gray-500">
              Délai : <span className="font-semibold text-gray-800">{product.lead_time_days}j</span>
            </span>
          )}
          {product.stock_quantity != null && (
            <span className={`text-xs font-medium ${product.stock_quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
              {product.stock_quantity > 0 ? `✓ ${product.stock_quantity} en stock` : '✗ Épuisé'}
            </span>
          )}
        </div>

        {/* Media badges */}
        {(hasCatalog || hasVideo || hasSample) && (
          <div className="flex flex-wrap gap-1">
            {hasCatalog && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">📒 Catalogue</span>}
            {hasVideo   && <span className="text-xs px-1.5 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-100">🎥 Vidéo</span>}
            {hasSample  && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100">🧪 Échantillon</span>}
          </div>
        )}

        {/* International note */}
        {!isMorocco && (
          <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 border border-blue-100">
            🔒 Paiement via plateforme — Transport & douane inclus
          </p>
        )}

        {/* Price + CTA */}
        <div className="mt-auto pt-2 border-t border-gray-100">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-gray-400">{isMorocco ? 'Prix de gros' : 'Prix final TTC'}</p>
              <p className="text-base font-bold text-gray-900">
                {product.suggested_wholesale_price_mad != null
                  ? `${product.suggested_wholesale_price_mad.toLocaleString('fr-MA')} MAD`
                  : 'Sur devis'}
              </p>
              {!isMorocco && product.suggested_wholesale_price_mad != null && (
                <p className="text-xs text-gray-400">Transport + douane inclus</p>
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
              className="shrink-0 text-xs px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Détails
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
