'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { updateCartQty, removeCartItem } from '@/app/actions/cart'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { getWholesaleTier, formatMAD } from '@/lib/utils'
import { resolveUnitLabel, priceWithUnit } from '@/lib/units'
import type { WholesaleCartItemWithProduct } from '@/types/database'

interface CartItemRowProps {
  item: WholesaleCartItemWithProduct
  /**
   * Étape 7.B — stock de la VARIANTE du panier (source de vérité, mig 105), résolu
   * côté serveur par la page panier. Le cap/clamp se base dessus au lieu de l'agrégat
   * produit (réconcilie l'incohérence §9bis : variante défaut à 0 vs autres variantes).
   * Fallback agrégat produit si non fourni (produit sans variante).
   */
  variantStock?: number | null
}

export function CartItemRow({ item, variantStock }: CartItemRowProps) {
  const t = useTranslations('wholesale.cart')
  const tUnits = useTranslations('units')
  const { product } = item
  const [qty, setQty] = useState(item.quantity)

  // Suffixe d'unité (C1a) — résolu CLIENT via le hook next-intl (pattern déjà utilisé
  // dans ce Client Component, ex. ProductForm). null si sale_unit non posé → affichage
  // du prix INCHANGÉ (zéro régression pour les produits sans unité).
  const unitLabel = product.sale_unit ? resolveUnitLabel(product.sale_unit, tUnits) : null

  // Référence de stock = variante (mig 105), fallback agrégat produit.
  const stockCap = variantStock ?? product.stock_count

  const tier = getWholesaleTier(product.wholesale_tiers, qty)
  const unitPrice = tier ? tier.price_per_unit : product.sell_price
  const subtotal = unitPrice * qty

  const decrement = () => setQty((q) => Math.max(product.wholesale_min_qty, q - 1))
  const increment = () => setQty((q) =>
    product.availability_type === 'local_stock'
      ? Math.min(stockCap, q + 1)
      : q + 1
  )
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1)
      setQty(
        product.availability_type === 'local_stock'
          ? Math.min(stockCap, val)
          : val
      )
  }

  const coverUrl = getProductCoverUrl(product)

  return (
    <div className="bg-surface rounded-xl border border-line p-4 flex flex-col sm:flex-row gap-4">
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
            className="font-medium text-foreground text-sm leading-snug hover:underline"
          >
            {/* product.name is DB data */}
            {product.name}
          </Link>
          {/* Remove */}
          <form action={removeCartItem} className="shrink-0">
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              className="text-faint hover:text-danger-fg transition-colors text-lg leading-none"
              aria-label={t('itemRemoveAriaLabel')}
            >
              ×
            </button>
          </form>
        </div>

        {/* Tier hint */}
        {tier ? (
          <p className="text-xs text-success-fg">{tier.label}</p>
        ) : (
          <p className="text-xs text-faint">{unitLabel ? priceWithUnit(formatMAD(product.sell_price), unitLabel) : `${formatMAD(product.sell_price)}/u.`}</p>
        )}

        {/* Qty + price row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Qty controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={decrement}
              disabled={qty <= product.wholesale_min_qty}
              className="w-7 h-7 flex items-center justify-center border border-line rounded-md text-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed text-base leading-none"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={handleInput}
              min={product.wholesale_min_qty}
              max={product.availability_type === 'local_stock' ? stockCap : undefined}
              className="w-14 text-center py-1 border border-line rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
            />
            <button
              type="button"
              onClick={increment}
              disabled={product.availability_type === 'local_stock' && qty >= stockCap}
              className="w-7 h-7 flex items-center justify-center border border-line rounded-md text-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed text-base leading-none"
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
                  ? 'bg-primary text-primary-foreground border-primary hover:opacity-90'
                  : 'text-muted border-line hover:bg-surface-2'
              }`}
            >
              {qty !== item.quantity ? t('itemUpdate') : t('itemUpdated')}
            </button>
          </form>

          {/* Live subtotal */}
          <div className="ms-auto text-end">
            <p className="text-xs text-faint">{unitLabel ? priceWithUnit(formatMAD(unitPrice), unitLabel) : `${formatMAD(unitPrice)}/u.`}</p>
            <p className="font-bold text-foreground text-sm">{formatMAD(subtotal)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
