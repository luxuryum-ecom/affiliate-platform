'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface ProductFiltersProps {
  countries: string[]
}

const SELECT =
  'text-xs px-2.5 py-1.5 border border-line rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-gold-400 text-foreground'

export function ProductFilters({ countries }: ProductFiltersProps) {
  const t = useTranslations('admin.productFilters')
  const tc = useTranslations('admin.common')

  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`/admin/products?${params.toString()}`)
  }

  const submitSearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (searchInput.trim()) params.set('search', searchInput.trim())
    else params.delete('search')
    params.delete('page')
    router.push(`/admin/products?${params.toString()}`)
  }

  const current = (key: string) => searchParams.get(key) ?? ''
  const isLowStock = current('low_stock') === 'true'

  const hasFilters =
    !!current('search') ||
    !!current('availability_type') ||
    !!current('approval_status') ||
    !!current('active') ||
    !!current('country') ||
    isLowStock

  const clearAll = () => {
    setSearchInput('')
    router.push('/admin/products')
  }

  return (
    <div className="space-y-2">
      {/* Search row */}
      <div className="flex gap-2">
        <div className="flex flex-1 gap-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder={t('searchPlaceholder')}
            className="flex-1 text-xs px-3 py-1.5 border border-line rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 min-w-0"
          />
          <button
            type="button"
            onClick={submitSearch}
            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity shrink-0"
          >
            {tc('ok')}
          </button>
        </div>

        {/* Low stock quick filter */}
        <button
          type="button"
          onClick={() => set('low_stock', isLowStock ? '' : 'true')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
            isLowStock
              ? 'bg-warning-fg text-white border-warning-fg'
              : 'bg-surface border-warning text-warning-fg hover:bg-warning-soft'
          }`}
        >
          {t('lowStock')}
        </button>
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={current('availability_type')} onChange={(e) => set('availability_type', e.target.value)} className={SELECT}>
          <option value="">{t('allAvailabilities')}</option>
          <option value="local_stock">{t('availLocalStock')}</option>
          <option value="import_on_demand">{t('availImportOnDemand')}</option>
        </select>

        <select value={current('approval_status')} onChange={(e) => set('approval_status', e.target.value)} className={SELECT}>
          <option value="">{t('allStatuses')}</option>
          <option value="draft">{t('statusDraft')}</option>
          <option value="pending_review">{t('statusPendingReview')}</option>
          <option value="approved">{t('statusApproved')}</option>
          <option value="rejected">{t('statusRejected')}</option>
        </select>

        <select value={current('active')} onChange={(e) => set('active', e.target.value)} className={SELECT}>
          <option value="">{tc('all')}</option>
          <option value="true">{t('activeTrue')}</option>
          <option value="false">{t('activeFalse')}</option>
        </select>

        {countries.length > 0 && (
          <select value={current('country')} onChange={(e) => set('country', e.target.value)} className={SELECT}>
            <option value="">{t('allCountries')}</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs px-2.5 py-1.5 border border-danger-soft text-danger-fg rounded-lg hover:bg-danger-soft transition-colors"
          >
            {tc('clear')}
          </button>
        )}
      </div>
    </div>
  )
}
