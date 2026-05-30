import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import BulkProductList from './BulkActionsBar'
import type { SupplierProduct, SupplierType, Profile } from '@/types/database'

export const metadata = { title: 'Produits fournisseurs — Administration' }

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
    .select('full_name, role')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name' | 'role'> | null; error: unknown }

  if (profile?.role !== 'admin') redirect('/login')

  let query = supabase
    .from('supplier_products')
    .select('*, supplier:profiles!supplier_id(id, full_name, phone)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (filters.status) {
    query = query.eq('approval_status', filters.status)
  }

  const { data } = await query
  const products = (data ?? []) as unknown as SupplierProductRow[]

  const pendingCount  = products.filter((p) => p.approval_status === 'pending').length
  const approvedCount = products.filter((p) => p.approval_status === 'approved').length
  const rejectedCount = products.filter((p) => p.approval_status === 'rejected').length

  const listProducts = products.map((p) => ({
    id:               p.id,
    product_name:     p.product_name,
    approval_status:  p.approval_status,
    supplier_type:    (p.supplier_type ?? 'morocco') as SupplierType,
    category:         p.category,
    origin_country:   p.origin_country,
    supplierName:     p.supplier?.full_name ?? null,
    createdAt:        p.created_at,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Produits fournisseurs</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Produits fournisseurs</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {products.length} total · {pendingCount} en attente · {approvedCount} approuvés · {rejectedCount} rejetés
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'En attente',  value: pendingCount,  cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Approuvés',   value: approvedCount, cls: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Rejetés',     value: rejectedCount, cls: 'bg-red-50 border-red-200 text-red-600' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
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

        <BulkProductList
          products={listProducts}
          detailBase="/admin/supplier-products"
        />
      </main>
    </div>
  )
}
