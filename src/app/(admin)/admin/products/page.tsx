import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { signOut } from '@/app/actions/auth'
import { ProductActions } from '@/components/admin/product-actions'
import { formatMAD } from '@/lib/utils'
import type { Product } from '@/types/database'

export const metadata = {
  title: 'Produits — Administration',
}

export default async function AdminProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: { full_name: string; role: string } | null; error: unknown }

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200) as { data: Product[] | null; error: unknown }

  const list = products ?? []
  const activeCount = list.filter((p) => p.active).length
  const draftCount = list.length - activeCount

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Produits</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {list.length} produit{list.length !== 1 ? 's' : ''} ·{' '}
              <span className="text-green-600">{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>
              {draftCount > 0 && (
                <>
                  {' · '}
                  <span className="text-gray-400">{draftCount} brouillon{draftCount !== 1 ? 's' : ''}</span>
                </>
              )}
            </p>
          </div>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            + Nouveau produit
          </Link>
        </div>

        {/* Empty state */}
        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun produit pour le moment.</p>
            <Link
              href="/admin/products/new"
              className="mt-4 inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Créer le premier produit
            </Link>
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

// ─── Product row (server sub-component + client ProductActions) ───────────────

function ProductRow({ product }: { product: Product }) {
  const thumb = product.images[0]

  return (
    <div className="flex items-start gap-3 p-4">
      {/* Thumbnail */}
      <div className="shrink-0 w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="font-medium text-gray-900 text-sm truncate">{product.name}</span>

          {/* Type badge */}
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
            {product.type === 'local' ? 'Local' : 'Importé'}
          </span>

          {/* Status badge */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              product.active
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {product.active ? 'Actif' : 'Brouillon'}
          </span>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Prix&nbsp;: <strong className="text-gray-700">{formatMAD(product.sell_price)}</strong>
          {' · '}
          Commission&nbsp;: {formatMAD(product.commission_amount)}
          {' · '}
          Stock&nbsp;: {product.stock_count}
          {product.wholesale_tiers.length > 0 && (
            <>
              {' · '}
              {product.wholesale_tiers.length} palier{product.wholesale_tiers.length !== 1 ? 's' : ''} gros
            </>
          )}
        </p>
      </div>

      {/* Actions */}
      <ProductActions id={product.id} active={product.active} />
    </div>
  )
}
