import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import BulkProductList from './BulkActionsBar'
import { SUPPLIER_PRODUCT_STATUS_BADGES } from '@/lib/supplier-product-moderation'
import type { SupplierProduct, SupplierType, Profile, SupplierProductStatus } from '@/types/database'

export const metadata = { title: 'Modération produits fournisseurs — Administration' }

type SupplierProductRow = SupplierProduct & {
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
}

const FILTER_STATUSES = ['', 'pending_review', 'approved', 'blocked'] as const

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

  const statusFilter = filters.status as SupplierProductStatus | undefined
  if (statusFilter && FILTER_STATUSES.includes(statusFilter as (typeof FILTER_STATUSES)[number])) {
    query = query.eq('approval_status', statusFilter)
  }

  const { data } = await query
  const products = (data ?? []) as unknown as SupplierProductRow[]

  const pendingCount = products.filter((p) => p.approval_status === 'pending_review').length
  const approvedCount = products.filter((p) => p.approval_status === 'approved').length
  const blockedCount = products.filter((p) => p.approval_status === 'blocked').length

  const listProducts = products.map((p) => ({
    id: p.id,
    product_name: p.product_name,
    approval_status: p.approval_status,
    moderation_flag: p.moderation_flag,
    ai_risk_score: p.ai_risk_score,
    supplier_type: (p.supplier_type ?? 'morocco') as SupplierType,
    category: p.category,
    min_quantity: p.min_quantity,
    origin_country: p.origin_country,
    supplierName: p.supplier?.full_name ?? null,
    createdAt: p.created_at,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Modération produits</span>
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
            <h1 className="text-lg font-semibold text-gray-900">Modération produits fournisseurs</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {products.length} total · {pendingCount} en attente · {approvedCount} approuvés · {blockedCount} bloqués
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'En attente', value: pendingCount, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: 'Approuvés', value: approvedCount, cls: 'bg-green-50 border-green-200 text-green-700' },
            { label: 'Bloqués', value: blockedCount, cls: 'bg-red-50 border-red-200 text-red-600' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTER_STATUSES.map((s) => (
            <Link
              key={s || 'all'}
              href={s ? `/admin/supplier-products?status=${s}` : '/admin/supplier-products'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (filters.status ?? '') === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s === ''
                ? 'Tous'
                : SUPPLIER_PRODUCT_STATUS_BADGES[s as SupplierProductStatus]?.label ?? s}
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
