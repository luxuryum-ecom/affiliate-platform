import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { CopyLinkButton } from '@/components/affiliate/copy-link-button'
import { formatMAD } from '@/lib/utils'
import type { Product } from '@/types/database'

export const metadata = {
  title: 'Catalogue produits — Espace Affilié',
}

export default async function AffiliateProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .eq('approval_status', 'approved')
    .eq('affiliate_enabled', true)       // only products enabled for affiliate promotion
    .order('created_at', { ascending: false }) as { data: Product[] | null; error: unknown }

  const list = products ?? []
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://yourapp.com'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
            >
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Catalogue</span>
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Catalogue produits</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {list.length} produit{list.length !== 1 ? 's' : ''} disponible
            {list.length !== 1 ? 's' : ''}.
            Copiez votre lien affilié pour chaque produit.
          </p>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun produit disponible pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((product) => {
              const referralUrl = `${APP_URL}/products/${product.id}?ref=${user!.id}`
              return (
                <AffiliateProductCard
                  key={product.id}
                  product={product}
                  referralUrl={referralUrl}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────

function AffiliateProductCard({
  product,
  referralUrl,
}: {
  product: Product
  referralUrl: string
}) {
  const thumb = product.media?.[0]?.url ?? product.images?.[0] ?? null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-300">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      product.source_type === 'local_production'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {product.source_type === 'local_production' ? 'Local' : 'Importé'}
                  </span>
          </div>
          <h3 className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{product.description}</p>
          )}
        </div>

        {/* Pricing */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Prix de vente</p>
            <p className="text-sm font-medium text-gray-700">{formatMAD(product.sell_price)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Votre commission</p>
            <p className="text-base font-bold text-green-600">
              {formatMAD(product.commission_amount)}
            </p>
          </div>
        </div>

        {/* Stock indicator */}
        <p className="text-xs text-gray-400">
          Stock&nbsp;:{' '}
          <span className={product.stock_count > 0 ? 'text-green-600' : 'text-red-500'}>
            {product.stock_count > 0 ? `${product.stock_count} unités` : 'Épuisé'}
          </span>
        </p>

        {/* Copy link — pushed to bottom */}
        <div className="mt-auto">
          <CopyLinkButton url={referralUrl} />
        </div>
      </div>
    </div>
  )
}
