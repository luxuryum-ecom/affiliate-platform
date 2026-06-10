'use client'

import { useActionState } from 'react'
import { updateWholesaleOrderCosts } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { ActionState } from '@/types/orders'

interface Props {
  orderId: string
  supplierCost: number
  transportCost: number
  additionalCost: number
  totalAmount: number
  /** True when all line items are local_stock (Morocco stock). */
  isLocalStock?: boolean
}

const initial: ActionState = { error: null, success: false }

export function WholesaleCostForm({
  orderId,
  supplierCost,
  transportCost,
  additionalCost,
  totalAmount,
  isLocalStock = false,
}: Props) {
  const [state, action, isPending] = useActionState(updateWholesaleOrderCosts, initial)

  const totalCost = supplierCost + transportCost + additionalCost
  const grossProfit = totalAmount - totalCost
  const grossMargin = totalAmount > 0 ? ((grossProfit / totalAmount) * 100).toFixed(1) : '0'
  const sectionTitle = isLocalStock ? 'Coûts locaux' : "Coûts d'import"
  const transportLabel = isLocalStock ? 'Livraison locale' : 'Transport & douanes'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">{sectionTitle}</h2>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <CostField
          label="Coût fournisseur"
          name="supplier_cost_mad"
          defaultValue={supplierCost}
        />
        <CostField
          label={transportLabel}
          name="transport_customs_cost_mad"
          defaultValue={transportCost}
        />
        <CostField
          label="Coûts supplémentaires"
          name="additional_cost_mad"
          defaultValue={additionalCost}
        />

        {state.error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Coûts enregistrés.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer les coûts'}
        </button>
      </form>

      {/* Live breakdown (based on saved values) */}
      <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
        <Row label="Prix de vente" value={formatMAD(totalAmount)} bold />
        <Row label="Coût total" value={formatMAD(totalCost)} className="text-red-600" />
        <div className="border-t border-gray-100 pt-2">
          <Row
            label="Profit brut"
            value={formatMAD(grossProfit)}
            bold
            className={grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}
          />
          <Row
            label="Marge"
            value={`${grossMargin}%`}
            className={Number(grossMargin) >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        </div>
      </div>
    </div>
  )
}

function CostField({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: number
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={0}
          step={0.01}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  className = 'text-gray-700',
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${className}`}>
        {value}
      </span>
    </div>
  )
}
