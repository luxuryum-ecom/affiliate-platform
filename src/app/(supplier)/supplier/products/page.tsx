import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile, SupplierProduct, SupplierProductStatus, SupplierType } from '@/types/database'

export const metadata = { title: 'Mes produits — Espace Fournisseur' }

const STATUS_BADGE: Record<SupplierProductStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé',    cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeté',      cls: 'bg-red-100 text-red-600' },
}

const SUPPLIER_TYPE_BADGE: Record<SupplierType, { label: string; cls: string }> = {
  morocco:       { label: '🇲🇦 Maroc',        cls: 'bg-emerald-100 text-emerald-700' },
  international: { label: '🌍 International', cls: 'bg-blue-100 text-blue-700' },
}

export default async function SupplierProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, productsResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      .select('*')
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  const products = (productsResult.data ?? []) as SupplierProduct[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mes produits</span>
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Mes soumissions</h1>
            <p className="text-sm text-gray-500 mt-0.5">{products.length} produit{products.length !== 1 ? 's' : ''} soumis</p>
          </div>
          <Link
            href="/supplier/products/new"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Soumettre un produit
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Vous n&apos;avez pas encore soumis de produit.</p>
            <Link
              href="/supplier/products/new"
              className="mt-4 inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Soumettre votre premier produit
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {products.map((product) => {
              const badge = STATUS_BADGE[product.approval_status]
              return (
                <div key={product.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 text-sm truncate max-w-[220px]">
                        {product.product_name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUPPLIER_TYPE_BADGE[product.supplier_type ?? 'morocco'].cls}`}>
                        {SUPPLIER_TYPE_BADGE[product.supplier_type ?? 'morocco'].label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                      {product.category && <span>Catégorie : {product.category}</span>}
                      {product.category && product.origin_country && <span className="text-gray-300">·</span>}
                      {product.origin_country && <span>Origine : {product.origin_country}</span>}
                      {product.min_quantity > 1 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>Min. : {product.min_quantity} u.</span>
                        </>
                      )}
                      {product.suggested_wholesale_price_mad != null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>Prix suggéré : {product.suggested_wholesale_price_mad} MAD</span>
                        </>
                      )}
                    </p>
                    {product.approval_status === 'rejected' && product.admin_notes && (
                      <p className="mt-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                        Note admin : {product.admin_notes}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Soumis le {new Date(product.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
