'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { addToCart, type CartState } from '@/app/actions/cart'
import { getWholesaleTier, formatMAD } from '@/lib/utils'
import type { WholesaleTier } from '@/types/database'

const whatsappPhone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

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

  const nextTier = tiers
    .filter((t) => t.min_qty > qty)
    .sort((a, b) => a.min_qty - b.min_qty)[0] ?? null
  const nextTierReachable = nextTier != null && nextTier.min_qty <= stockCount
  const unitsToNextTier = nextTier ? nextTier.min_qty - qty : 0
  const savingsPerUnit = nextTier ? unitPrice - nextTier.price_per_unit : 0

  // Stock=0 — show unavailable message with WhatsApp CTA instead of the full form
  if (stockCount === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-red-700">Temporairement indisponible</p>
          <p className="text-xs text-red-600">
            Ce produit est actuellement en rupture de stock. Contactez-nous pour connaître les délais de réapprovisionnement.
          </p>
        </div>
        <a
          href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent('Bonjour, je souhaite être informé du réapprovisionnement de ce produit.')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors text-sm"
        >
          <span>💬</span> Être notifié via WhatsApp
        </a>
      </div>
    )
  }

  // Partial stock — stock > 0 but below minimum order quantity
  const isPartialStock = stockCount > 0 && stockCount < minQty

  return (
    <div className="space-y-5">
      {/* Partial stock warning */}
      {isPartialStock && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Stock partiel</p>
          <p className="text-xs text-amber-700">
            Seulement <strong>{stockCount} unités</strong> disponibles — en dessous du MOQ minimum ({minQty} u.). Contactez-nous pour une commande partielle.
          </p>
          <a
            href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Bonjour, je souhaite commander ${stockCount} unités (stock partiel disponible).`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors"
          >
            💬 Commander le stock disponible
          </a>
        </div>
      )}

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

        {/* Next-tier nudge */}
        {nextTierReachable && savingsPerUnit > 0 && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Ajoutez <strong>{unitsToNextTier} u.</strong> pour passer au palier suivant et économiser <strong>{savingsPerUnit.toFixed(0)} MAD/u.</strong>
          </p>
        )}

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
