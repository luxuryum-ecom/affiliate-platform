'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('wholesale.productDetail')
  const [state, action, isPending] = useActionState(addToCart, initialState)
  const [qty, setQty] = useState(minQty)

  // Live tier calculation — runs purely on the client
  const activeTier = tiers.length > 0 ? getWholesaleTier(tiers, qty) : null
  const unitPrice = activeTier ? activeTier.price_per_unit : sellPrice
  const subtotal = unitPrice * qty

  const decrement = () => setQty((q) => Math.max(minQty, q - 1))
  const increment = () => setQty((q) => Math.min(stockCount, q + 1))
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= minQty) setQty(Math.min(stockCount, val))
  }

  const nextTier = tiers
    .filter((tier) => tier.min_qty > qty)
    .sort((a, b) => a.min_qty - b.min_qty)[0] ?? null
  const nextTierReachable = nextTier != null && nextTier.min_qty <= stockCount
  const unitsToNextTier = nextTier ? nextTier.min_qty - qty : 0
  const savingsPerUnit = nextTier ? unitPrice - nextTier.price_per_unit : 0

  // Stock=0 — show unavailable message with WhatsApp CTA instead of the full form
  if (stockCount === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-danger bg-danger-soft px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-danger-fg">{t('addToCartUnavailableTitle')}</p>
          <p className="text-xs text-danger-fg">{t('addToCartUnavailableDesc')}</p>
        </div>
        <a
          href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent('Bonjour, je souhaite être informé du réapprovisionnement de ce produit.')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-success-fg text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          <span>💬</span> {t('addToCartNotifyWa')}
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
        <div className="rounded-xl border border-warning bg-warning-soft px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-warning-fg">{t('addToCartPartialStockTitle')}</p>
          <p className="text-xs text-warning-fg">
            {t('addToCartPartialStockDesc', { stock: stockCount, min: minQty })}
          </p>
          <a
            href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Bonjour, je souhaite commander ${stockCount} unités (stock partiel disponible).`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            💬 {t('addToCartPartialWa')}
          </a>
        </div>
      )}

      {/* Tier pricing table */}
      {tiers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            {t('addToCartTiersHeader')}
          </p>
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg">
                <tr>
                  <th className="px-3 py-2 text-start text-xs font-medium text-muted">
                    {t('addToCartTierQty')}
                  </th>
                  <th className="px-3 py-2 text-end text-xs font-medium text-muted">
                    {t('addToCartTierPrice')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tiers.map((tier, i) => {
                  const isActive = activeTier
                    ? qty >= tier.min_qty && (tier.max_qty === undefined || qty <= tier.max_qty)
                    : false
                  return (
                    <tr key={i} className={isActive ? 'bg-success-soft' : ''}>
                      <td className="px-3 py-2 text-muted">
                        {tier.max_qty ? `${tier.min_qty} – ${tier.max_qty}` : `${tier.min_qty}+`} u.
                        {isActive && (
                          <span className="ms-2 text-xs text-success-fg font-medium">
                            {t('addToCartTierActive')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end font-medium text-foreground">
                        {formatMAD(tier.price_per_unit)}
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
          <label className="block text-xs font-medium text-muted mb-2">
            {t('addToCartQtyLabel')} <span className="text-faint">{t('addToCartQtyMin', { min: minQty })}</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={decrement}
              disabled={qty <= minQty}
              className="w-9 h-9 flex items-center justify-center border border-line rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={handleInput}
              min={minQty}
              max={stockCount}
              className="w-20 text-center py-2 border border-line rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground"
            />
            <button
              type="button"
              onClick={increment}
              className="w-9 h-9 flex items-center justify-center border border-line rounded-lg text-muted hover:bg-surface-2 transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
        </div>

        {/* Next-tier nudge */}
        {nextTierReachable && savingsPerUnit > 0 && (
          <p className="text-xs text-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
            {t('addToCartNudge', {
              units: unitsToNextTier,
              savings: savingsPerUnit.toFixed(0),
            })}
          </p>
        )}

        {/* Live pricing summary */}
        <div className="bg-bg rounded-xl p-4 space-y-1.5 border border-line">
          {activeTier && (
            <p className="text-xs text-success-fg font-medium">
              {activeTier.label}
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t('addToCartUnitPrice')}</span>
            <span className="font-medium text-foreground">{formatMAD(unitPrice)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-line pt-1.5 mt-1.5">
            <span className="text-foreground font-medium">{t('addToCartSubtotal')}</span>
            <span className="font-bold text-foreground text-base">{formatMAD(subtotal)}</span>
          </div>
          {stockCount > 0 && (
            <p className="text-xs text-faint">
              {t('addToCartStockCount', { count: stockCount })}
            </p>
          )}
        </div>

        {/* Feedback */}
        {state.error && (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}
        {state.success && (
          <div className="bg-success-soft border border-success px-3 py-2 rounded-lg flex items-center justify-between">
            <p className="text-sm text-success-fg font-medium">{t('addToCartSuccess')}</p>
            <Link
              href="/wholesale/cart"
              className="text-xs text-success-fg underline underline-offset-2"
            >
              {t('addToCartViewCart')}
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || stockCount === 0}
          className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? t('addToCartAdding')
            : stockCount === 0
            ? t('addToCartOutOfStock')
            : t('addToCartButton')}
        </button>
      </form>
    </div>
  )
}
