'use client'

// V5-bis.3 — Saisie manuelle du stock par le fournisseur (mode 'manuel' + fraîcheur).
// Strings résolues côté SERVEUR et passées en props sérialisables (jamais de fonction
// passée à un Client Component). Le badge de fraîcheur est calculé serveur (label + ton).

import { useActionState } from 'react'
import { updateSupplierStock, type SupplierProductState } from '@/app/actions/supplier-products'

interface Strings {
  stockLabel: string
  updateBtn: string
  saving: string
  success: string
  errorInvalidStock: string
  errorUnauthorized: string
  errorGeneric: string
}

interface Props {
  productId: string
  currentStock: number | null
  /** Libellé de fraîcheur déjà résolu serveur ('' si frais / aucun). */
  freshnessLabel: string
  freshnessTone: 'confirm' | 'watch' | 'none'
  strings: Strings
}

const initialState: SupplierProductState = { error: null }

function resolveError(code: string | null, s: Strings): string {
  if (code === 'errorInvalidStock') return s.errorInvalidStock
  if (code === 'errorStockUnauthorized') return s.errorUnauthorized
  return s.errorGeneric
}

export function StockUpdateForm({ productId, currentStock, freshnessLabel, freshnessTone, strings }: Props) {
  const [state, action, pending] = useActionState(updateSupplierStock, initialState)

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <label className="text-xs text-muted">{strings.stockLabel}</label>
      <input
        name="stock_quantity"
        type="number"
        min="0"
        defaultValue={currentStock ?? 0}
        className="w-20 border border-line bg-surface rounded px-2 py-1 text-xs text-foreground"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded hover:opacity-90 disabled:opacity-50"
      >
        {pending ? strings.saving : strings.updateBtn}
      </button>
      {freshnessLabel && freshnessTone !== 'none' && (
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            freshnessTone === 'confirm'
              ? 'text-warning-fg bg-warning-soft border-warning'
              : 'text-muted bg-surface-2 border-line'
          }`}
        >
          {freshnessLabel}
        </span>
      )}
      {state.success && <span className="text-xs text-success-fg">{strings.success}</span>}
      {state.error && <span className="text-xs text-danger-fg">{resolveError(state.error, strings)}</span>}
    </form>
  )
}
