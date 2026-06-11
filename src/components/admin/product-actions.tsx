'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toggleProductActive, deleteProduct } from '@/app/actions/products'

interface ProductActionsProps {
  id: string
  name: string
  active: boolean
}

/**
 * Inline action buttons for the product list row.
 * Uses bound server actions as form actions — no client-side fetch needed.
 */
export function ProductActions({ id, name, active }: ProductActionsProps) {
  const t = useTranslations('admin.products')
  const tc = useTranslations('admin.common')

  const toggleAction = toggleProductActive.bind(null, id, !active)
  const deleteAction = deleteProduct.bind(null, id)

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Edit */}
      <Link
        href={`/admin/products/${id}/edit`}
        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-foreground bg-surface border border-line rounded-lg hover:bg-surface-2 transition-colors"
      >
        {tc('edit')}
      </Link>

      {/* Toggle active */}
      <form
        action={toggleAction}
        onSubmit={(e) => {
          if (active) {
            const ok = window.confirm(t('confirmDeactivate', { name }))
            if (!ok) e.preventDefault()
          }
        }}
      >
        <button
          type="submit"
          className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            active
              ? 'text-warning-fg bg-warning-soft border-warning hover:opacity-90'
              : 'text-success-fg bg-success-soft border-success hover:opacity-90'
          }`}
        >
          {active ? tc('deactivate') : tc('activate')}
        </button>
      </form>

      {/* Delete */}
      <form
        action={deleteAction}
        onSubmit={(e) => {
          const ok = window.confirm(t('confirmDelete', { name }))
          if (!ok) e.preventDefault()
        }}
      >
        <button
          type="submit"
          className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-danger-fg bg-surface border border-danger-soft rounded-lg hover:bg-danger-soft transition-colors"
        >
          {tc('delete')}
        </button>
      </form>
    </div>
  )
}
