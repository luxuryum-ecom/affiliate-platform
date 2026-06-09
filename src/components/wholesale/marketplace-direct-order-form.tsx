'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { addMarketplaceToCart, type CartState } from '@/app/actions/cart'
import { formatMAD } from '@/lib/utils'

const initialState: CartState = { error: null, success: false }

interface TDirect {
  stockNote: string
  qtyLabel: string
  qtyMin: string
  unitPrice: string
  subtotal: string
  stockAvailable: (count: number, unit: string) => string
  outOfStock: string
  stockOk: string
  addToCart: string
  adding: string
  addedSuccess: string
  viewCart: string
}

interface Props {
  supplierProductId: string
  unitPrice: number
  minQty: number
  stockCount: number | null
  unit: string
  locale?: string
  tDirect: TDirect
}

export function MarketplaceDirectOrderForm({
  supplierProductId,
  unitPrice,
  minQty,
  stockCount,
  unit,
  tDirect,
}: Props) {
  const [state, action, isPending] = useActionState(addMarketplaceToCart, initialState)
  const [qty, setQty] = useState(minQty)

  const isOutOfStock   = stockCount === 0
  const hasKnownStock  = stockCount != null && stockCount > 0

  const subtotal = unitPrice * qty
  const decrement = () => setQty((q) => Math.max(minQty, q - 1))
  const increment = () => setQty((q) => hasKnownStock ? Math.min(stockCount!, q + 1) : q + 1)
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= minQty) setQty(hasKnownStock ? Math.min(stockCount!, val) : val)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{tDirect.stockNote}</p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="supplierProductId" value={supplierProductId} />
        <input type="hidden" name="quantity" value={qty} />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">
            {tDirect.qtyLabel} <span className="text-gray-400">({tDirect.qtyMin})</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={decrement}
              disabled={qty <= minQty}
              aria-label="Diminuer la quantité"
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={handleInput}
              min={minQty}
              max={stockCount ?? undefined}
              className="w-20 text-center py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={increment}
              disabled={hasKnownStock && qty >= stockCount!}
              aria-label="Augmenter la quantité"
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{tDirect.unitPrice}</span>
            <span className="font-medium text-gray-900">{formatMAD(unitPrice)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-1.5 mt-1.5">
            <span className="text-gray-700 font-medium">{tDirect.subtotal}</span>
            <span className="font-bold text-gray-900 text-base">{formatMAD(subtotal)}</span>
          </div>
          <p className="text-xs text-gray-400">
            {hasKnownStock
              ? tDirect.stockAvailable(stockCount!, unit)
              : isOutOfStock
              ? tDirect.outOfStock
              : tDirect.stockOk
            }
          </p>
        </div>

        {state.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}
        {state.success && (
          <div className="bg-green-50 border border-green-200 px-3 py-2 rounded-lg flex items-center justify-between">
            <p className="text-sm text-green-700 font-medium">✓ {tDirect.addedSuccess}</p>
            <Link
              href="/wholesale/cart"
              className="text-xs text-green-700 underline underline-offset-2"
            >
              {tDirect.viewCart}
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || isOutOfStock}
          className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? tDirect.adding : isOutOfStock ? tDirect.outOfStock : tDirect.addToCart}
        </button>
      </form>
    </div>
  )
}
