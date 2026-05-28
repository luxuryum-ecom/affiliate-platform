import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { AddToCartForm } from '@/components/wholesale/add-to-cart-form'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl, getProductGalleryUrls } from '@/lib/product-media'
import type { Product } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('name')
    .eq('id', id)
    .single() as { data: { name: string } | null; error: unknown }
  return { title: data ? `${data.name} — Grossiste` : 'Produit' }
}

export default async function WholesaleProductDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [profileResult, productResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('products').select('*').eq('id', id).eq('active', true).eq('approval_status', 'approved').single(),
  ])

  const profile = profileResult.data as { full_name: string } | null
  const product = productResult.data as Product | null

  if (!product) notFound()

  const coverUrl = getProductCoverUrl(product)
  const galleryUrls = getProductGalleryUrls(product)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/wholesale/products"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Catalogue
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[160px]">
              {product.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/wholesale/cart"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Mon panier
            </Link>
            <span className="text-gray-400 hidden sm:inline">{profile?.full_name}</span>
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ── Images ── */}
          <div className="space-y-3">
            <ProductThumbnail
              src={coverUrl}
              name={product.name}
              className="aspect-square w-full rounded-2xl border border-gray-200 text-4xl"
            />

            {galleryUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryUrls.map((url, i) => (
                  <ProductThumbnail
                    key={url}
                    src={url}
                    name={`${product.name} ${i + 2}`}
                    className="h-16 w-16 shrink-0 rounded-lg border border-gray-200"
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Info + Add to cart ── */}
          <div className="space-y-5">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  product.availability_type === 'import_on_demand'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {product.availability_type === 'import_on_demand' ? 'Import / Demande' : 'Stock Maroc'}
              </span>
              {product.wholesale_tiers.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Paliers de prix
                </span>
              )}
              {product.stock_count === 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                  Stock épuisé
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{product.name}</h1>
              {product.description && (
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Public price reference */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">Prix public :</span>
              <span className="font-medium text-gray-700">{formatMAD(product.sell_price)}</span>
            </div>

            {/* Add to cart form (client component) */}
            <AddToCartForm
              productId={product.id}
              sellPrice={product.sell_price}
              tiers={product.wholesale_tiers}
              minQty={product.wholesale_min_qty}
              stockCount={product.stock_count}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
