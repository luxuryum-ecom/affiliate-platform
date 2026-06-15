'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface OrderFiltersProps {
  affiliates: { id: string; full_name: string }[]
}

const SELECT =
  'text-xs px-2.5 py-1.5 border border-line rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-gold-400 text-foreground'

export function OrderFilters({ affiliates }: OrderFiltersProps) {
  const t = useTranslations('admin')
  const router = useRouter()
  const searchParams = useSearchParams()

  const current = (key: string) => searchParams.get(key) ?? ''
  const [searchInput, setSearchInput] = useState(current('search'))

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/admin/orders?${params.toString()}`)
  }

  const submitSearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (searchInput.trim()) params.set('search', searchInput.trim())
    else params.delete('search')
    router.push(`/admin/orders?${params.toString()}`)
  }

  const hasFilters = !!current('search') || !!current('affiliate_id')

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* Search */}
      <div className="flex gap-1 flex-1 min-w-0 sm:max-w-xs">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          placeholder={t('orders.searchPlaceholder')}
          className="flex-1 min-w-0 text-xs px-3 py-1.5 border border-line rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
        <button
          type="button"
          onClick={submitSearch}
          className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity shrink-0"
        >
          {t('common.ok')}
        </button>
      </div>

      {/* Affiliate filter */}
      {affiliates.length > 0 && (
        <select
          value={current('affiliate_id')}
          onChange={(e) => set('affiliate_id', e.target.value)}
          className={SELECT}
        >
          <option value="">{t('orders.allAffiliates')}</option>
          {affiliates.map((a) => (
            <option key={a.id} value={a.id}>{a.full_name}</option>
          ))}
        </select>
      )}

      {/* Clear */}
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearchInput('')
            router.push('/admin/orders')
          }}
          className="text-xs px-2.5 py-1.5 border border-danger text-danger-fg rounded-lg hover:bg-danger-soft transition-colors"
        >
          {t('common.clear')}
        </button>
      )}
    </div>
  )
}
