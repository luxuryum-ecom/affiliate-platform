import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { CodOrderForm } from '@/components/customer/cod-order-form'
import type { Product } from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = (await supabase
    .from('products')
    .select('name, description')
    .eq('id', id)
    .eq('active', true)
    .single()) as { data: { name: string; description: string | null } | null; error: unknown }
  if (!data) return { title: 'Produit non disponible' }
  return {
    title: data.name,
    description: data.description ?? undefined,
  }
}

export default async function PublicProductPage({ params, searchParams }: Params) {
  const { id } = await params
  const { ref } = await searchParams

  const supabase = await createClient()

  const { data: product } = (await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .eq('approval_status', 'approved')
    .single()) as { data: Product | null; error: unknown }

  if (!product) notFound()

  const affiliateId = ref ?? null
  const mediaImages = product.media?.filter((m) => m.type === 'image') ?? []
  const allImageUrls = mediaImages.length > 0
    ? mediaImages.map((m) => m.url)
    : (product.images ?? [])
  const thumb = allImageUrls[0] ?? null
  const extraImages = allImageUrls.slice(1)

  return (
    <div className="min-h-screen bg-white">
      {/* Minimal nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Boutique
          </Link>
          <span className="text-xs text-gray-400">Paiement à la livraison · Maroc</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* ── Images ── */}
          <div className="space-y-3">
            <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-gray-200">
                  {product.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            {extraImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {extraImages.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`${product.name} ${i + 2}`}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover border border-gray-100"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Info + COD form ── */}
          <div className="space-y-5">
            {/* Product info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  product.availability_type === 'import_on_demand'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {product.availability_type === 'import_on_demand' ? 'Import' : 'Stock Maroc'}
              </span>
                {product.origin_country && (
                  <span className="text-xs text-gray-400">{product.origin_country}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{product.name}</h1>
              {product.description && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-gray-900">
                {formatMAD(product.sell_price)}
              </span>
              <span className="text-sm text-gray-400">/ unité · paiement à la livraison</span>
            </div>

            {/* Stock */}
            {product.stock_count <= 5 && product.stock_count > 0 && (
              <p className="text-xs text-amber-600 font-medium">
                ⚠ Plus que {product.stock_count} unité{product.stock_count !== 1 ? 's' : ''} disponible{product.stock_count !== 1 ? 's' : ''}
              </p>
            )}
            {product.stock_count === 0 && (
              <p className="text-xs text-red-600 font-medium">● Produit temporairement indisponible</p>
            )}

            {/* COD form */}
            <CodOrderForm
              productId={product.id}
              affiliateId={affiliateId}
              sellPrice={product.sell_price}
              maxQty={product.stock_count}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
          Livraison partout au Maroc · Paiement sécurisé à la réception
        </div>
      </footer>
    </div>
  )
}
