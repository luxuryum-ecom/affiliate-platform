'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

const ALL_REASONS = [
  'vente_affilie',
  'vente_gros',
  'vente_ecom',
  'cadeau',
  'casse',
  'echantillon',
  'perte',
  'retour',
  'reappro',
] as const

const SELECT =
  'text-xs px-2.5 py-1.5 border border-line rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-gold-400 text-foreground'

interface StockFiltersProps {
  products: { id: string; name: string }[]
}

export function StockFilters({ products }: StockFiltersProps) {
  const t = useTranslations('admin.stock')
  const router = useRouter()
  const searchParams = useSearchParams()

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/admin/stock?${params.toString()}`)
  }

  const current = (key: string) => searchParams.get(key) ?? ''
  const hasFilters = !!current('productId') || !!current('reason')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={current('productId')}
        onChange={(e) => set('productId', e.target.value)}
        className={SELECT}
        aria-label={t('filterProduct')}
      >
        <option value="">{t('allProducts')}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={current('reason')}
        onChange={(e) => set('reason', e.target.value)}
        className={SELECT}
        aria-label={t('filterReason')}
      >
        <option value="">{t('allReasons')}</option>
        {ALL_REASONS.map((r) => (
          <option key={r} value={r}>
            {t(`reason.${r}`)}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push('/admin/stock')}
          className="text-xs px-2.5 py-1.5 border border-danger-soft text-danger-fg rounded-lg hover:bg-danger-soft transition-colors"
        >
          {t('clearFilters')}
        </button>
      )}
    </div>
  )
}
