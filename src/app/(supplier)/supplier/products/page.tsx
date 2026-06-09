import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type { Profile, SupplierProductSupplierView, SupplierType } from '@/types/database'
import {
  SUPPLIER_PRODUCT_SELECT,
  SUPPLIER_PRODUCT_STATUS_BADGES,
} from '@/lib/supplier-product-moderation'

export async function generateMetadata() {
  const t = await getTranslations('supplier.products')
  return { title: t('metaTitle') }
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
      .select(SUPPLIER_PRODUCT_SELECT)
      .eq('supplier_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileResult.data as Pick<Profile, 'full_name'> | null
  const products = (productsResult.data ?? []) as SupplierProductSupplierView[]

  const t = await getTranslations('supplier.products')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/supplier/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← {tc('dashboard')}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Catalog stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: t('statTotal'),    value: products.length,                                                               cls: 'bg-white border-gray-200 text-gray-900' },
            { label: t('statPending'),  value: products.filter((p) => p.approval_status === 'pending_review').length,         cls: 'bg-amber-50 border-amber-200 text-amber-700' },
            { label: t('statApproved'), value: products.filter((p) => p.approval_status === 'approved').length,               cls: 'bg-green-50 border-green-200 text-green-700' },
            { label: t('statBlocked'),  value: products.filter((p) => p.approval_status === 'blocked').length,                cls: 'bg-red-50 border-red-200 text-red-600' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 ${s.cls.split(' ').slice(0, 2).join(' ')}`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${s.cls.split(' ').slice(2).join(' ')}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-semibold text-gray-900">{t('submissionsTitle')}</h1>
          <div className="flex gap-2">
            <Link
              href="/supplier/products/import"
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('ctaImport')}
            </Link>
            <Link
              href="/supplier/products/new"
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              {t('ctaNew')}
            </Link>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">{t('emptyState')}</p>
            <Link
              href="/supplier/products/new"
              className="mt-4 inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              {t('emptyCtaNew')}
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {products.map((product) => {
              const badge = SUPPLIER_PRODUCT_STATUS_BADGES[product.approval_status]
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
                      {product.category && <span>{t('labelCategory', { value: product.category })}</span>}
                      {product.category && product.origin_country && <span className="text-gray-300">·</span>}
                      {product.origin_country && <span>{t('labelOrigin', { value: product.origin_country })}</span>}
                      {product.min_quantity > 1 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{t('labelMinQty', { count: product.min_quantity })}</span>
                        </>
                      )}
                      {product.suggested_wholesale_price_mad != null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{t('labelSuggestedPrice', { price: product.suggested_wholesale_price_mad })}</span>
                        </>
                      )}
                    </p>
                    {product.approval_status === 'blocked' && (
                      <p className="mt-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                        {t('blockedNotice')}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('submittedOn', { date: new Date(product.created_at).toLocaleDateString(locale) })}
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
