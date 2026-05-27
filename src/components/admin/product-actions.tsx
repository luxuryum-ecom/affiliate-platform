'use client'

import Link from 'next/link'
import { toggleProductActive, deleteProduct } from '@/app/actions/products'

interface ProductActionsProps {
  id: string
  active: boolean
}

/**
 * Inline action buttons for the product list row.
 * Uses bound server actions as form actions — no client-side fetch needed.
 */
export function ProductActions({ id, active }: ProductActionsProps) {
  const toggleAction = toggleProductActive.bind(null, id, !active)
  const deleteAction = deleteProduct.bind(null, id)

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Edit */}
      <Link
        href={`/admin/products/${id}/edit`}
        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Modifier
      </Link>

      {/* Toggle active */}
      <form action={toggleAction}>
        <button
          type="submit"
          className={`inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            active
              ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
              : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
          }`}
        >
          {active ? 'Désactiver' : 'Activer'}
        </button>
      </form>

      {/* Delete */}
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm('Supprimer définitivement ce produit ?')) {
            e.preventDefault()
          }
        }}
      >
        <button
          type="submit"
          className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-100 rounded-lg hover:bg-red-50 transition-colors"
        >
          Suppr.
        </button>
      </form>
    </div>
  )
}
