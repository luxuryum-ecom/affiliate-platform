import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { signOut } from '@/app/actions/auth'
import { ProductActions } from '@/components/admin/product-actions'
import { ProductFilters } from '@/components/admin/product-filters'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { formatMAD } from '@/lib/utils'
import type { Product } from '@/types/database'

export const metadata = {
  title: 'Produits — Administration',
}

// ── Label maps ────────────────────────────────────────────────────────────────

const APPROVAL_BADGE: Record<string, { label: string; cls: string }> = {
  draft:          { label: 'Brouillon',   cls: 'bg-gray-100 text-gray-500' },
  pending_review: { label: 'En révision', cls: 'bg-amber-100 text-amber-700' },
  approved:       { label: 'Approuvé',    cls: 'bg-green-100 text-green-700' },
  rejected:       { label: 'Rejeté',      cls: 'bg-red-100 text-red-600' },
}

const AVAILABILITY_BADGE: Record<string, { label: string; cls: string }> = {
  local_stock:       { label: 'Stock Maroc',     cls: 'bg-green-100 text-green-700' },
  import_on_demand:  { label: 'Import demande',  cls: 'bg-purple-100 text-purple-700' },
}

// ─────────────────────────────────────────────────────────────────────────────

interface SearchParams {
  availability_type?: string
  approval_status?: string
  active?: string
  country?: string
  search?: string
  low_stock?: string
}

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: { full_name: string; role: string } | null; error: unknown }

  // ── Build query with filters ───────────────────────────────────────────────
  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.availability_type) query = query.eq('availability_type', filters.availability_type)
  if (filters.approval_status) query = query.eq('approval_status', filters.approval_status)
  if (filters.active === 'true')  query = query.eq('active', true)
  else if (filters.active === 'false') query = query.eq('active', false)
  if (filters.country)        query = query.eq('origin_country', filters.country)
  if (filters.low_stock === 'true') query = query.lt('stock_count', 5)

  // Full-text search via ilike (backed by pg_trgm index from migration 005)
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    query = query.or(`name.ilike.${term},supplier_name.ilike.${term},origin_country.ilike.${term}`)
  }

  const { data: products } = (await query) as { data: Product[] | null; error: unknown }
  const list = products ?? []

  // ── Stats for header ───────────────────────────────────────────────────────
  const { data: allProducts } = (await supabase
    .from('products')
    .select('active, approval_status, origin_country')) as {
    data: Pick<Product, 'active' | 'approval_status' | 'origin_country'>[] | null
    error: unknown
  }

  const all = allProducts ?? []
  const totalCount = all.length
  const activeCount = all.filter((p) => p.active).length
  const pendingReview = all.filter((p) => p.approval_status === 'pending_review').length

  // Distinct countries for the filter dropdown
  const countries = [
    ...new Set(
      all.map((p) => p.origin_country).filter((c): c is string => !!c)
    ),
  ].sort()

  const isFiltered =
    !!filters.availability_type ||
    !!filters.approval_status ||
    !!filters.active ||
    !!filters.country ||
    !!filters.search ||
    filters.low_stock === 'true'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin/dashboard"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">Produits</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Produits</h1>
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
              <span>{totalCount} total</span>
              <span className="text-gray-300">·</span>
              <span className="text-green-600">{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>
              {pendingReview > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <Link
                    href="/admin/products?approval_status=pending_review"
                    className="text-amber-600 hover:underline"
                  >
                    {pendingReview} en révision
                  </Link>
                </>
              )}
              {isFiltered && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-blue-600">{list.length} résultat{list.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </p>
          </div>
          <Link
            href="/admin/products/new"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            + Nouveau produit
          </Link>
        </div>

        {/* Filter bar — client component wrapped in Suspense */}
        <div className="mb-4">
          <Suspense fallback={null}>
            <ProductFilters countries={countries} />
          </Suspense>
        </div>

        {/* List */}
        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">
              {isFiltered
                ? 'Aucun produit ne correspond à ces filtres.'
                : 'Aucun produit pour le moment.'}
            </p>
            {isFiltered ? (
              <Link
                href="/admin/products"
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                Effacer les filtres
              </Link>
            ) : (
              <Link
                href="/admin/products/new"
                className="mt-4 inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                Créer le premier produit
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {list.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Product row ──────────────────────────────────────────────────────────────

function ProductRow({ product }: { product: Product }) {
  const coverUrl = getProductCoverUrl(product)
  const approvalBadge = APPROVAL_BADGE[product.approval_status] ?? APPROVAL_BADGE.draft
  const sourceBadge = AVAILABILITY_BADGE[product.availability_type] ?? AVAILABILITY_BADGE.local_stock

  return (
    <div className="flex items-start gap-3 p-4">
      {/* Thumbnail */}
      <div className="relative shrink-0">
        <ProductThumbnail
          src={coverUrl}
          name={product.name}
          className="w-12 h-12 rounded-lg border border-gray-200 text-xs"
        />
        {!coverUrl && (
          <span className="absolute -bottom-1.5 -right-1.5 text-xs bg-amber-100 text-amber-700 rounded px-1 leading-tight font-medium">
            !
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="font-medium text-gray-900 text-sm truncate max-w-[180px]">
            {product.name}
          </span>

          {/* Source badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${sourceBadge.cls}`}>
            {sourceBadge.label}
          </span>

          {/* Approval badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${approvalBadge.cls}`}>
            {approvalBadge.label}
          </span>

          {/* No image badge */}
          {!coverUrl && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              Sans image
            </span>
          )}

          {/* Affiliate enabled badge */}
          {!product.affiliate_enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
              Gros seulement
            </span>
          )}

          {/* Active / inactive */}
          {product.approval_status === 'approved' && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                product.active ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
              }`}
            >
              {product.active ? 'Visible' : 'Masqué'}
            </span>
          )}
        </div>

        {/* Pricing line */}
        <p className="text-xs text-gray-500 leading-relaxed flex flex-wrap gap-x-2">
          <span>
            Prix&nbsp;:{' '}
            <strong className="text-gray-700">{formatMAD(product.sell_price)}</strong>
          </span>
          <span className="text-gray-300">·</span>
          <span>
            Commission&nbsp;:{' '}
            <strong className="text-green-700">{formatMAD(product.commission_amount)}</strong>
          </span>
          <span className="text-gray-300">·</span>
          <span>Stock&nbsp;: {product.stock_count}</span>
          {product.wholesale_tiers.length > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span>
                {product.wholesale_tiers.length} palier
                {product.wholesale_tiers.length !== 1 ? 's' : ''} gros
              </span>
            </>
          )}
        </p>

        {/* Cost breakdown mini-line */}
        {(product.factory_cost_mad != null || product.purchase_price_mad != null || product.supplier_name || product.origin_country) && (
          <p className="text-xs text-gray-400 leading-relaxed flex flex-wrap gap-x-2 mt-0.5">
            {(product.factory_cost_mad != null || product.purchase_price_mad != null) && (
              <>
                <span>
                  Coût&nbsp;: {formatMAD(product.factory_cost_mad ?? product.purchase_price_mad ?? 0)}
                </span>
                {product.platform_margin_value != null && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span>
                      Marge&nbsp;:{' '}
                      {product.platform_margin_type === 'percentage'
                        ? `${product.platform_margin_value}%`
                        : `${formatMAD(product.platform_margin_value)}`}
                    </span>
                  </>
                )}
                <span className="text-gray-200">·</span>
                <span>
                  Frais&nbsp;: {formatMAD(
                    (product.confirmation_fee_mad ?? 0) +
                    (product.packaging_fee_mad ?? 0) +
                    (product.delivery_fee_mad ?? 0)
                  )}
                </span>
              </>
            )}
            {product.supplier_name && (
              <>
                <span className="text-gray-200">·</span>
                <span>{product.supplier_name}</span>
              </>
            )}
            {product.origin_country && (
              <>
                <span className="text-gray-200">·</span>
                <span>{product.origin_country}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      <ProductActions id={product.id} active={product.active} />
    </div>
  )
}
