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
  stockAvailable: string
  outOfStock: string
  stockOk: string
  addToCart: string
  adding: string
  addedSuccess: string
  viewCart: string
  overOrderTitle: string
  overOrderDesc: string
  overOrderCta: string
  addToCartRestockingWarning: string
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
  tDirect,
}: Props) {
  const [state, action, isPending] = useActionState(addMarketplaceToCart, initialState)
  const [qty, setQty] = useState(minQty)

  const hasKnownStock = stockCount != null && stockCount > 0

  const subtotal = unitPrice * qty
  // Quantité libre : jamais plafonnée au stock. Au-delà du stock → sur-commande (devis),
  // jamais « épuisé » sans issue (règle métier A1). Le serveur garde son contrôle qty>stock.
  const decrement = () => setQty((q) => Math.max(minQty, q - 1))
  const increment = () => setQty((q) => q + 1)
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= minQty) setQty(val)
  }

  // Bascule devis : stock épuisé (0) OU quantité demandée > stock connu.
  // Stock inconnu (null) → on laisse le panier, le serveur valide.
  const showQuote = stockCount === 0 || (hasKnownStock && qty > stockCount)

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{tDirect.stockNote}</p>

      {/* Sélecteur de quantité — toujours visible (la quantité décide panier vs devis) */}
      <div>
        <label className="block text-xs font-medium text-muted mb-2">
          {tDirect.qtyLabel} <span className="text-faint">({tDirect.qtyMin})</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={decrement}
            disabled={qty <= minQty}
            aria-label="Diminuer la quantité"
            className="w-9 h-9 flex items-center justify-center border border-line rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
          >
            −
          </button>
          <input
            type="number"
            value={qty}
            onChange={handleInput}
            min={minQty}
            className="w-20 text-center py-2 border border-line rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground"
          />
          <button
            type="button"
            onClick={increment}
            aria-label="Augmenter la quantité"
            className="w-9 h-9 flex items-center justify-center border border-line rounded-lg text-muted hover:bg-surface-2 transition-colors text-lg leading-none"
          >
            +
          </button>
        </div>
        {hasKnownStock && <p className="text-xs text-faint mt-2">{tDirect.stockAvailable}</p>}
      </div>

      {showQuote ? (
        /* Sur-commande / rupture → devis (confirmation équipe), jamais « épuisé » sans issue */
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">{tDirect.overOrderTitle}</p>
          <p className="text-xs text-muted">{tDirect.overOrderDesc}</p>
          <a
            href="#quote"
            className="inline-flex items-center justify-center w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            {tDirect.overOrderCta}
          </a>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="supplierProductId" value={supplierProductId} />
          <input type="hidden" name="quantity" value={qty} />

          <div className="bg-bg rounded-xl p-4 space-y-1.5 border border-line">
            <div className="flex justify-between text-sm">
              <span className="text-muted">{tDirect.unitPrice}</span>
              <span className="font-medium text-foreground">{formatMAD(unitPrice)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-line pt-1.5 mt-1.5">
              <span className="text-foreground font-medium">{tDirect.subtotal}</span>
              <span className="font-bold text-foreground text-base">{formatMAD(subtotal)}</span>
            </div>
            <p className="text-xs text-faint">
              {hasKnownStock ? tDirect.stockAvailable : tDirect.stockOk}
            </p>
          </div>

          {state.error && (
            <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
              {state.error}
            </p>
          )}
          {state.success && (
            <div className="bg-success-soft border border-success px-3 py-2 rounded-lg flex items-center justify-between">
              <p className="text-sm text-success-fg font-medium">✓ {tDirect.addedSuccess}</p>
              <Link
                href="/wholesale/cart"
                className="text-xs text-success-fg underline underline-offset-2"
              >
                {tDirect.viewCart}
              </Link>
            </div>
          )}
          {state.warning === 'restocking' && (
            <div className="bg-accent-soft border border-accent px-3 py-2 rounded-lg">
              <p className="text-sm text-accent-fg">{tDirect.addToCartRestockingWarning}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? tDirect.adding : tDirect.addToCart}
          </button>
        </form>
      )}
    </div>
  )
}
