import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { SupplierProduct, SupplierProductStatus, Profile } from '@/types/database'

export const metadata = { title: 'Produits fournisseurs — Administration' }

const STATUS_BADGE: Record<SupplierProductStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé',    cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeté',      cls: 'bg-red-100 text-red-600' },
}

type SupplierProductRow = SupplierProduct & {
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminSupplierProductsPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  let query = supabase
    .from('supplier_products')
    .select('*, supplier:profiles!supplier_id(id, full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.status) {
    query = query.eq('approval_status', filters.status)
  }

  const { data } = await query
  const products = (data ?? []) as unknown as SupplierProductRow[]

  const all = products
  const pendingCount = all.filter((p) => p.approval_status === 'pending').length
  const approvedCount = all.filter((p) => p.approval_status === 'approved').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Produits fournisseurs</span>
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Produits fournisseurs</h1>
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
              <span>{all.length} total</span>
              {pendingCount > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <Link
                    href="/admin/supplier-products?status=pending"
                    className="text-amber-600 hover:underline"
                  >
                    {pendingCount} en attente
                  </Link>
                </>
              )}
              <span className="text-gray-300">·</span>
              <span className="text-green-600">{approvedCount} approuvé{approvedCount !== 1 ? 's' : ''}</span>
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(['', 'pending', 'approved', 'rejected'] as const).map((s) => (
            <Link
              key={s}
              href={s ? `/admin/supplier-products?status=${s}` : '/admin/supplier-products'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (filters.status ?? '') === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s === '' ? 'Tous' : s === 'pending' ? 'En attente' : s === 'approved' ? 'Approuvés' : 'Rejetés'}
            </Link>
          ))}
        </div>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune soumission fournisseur.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {products.map((product) => {
              const badge = STATUS_BADGE[product.approval_status]
              return (
                <div key={product.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                        {product.product_name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        product.availability_type === 'import_on_demand'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {product.availability_type === 'import_on_demand' ? 'Import / Demande' : 'Stock local'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                      <span className="font-medium text-gray-700">
                        Fournisseur : {product.supplier?.full_name ?? '—'}
                      </span>
                      {product.supplier?.phone && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{product.supplier.phone}</span>
                        </>
                      )}
                      {product.origin_country && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>Origine : {product.origin_country}</span>
                        </>
                      )}
                      {product.category && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{product.category}</span>
                        </>
                      )}
                      {product.suggested_wholesale_price_mad != null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>Prix suggéré : {product.suggested_wholesale_price_mad} MAD</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Soumis le {new Date(product.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <Link
                    href={`/admin/supplier-products/${product.id}`}
                    className="shrink-0 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                  >
                    Examiner →
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
