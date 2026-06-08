import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMAD } from '@/lib/utils'
import { getProductCoverUrl, getProductGalleryUrls } from '@/lib/product-media'
import { getDeliveryEstimate } from '@/lib/order-analytics'
import { CodOrderForm } from '@/components/customer/cod-order-form'
import { ProductGallery } from '@/components/customer/product-gallery'
import { MozounaLogo } from '@/components/shared/branding'
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
    title: `${data.name} — Mozouna Group`,
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
    .eq('affiliate_enabled', true)
    .single()) as { data: Product | null; error: unknown }

  if (!product || product.availability_type === 'import_on_demand') notFound()

  const affiliateId = ref ?? null

  // Look up affiliate's custom sell price if a referral is present.
  // Uses service_role to bypass "aff_prices: anon read" policy (removed in migration 047).
  // Falls back to product.sell_price when no custom price is set.
  let customSellPrice: number | null = null
  if (affiliateId) {
    const adminClient = createAdminClient()
    const { data: priceRow } = (await adminClient
      .from('affiliate_product_prices')
      .select('custom_sell_price_mad')
      .eq('affiliate_id', affiliateId)
      .eq('product_id', product.id)
      .maybeSingle()) as {
      data: { custom_sell_price_mad: number } | null
      error: unknown
    }
    customSellPrice = priceRow ? Number(priceRow.custom_sell_price_mad) : null
  }

  const displayPrice = customSellPrice ?? product.sell_price

  const coverUrl = getProductCoverUrl(product)
  const galleryUrls = getProductGalleryUrls(product)
  const delivery = getDeliveryEstimate(product.availability_type)

  const inStock = product.stock_count > 0
  const lowStock = product.stock_count > 0 && product.stock_count <= 5

  return (
    <div className="theme-dark bg-bg text-foreground min-h-screen">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-lg md:max-w-5xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" aria-label="Mozouna Group — accueil">
            <MozounaLogo size="sm" />
          </Link>
          <span className="text-xs font-medium text-gold-400">COD · Maroc 🇲🇦</span>
        </div>
      </header>

      <main className="max-w-lg md:max-w-5xl mx-auto px-4 py-6 pb-24">
        <div className="md:grid md:grid-cols-2 md:gap-10 md:items-start">
          {/* Gallery */}
          <div className="mb-6 md:mb-0">
            <ProductGallery
              coverUrl={coverUrl}
              galleryUrls={galleryUrls}
              productName={product.name}
            />
          </div>

          {/* Product info + form */}
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Stock Maroc
                </span>
                {inStock ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      lowStock ? 'bg-amber-100 text-amber-700' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {lowStock
                      ? `Plus que ${product.stock_count} en stock`
                      : `${product.stock_count} en stock`}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Rupture de stock
                  </span>
                )}
              </div>

              <div className="h-0.5 w-10 bg-gold-400 rounded-full mb-2" aria-hidden />
              <h1 className="text-2xl font-bold text-foreground leading-tight">{product.name}</h1>

              {product.description && (
                <p className="text-sm text-muted mt-3 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {formatMAD(displayPrice)}
              </span>
              <span className="text-sm font-medium text-gold-400">/ unité</span>
            </div>

            <div className="flex items-start gap-3 bg-surface border border-line rounded-xl p-4 shadow-premium">
              <span className="text-lg" aria-hidden>
                🚚
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Livraison estimée</p>
                <p className="text-xs text-muted mt-0.5">{delivery.label}</p>
                <p className="text-xs text-faint mt-1">Partout au Maroc · paiement à la réception</p>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-premium">
              <h2 className="text-sm font-semibold text-foreground mb-4">Commander en COD</h2>
              <CodOrderForm
                productId={product.id}
                affiliateIdFromUrl={affiliateId}
                productName={product.name}
                sellPrice={displayPrice}
                maxQty={Math.max(product.stock_count, 0)}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-line bg-surface mt-8">
        <div className="max-w-lg md:max-w-5xl mx-auto px-4 py-6 text-center text-xs text-muted">
          Livraison partout au Maroc · Paiement sécurisé à la livraison
        </div>
      </footer>
    </div>
  )
}
