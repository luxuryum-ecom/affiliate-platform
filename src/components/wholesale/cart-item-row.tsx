'use client'

import { useState } from 'react'
import Link from 'next/link'
import { updateCartQty, removeCartItem } from '@/app/actions/cart'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { getWholesaleTier, formatMAD } from '@/lib/utils'
import type { WholesaleCartItemWithProduct } from '@/types/database'

interface CartItemRowProps {
  item: WholesaleCartItemWithProduct
}

export function CartItemRow({ item }: CartItemRowProps) {
  const { product } = item
  const [qty, setQty] = useState(item.quantity)

  const tier = getWholesaleTier(product.wholesale_tiers, qty)
  const unitPrice = tier ? tier.price_per_unit : product.sell_price
  const subtotal = unitPrice * qty

  const decrement = () => setQty((q) => Math.max(product.wholesale_min_qty, q - 1))
  const increment = () => setQty((q) => q + 1)
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1) setQty(val)
  }

  const coverUrl = getProductCoverUrl(product)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-4">
      {/* Thumbnail */}
      <Link href={`/wholesale/products/${product.id}`} className="shrink-0">
        <ProductThumbnail
          src={coverUrl}
          name={product.name}
          className="w-20 h-20 rounded-lg text-sm"
        />
      </Link>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/wholesale/products/${product.id}`}
            className="font-medium text-gray-900 text-sm leading-snug hover:underline"
          >
            {product.name}
          </Link>
          {/* Remove */}
          <form action={removeCartItem} className="shrink-0">
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
              aria-label="Supprimer"
            >
              ×
            </button>
          </form>
        </div>

        {/* Tier hint */}
        {tier ? (
          <p className="text-xs text-green-600">{tier.label}</p>
        ) : (
          <p className="text-xs text-gray-400">Prix public · {formatMAD(product.sell_price)}/u.</p>
        )}

        {/* Qty + price row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Qty controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={decrement}
              disabled={qty <= product.wholesale_min_qty}
              className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-base leading-none"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={handleInput}
              min={product.wholesale_min_qty}
              className="w-14 text-center py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={increment}
              className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-base leading-none"
            >
              +
            </button>
          </div>

          {/* Update action */}
          <form action={updateCartQty}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="quantity" value={qty} />
            <button
              type="submit"
              className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                qty !== item.quantity
                  ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-700'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {qty !== item.quantity ? 'Sauvegarder' : 'Mettre à jour'}
            </button>
          </form>

          {/* Live subtotal */}
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">{formatMAD(unitPrice)}/u.</p>
            <p className="font-bold text-gray-900 text-sm">{formatMAD(subtotal)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
