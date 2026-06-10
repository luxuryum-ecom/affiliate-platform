'use client'

import { useActionState } from 'react'
import { updateSupplierFinancials } from '@/app/actions/supplier-payout'
import { formatMAD } from '@/lib/utils'
import type { SupplierCommissionType } from '@/types/database'

interface Props {
  quoteRequestId: string
  quantityRequested: number
  quotedUnitPriceMad: number | null
  supplierCostMad: number | null
  commissionType: SupplierCommissionType
  commissionValue: number | null
  commissionAmountMad: number | null
  transportCostMad: number
  payoutAmountMad: number | null
}

const initial = { error: null, success: false }

export function SupplierFinancialsForm({
  quoteRequestId,
  quantityRequested,
  quotedUnitPriceMad,
  supplierCostMad,
  commissionType,
  commissionValue,
  commissionAmountMad,
  transportCostMad,
  payoutAmountMad,
}: Props) {
  const [state, action, isPending] = useActionState(updateSupplierFinancials, initial)

  const totalClientAmount = (quotedUnitPriceMad ?? 0) * quantityRequested

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Finances fournisseur</h2>

      {/* Read-only summary */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Prix unitaire devis</span>
          <span className="font-medium tabular-nums text-gray-700">
            {quotedUnitPriceMad != null ? formatMAD(quotedUnitPriceMad) : '—'} × {quantityRequested}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-gray-200 pt-2">
          <span className="text-xs font-semibold text-gray-700">Total client</span>
          <span className="font-bold tabular-nums text-gray-900">{formatMAD(totalClientAmount)}</span>
        </div>
        {commissionAmountMad != null && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Commission Mozouna</span>
            <span className="font-medium tabular-nums text-red-600">− {formatMAD(commissionAmountMad)}</span>
          </div>
        )}
        {transportCostMad > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Transport & douanes</span>
            <span className="font-medium tabular-nums text-red-600">− {formatMAD(transportCostMad)}</span>
          </div>
        )}
        {payoutAmountMad != null && (
          <div className="flex justify-between items-center border-t border-gray-200 pt-2">
            <span className="text-xs font-semibold text-gray-700">Reversement fournisseur</span>
            <span className={`font-bold tabular-nums text-sm ${payoutAmountMad >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatMAD(payoutAmountMad)}
            </span>
          </div>
        )}
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={quoteRequestId} />

        <div>
          <label className="block text-xs text-gray-500 mb-1">Coût fournisseur (MAD)</label>
          <div className="relative">
            <input
              type="number"
              name="supplier_cost_mad"
              defaultValue={supplierCostMad ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Type de commission</label>
          <select
            name="platform_commission_type"
            defaultValue={commissionType}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 bg-white"
          >
            <option value="percent">Pourcentage (%)</option>
            <option value="fixed">Montant fixe (MAD)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Valeur commission</label>
          <div className="relative">
            <input
              type="number"
              name="platform_commission_value"
              defaultValue={commissionValue ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">% / MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Transport & douanes (MAD)</label>
          <div className="relative">
            <input
              type="number"
              name="transport_customs_cost_mad"
              defaultValue={transportCostMad}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
          </div>
        </div>

        {state.error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Finances mises à jour et reversement calculé.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Calcul…' : 'Enregistrer & calculer'}
        </button>
      </form>
    </div>
  )
}
