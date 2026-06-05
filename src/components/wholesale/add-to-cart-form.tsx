'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { addToCart, type CartState } from '@/app/actions/cart'
import { getWholesaleTier, formatMAD } from '@/lib/utils'
import type { WholesaleTier } from '@/types/database'

interface AddToCartFormProps {
  productId: string
  sellPrice: number
  tiers: WholesaleTier[]
  minQty: number
  stockCount: number
}

const initialState: CartState = { error: null, success: false }

export function AddToCartForm({
  productId,
  sellPrice,
  tiers,
  minQty,
  stockCount,
}: AddToCartFormProps) {
  const [state, action, isPending] = useActionState(addToCart, initialState)
  const [qty, setQty] = useState(minQty)

  // Live tier calculation — runs purely on the client
  const tier = tiers.length > 0 ? getWholesaleTier(tiers, qty) : null
  const unitPrice = tier ? tier.price_per_unit : sellPrice
  const subtotal = unitPrice * qty

  const decrement = () => setQty((q) => Math.max(minQty, q - 1))
  const increment = () => setQty((q) => Math.min(stockCount, q + 1))
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= minQty) setQty(Math.min(stockCount, val))
  }

  return (
    <div className="space-y-5">
      {/* Tier pricing table */}
      {tiers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Paliers de prix
          </p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quantité</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    Prix / unité
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tiers.map((t, i) => {
                  const isActive = tier
                    ? qty >= t.min_qty && (t.max_qty === undefined || qty <= t.max_qty)
                    : false
                  return (
                    <tr
                      key={i}
                      className={isActive ? 'bg-green-50' : ''}
                    >
                      <td className="px-3 py-2 text-gray-700">
                        {t.max_qty ? `${t.min_qty} – ${t.max_qty}` : `${t.min_qty}+`} u.
                        {isActive && (
                          <span className="ml-2 text-xs text-green-600 font-medium">✓ Actif</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatMAD(t.price_per_unit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Qty selector */}
      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        {/* Controlled qty is synced to hidden input on every render */}
        <input type="hidden" name="quantity" value={qty} />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Quantité <span className="text-gray-400">(min. {minQty})</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={decrement}
              disabled={qty <= minQty}
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={handleInput}
              min={minQty}
              max={stockCount}
              className="w-20 text-center py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={increment}
              className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
        </div>

        {/* Live pricing summary */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
          {tier && (
            <p className="text-xs text-green-600 font-medium">
              Palier actif : {tier.label}
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Prix unitaire</span>
            <span className="font-medium text-gray-900">{formatMAD(unitPrice)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-gray-200 pt-1.5 mt-1.5">
            <span className="text-gray-700 font-medium">Sous-total estimé</span>
            <span className="font-bold text-gray-900 text-base">{formatMAD(subtotal)}</span>
          </div>
          <p className="text-xs text-gray-400">
            {stockCount > 0
              ? `${stockCount} unités en stock`
              : 'Stock limité — contactez-nous'}
          </p>
        </div>

        {/* Feedback */}
        {state.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}
        {state.success && (
          <div className="bg-green-50 border border-green-200 px-3 py-2 rounded-lg flex items-center justify-between">
            <p className="text-sm text-green-700 font-medium">✓ Ajouté au panier</p>
            <Link
              href="/wholesale/cart"
              className="text-xs text-green-700 underline underline-offset-2"
            >
              Voir le panier →
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || stockCount === 0}
          className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Ajout en cours…'
            : stockCount === 0
            ? 'Produit épuisé'
            : 'Ajouter au panier'}
        </button>
      </form>
    </div>
  )
}
