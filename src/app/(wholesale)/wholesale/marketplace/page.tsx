import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MarketplaceQuoteForm } from '@/components/wholesale/marketplace-quote-form'
import type { Profile, SupplierProductPublic } from '@/types/database'

export const metadata = { title: 'Marketplace fournisseurs — Espace Grossiste' }

interface SearchParams {
  category?: string
  niche?: string
  origin?: string
  availability?: string
  min_qty?: string
  max_price?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function WholesaleMarketplacePage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, productsResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      // Select only public-safe columns — never expose supplier_id, supplier_private_notes, admin_notes, platform_margin_*
      .select(
        'id, product_name, category, niche, description, photos, min_quantity, origin_country, availability_type, target_buyer_type, suggested_wholesale_price_mad, public_name, public_description, approval_status, created_at'
      )
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false }),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  let products = (productsResult.data ?? []) as SupplierProductPublic[]

  // Apply client-side filters (data is already fetched, small dataset)
  if (filters.category) {
    products = products.filter((p) =>
      p.category.toLowerCase().includes(filters.category!.toLowerCase())
    )
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

  // Distinct values for filter dropdowns
  const allProducts = (productsResult.data ?? []) as SupplierProductPublic[]
  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort()
  const niches = [...new Set(allProducts.map((p) => p.niche).filter(Boolean))].sort()
  const origins = [...new Set(allProducts.map((p) => p.origin_country).filter(Boolean))].sort()

  const isFiltered = !!(
    filters.category || filters.niche || filters.origin ||
    filters.availability || filters.min_qty || filters.max_price
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
            Produits disponibles auprès de nos fournisseurs. Demandez un devis directement.
          </p>
        </div>

        {/* Filters */}
        <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Category */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
              <select
                name="category"
                defaultValue={filters.category ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Niche */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Niche</label>
              <select
                name="niche"
                defaultValue={filters.niche ?? ''}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">Toutes</option>
                {niches.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Origin country */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Origine</label>
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

            {/* Min quantity filter */}
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
          </div>

          <div className="flex gap-2 mt-3">
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
          {isFiltered ? ` correspondant${products.length !== 1 ? 's' : ''}` : ' disponible' + (products.length !== 1 ? 's' : '')}
        </p>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">
              {isFiltered
                ? 'Aucun produit ne correspond à ces filtres.'
                : 'Aucun produit disponible pour le moment.'}
            </p>
            {isFiltered && (
              <Link
                href="/wholesale/marketplace"
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                Effacer les filtres
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <MarketplaceProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Marketplace product card ─────────────────────────────────────────────────
// Only public-safe fields are used — supplier identity is never rendered.

function MarketplaceProductCard({ product }: { product: SupplierProductPublic }) {
  const displayName = product.public_name || product.product_name
  const displayDescription = product.public_description || product.description

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Photo */}
      {product.photos.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.photos[0]}
          alt={displayName}
          className="w-full aspect-[4/3] object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center text-3xl text-gray-300">
          📦
        </div>
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
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
        </div>

        <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{displayName}</h3>

        {displayDescription && (
          <p className="text-xs text-gray-500 line-clamp-2">{displayDescription}</p>
        )}

        {/* Details */}
        <div className="text-xs text-gray-500 space-y-0.5">
          {product.origin_country && (
            <p>Origine : <span className="text-gray-700 font-medium">{product.origin_country}</span></p>
          )}
          {product.niche && (
            <p>Niche : <span className="text-gray-700 font-medium">{product.niche}</span></p>
          )}
        </div>

        {/* Price + Min quantity */}
        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Prix indicatif</p>
            <p className="text-base font-bold text-gray-900">
              {product.suggested_wholesale_price_mad != null
                ? `${product.suggested_wholesale_price_mad} MAD`
                : 'Sur devis'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Min. commande</p>
            <p className="text-sm font-medium text-gray-700">{product.min_quantity} u.</p>
          </div>
        </div>

        {/* Quote request form */}
        <div className="mt-2">
          <MarketplaceQuoteForm
            supplierProductId={product.id}
            minQuantity={product.min_quantity}
          />
        </div>
      </div>
    </div>
  )
}
