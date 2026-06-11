import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import BulkProductList from './BulkActionsBar'
import { SUPPLIER_PRODUCT_STATUS_BADGES } from '@/lib/supplier-product-moderation'
import type { SupplierProduct, SupplierType, Profile, SupplierProductStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierProducts')
  return { title: t('metaTitle') }
}

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
  const t = await getTranslations('admin.supplierProducts')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

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

  const pendingCount  = products.filter((p) => p.approval_status === 'pending_review').length
  const approvedCount = products.filter((p) => p.approval_status === 'approved').length
  const blockedCount  = products.filter((p) => p.approval_status === 'blocked').length

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

  const filterLabels: Record<string, string> = {
    '':              t('filterAll'),
    pending_review:  t('filterPending'),
    approved:        t('filterApproved'),
    blocked:         t('filterBlocked'),
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
            <p className="text-sm text-muted mt-0.5">
              {t('summary', {
                total:    products.length,
                pending:  pendingCount,
                approved: approvedCount,
                blocked:  blockedCount,
              })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-warning bg-warning-soft p-4">
            <p className="text-xs text-muted">{t('filterPending')}</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-warning-fg">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-success bg-success-soft p-4">
            <p className="text-xs text-muted">{t('filterApproved')}</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-success-fg">{approvedCount}</p>
          </div>
          <div className="rounded-xl border border-danger bg-danger-soft p-4">
            <p className="text-xs text-muted">{t('filterBlocked')}</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-danger-fg">{blockedCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTER_STATUSES.map((s) => (
            <Link
              key={s || 'all'}
              href={s ? `/admin/supplier-products?status=${s}` : '/admin/supplier-products'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (filters.status ?? '') === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-muted border-line hover:border-foreground'
              }`}
            >
              {filterLabels[s]}
            </Link>
          ))}
        </div>

        <BulkProductList
          products={listProducts}
          detailBase="/admin/supplier-products"
          locale={locale}
        />
      </main>
    </div>
  )
}
