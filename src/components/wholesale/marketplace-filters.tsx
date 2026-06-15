'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'wholesale-marketplace-filters-open'

export function MarketplaceFilters({
  children,
  filterTitle,
}: {
  children: React.ReactNode
  filterTitle: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '1') setOpen(true)
    } catch {
      // ignore
    }
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-sm font-medium text-muted hover:bg-surface-2 transition-colors shadow-sm"
        aria-expanded={open}
      >
        🔍 {filterTitle}
        <span className="text-faint text-xs" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}
