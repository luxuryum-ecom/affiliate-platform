'use client'

import { useRouter, useSearchParams } from 'next/navigation'

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

export function ProductFilters({ countries }: ProductFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const set = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Always reset to page 1 when filters change
    params.delete('page')
    router.push(`/admin/products?${params.toString()}`)
  }

  const current = (key: string) => searchParams.get(key) ?? ''

  const hasFilters =
    !!current('source_type') ||
    !!current('approval_status') ||
    !!current('active') ||
    !!current('country')

  const clearAll = () => router.push('/admin/products')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Source type */}
      <select
        value={current('source_type')}
        onChange={(e) => set('source_type', e.target.value)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 text-gray-700"
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Approval status */}
      <select
        value={current('approval_status')}
        onChange={(e) => set('approval_status', e.target.value)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 text-gray-700"
      >
        {APPROVAL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Active state */}
      <select
        value={current('active')}
        onChange={(e) => set('active', e.target.value)}
        className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 text-gray-700"
      >
        {ACTIVE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Origin country (dynamic) */}
      {countries.length > 0 && (
        <select
          value={current('country')}
          onChange={(e) => set('country', e.target.value)}
          className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 text-gray-700"
        >
          <option value="">Tous les pays</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {/* Clear filters */}
      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs px-2.5 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
        >
          Effacer les filtres ×
        </button>
      )}
    </div>
  )
}
