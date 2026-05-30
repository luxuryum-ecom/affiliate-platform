import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import { SUPPLIER_CATEGORIES } from '@/types/database'
import type { Profile, SupplierProductPublic, SupplierType } from '@/types/database'

export const metadata = { title: 'Marketplace fournisseurs — Espace Grossiste' }

interface SearchParams {
  category?: string
  niche?: string
  origin?: string
  availability?: string
  supplier_type?: string
  min_qty?: string
  max_price?: string
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
        'id, supplier_id, product_name, category, niche, description, photos, min_quantity, origin_country, availability_type, target_buyer_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, supplier_type, unit, stock_quantity, lead_time_days, export_countries, created_at, supplier_product_attachments(attachment_type, admin_status)'
      )
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    // Fetch active premium subscriptions with badge flags — server-side only
    supabase
      .from('supplier_subscriptions')
      .select('supplier_id, plan:premium_plans(featured_badge, verified_badge)')
      .eq('status', 'active'),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null

  // Build premium badge lookup (supplier_id → flags) — never exposed to client
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

  // Premium suppliers appear first (featured > verified > rest)
  products.sort((a, b) => {
    const scoreA = (a.is_verified ? 2 : 0) + (a.is_featured ? 1 : 0)
    const scoreB = (b.is_verified ? 2 : 0) + (b.is_featured ? 1 : 0)
    return scoreB - scoreA
  })

  // Apply filters
  if (filters.category) {
    products = products.filter((p) => p.category === filters.category)
  }
  if (filters.niche) {
    products = products.filter((p) =>
      p.niche.toLowerCase().includes(filters.niche!.toLowerCase())
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
  if (filters.min_qty) {
    const qty = parseInt(filters.min_qty, 10)
    if (!isNaN(qty)) products = products.filter((p) => p.min_quantity >= qty)
  }
  if (filters.max_price) {
    const price = parseFloat(filters.max_price)
    if (!isNaN(price)) {
      products = products.filter(
        (p) => p.suggested_wholesale_price_mad == null || p.suggested_wholesale_price_mad <= price
      )
    }
  }

  // Additional filters (migration 035 fields)
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

  const allProducts = (productsResult.data ?? []) as MarketplaceProduct[]
  const origins = [...new Set(allProducts.map((p) => p.origin_country).filter(Boolean))].sort()
  const isFiltered = !!(
    filters.category || filters.niche || filters.origin ||
    filters.availability || filters.supplier_type || filters.min_qty || filters.max_price ||
    filters.max_moq || filters.in_stock || filters.max_lead_time
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Marketplace</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Marketplace fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Produits de nos fournisseurs sélectionnés. Demandez un devis directement.
          </p>
        </div>

        {/* Filters */}
        <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">

            {/* Category — predefined list */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
              <select
                name="category"
                defaultValue={filters.category ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Toutes</option>
                {SUPPLIER_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Supplier type */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Origine fournisseur</label>
              <select
                name="supplier_type"
                defaultValue={filters.supplier_type ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tous</option>
                <option value="morocco">Fournisseur Maroc</option>
                <option value="international">International</option>
              </select>
            </div>

            {/* Availability */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Disponibilité</label>
              <select
                name="availability"
                defaultValue={filters.availability ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tout</option>
                <option value="local_stock">Stock disponible</option>
                <option value="import_on_demand">Import / Demande</option>
              </select>
            </div>

            {/* Origin country */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pays d&apos;origine</label>
              <select
                name="origin"
                defaultValue={filters.origin ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Tous pays</option>
                {origins.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* Min quantity */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Qté min. max</label>
              <input
                name="min_qty"
                type="number"
                min={1}
                defaultValue={filters.min_qty ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 50"
              />
            </div>

            {/* Max price */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prix max (MAD)</label>
              <input
                name="max_price"
                type="number"
                min={0}
                defaultValue={filters.max_price ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 500"
              />
            </div>

            {/* Max MOQ */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">MOQ max</label>
              <input
                name="max_moq"
                type="number"
                min={1}
                defaultValue={filters.max_moq ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 500"
              />
            </div>

            {/* Max lead time */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Délai max (jours)</label>
              <input
                name="max_lead_time"
                type="number"
                min={1}
                defaultValue={filters.max_lead_time ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="ex: 30"
              />
            </div>

            {/* In stock only */}
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  name="in_stock"
                  type="checkbox"
                  value="1"
                  defaultChecked={filters.in_stock === '1'}
                  className="rounded border-gray-300"
                />
                <span className="text-xs text-gray-600">En stock uniquement</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Filtrer
            </button>
            {isFiltered && (
              <Link
                href="/wholesale/marketplace"
                className="px-4 py-1.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Effacer
              </Link>
            )}
          </div>
        </form>

        {/* Result count */}
        <p className="text-sm text-gray-500 mb-4">
          {products.length} produit{products.length !== 1 ? 's' : ''}
          {isFiltered ? ' trouvé' + (products.length !== 1 ? 's' : '') : ' disponible' + (products.length !== 1 ? 's' : '')}
        </p>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">
              {isFiltered ? 'Aucun produit ne correspond à ces filtres.' : 'Aucun produit disponible pour le moment.'}
            </p>
            {isFiltered && (
              <Link href="/wholesale/marketplace" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                Effacer les filtres
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
// Supplier identity is NEVER rendered. Price display depends on supplier_type:
//   - Morocco: show price directly (no customs, wholesale-only)
//   - International: show "Sur devis" or admin-set public price; never reveal supplier cost

function MarketplaceProductCard({
  product,
  isFeatured = false,
  isVerified = false,
}: {
  product: SupplierProductPublic & {
    supplier_type: SupplierType
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

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col ${isVerified ? 'border-amber-300 ring-1 ring-amber-200' : isFeatured ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-200'}`}>
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
        <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-3xl text-gray-300">
          📦
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {/* Premium badges — shown before origin badge */}
          {isVerified && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
              ✓ Vérifié
            </span>
          )}
          {isFeatured && !isVerified && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700">
              ★ Vedette
            </span>
          )}

          {/* Supplier type badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isMorocco
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isMorocco ? '🇲🇦 Maroc' : '🌍 International'}
          </span>

          {/* Availability badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            product.availability_type === 'import_on_demand'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {product.availability_type === 'import_on_demand' ? 'Import / Demande' : 'Stock disponible'}
          </span>

          {product.category && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {product.category}
            </span>
          )}
          {hasCatalog && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">📒 Catalogue</span>
          )}
          {hasVideo && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">🎥 Vidéo</span>
          )}
          {hasSample && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">🧪 Échantillon</span>
          )}
        </div>

        <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{displayName}</h3>

        {displayDescription && (
          <p className="text-xs text-gray-500 line-clamp-2">{displayDescription}</p>
        )}

        {/* Origin */}
        {product.origin_country && (
          <p className="text-xs text-gray-500">
            Origine : <span className="text-gray-700 font-medium">{product.origin_country}</span>
          </p>
        )}

        {/* Stock + Lead time */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {product.stock_quantity != null && (
            <p className="text-xs text-gray-500">
              Stock : <span className={`font-medium ${product.stock_quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
                {product.stock_quantity > 0 ? `${product.stock_quantity} ${product.unit ?? 'pcs'}` : 'Épuisé'}
              </span>
            </p>
          )}
          {product.lead_time_days != null && (
            <p className="text-xs text-gray-500">
              Délai : <span className="font-medium text-gray-700">{product.lead_time_days}j</span>
            </p>
          )}
        </div>

        {/* International supplier note — payment through platform, no supplier exposure */}
        {!isMorocco && (
          <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
            Prix final défini par la plateforme. Paiement via AffiPartner uniquement.
          </p>
        )}

        {/* Price + Min quantity */}
        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">
              {isMorocco ? 'Prix de gros' : 'Prix final TTC'}
            </p>
            <p className="text-base font-bold text-gray-900">
              {product.suggested_wholesale_price_mad != null
                ? `${product.suggested_wholesale_price_mad} MAD`
                : 'Sur devis'}
            </p>
            {!isMorocco && product.suggested_wholesale_price_mad != null && (
              <p className="text-xs text-gray-400">Transport + douane inclus</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Min. commande</p>
            <p className="text-sm font-medium text-gray-700">{product.min_quantity} u.</p>
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-2 flex gap-2">
          <div className="flex-1">
            <MarketplaceQuoteForm
              supplierProductId={product.id}
              minQuantity={product.min_quantity}
            />
          </div>
          <Link
            href={`/wholesale/marketplace/${product.id}`}
            className="shrink-0 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors self-center"
          >
            Détails
          </Link>
        </div>
      </div>
    </div>
  )
}
