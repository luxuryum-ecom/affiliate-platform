'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

interface ProductFiltersProps {
  countries: string[]
}

const APPROVAL_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'pending_review', label: 'En révision' },
  { value: 'approved', label: 'Approuvé' },
  { value: 'rejected', label: 'Rejeté' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'Toutes les sources' },
  { value: 'local_production', label: 'Production locale' },
  { value: 'imported', label: 'Importé' },
]

const ACTIVE_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'true', label: 'Actif' },
  { value: 'false', label: 'Inactif' },
]

const SELECT =
  'text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 text-gray-700'

export function ProductFilters({ countries }: ProductFiltersProps) {
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
    !!current('source_type') ||
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
            placeholder="Rechercher par nom, fournisseur, pays…"
            className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 min-w-0"
          />
          <button
            type="button"
            onClick={submitSearch}
            className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors shrink-0"
          >
            OK
          </button>
        </div>

        {/* Low stock quick filter */}
        <button
          type="button"
          onClick={() => set('low_stock', isLowStock ? '' : 'true')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
            isLowStock
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white border-amber-200 text-amber-600 hover:bg-amber-50'
          }`}
        >
          ⚠ Stock bas
        </button>
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={current('source_type')} onChange={(e) => set('source_type', e.target.value)} className={SELECT}>
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select value={current('approval_status')} onChange={(e) => set('approval_status', e.target.value)} className={SELECT}>
          {APPROVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select value={current('active')} onChange={(e) => set('active', e.target.value)} className={SELECT}>
          {ACTIVE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {countries.length > 0 && (
          <select value={current('country')} onChange={(e) => set('country', e.target.value)} className={SELECT}>
            <option value="">Tous les pays</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs px-2.5 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
          >
            Effacer ×
          </button>
        )}
      </div>
    </div>
  )
}
