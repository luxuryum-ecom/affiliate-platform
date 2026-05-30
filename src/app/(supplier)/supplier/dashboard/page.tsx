import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile, SupplierProduct } from '@/types/database'

export const metadata = { title: 'Dashboard — Espace Fournisseur' }

export default async function SupplierDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, productsResult] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('supplier_products')
      .select('id, product_name, approval_status, created_at')
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  const products = (productsResult.data ?? []) as Pick<SupplierProduct, 'id' | 'product_name' | 'approval_status' | 'created_at'>[]

  const pending = products.filter((p) => p.approval_status === 'pending').length
  const approved = products.filter((p) => p.approval_status === 'approved').length
  const rejected = products.filter((p) => p.approval_status === 'rejected').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">AffiPartner — Fournisseur</span>
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
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-gray-900">Bonjour, {profile?.full_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez vos soumissions de produits.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
            <p className="text-xs text-gray-500 mt-1">En attente</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-green-600">{approved}</p>
            <p className="text-xs text-gray-500 mt-1">Approuvé{approved !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-red-500">{rejected}</p>
            <p className="text-xs text-gray-500 mt-1">Rejeté{rejected !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/supplier/products/new"
            className="flex items-center gap-3 bg-gray-900 text-white rounded-xl p-5 hover:bg-gray-700 transition-colors"
          >
            <span className="text-2xl">+</span>
            <div>
              <p className="font-medium text-sm">Soumettre un produit</p>
              <p className="text-xs text-gray-300 mt-0.5">Proposer un nouveau produit à la plateforme</p>
            </div>
          </Link>
          <Link
            href="/supplier/products"
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <span className="text-2xl">📦</span>
            <div>
              <p className="font-medium text-sm text-gray-900">Mes produits</p>
              <p className="text-xs text-gray-500 mt-0.5">Voir l&apos;état de vos soumissions</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  )
}
