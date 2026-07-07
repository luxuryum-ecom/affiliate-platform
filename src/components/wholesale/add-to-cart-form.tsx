'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { addToCart, type CartState } from '@/app/actions/cart'
import { getWholesaleTier, formatMAD } from '@/lib/utils'
import { priceWithUnit } from '@/lib/units'
import { computeTierNudge, shouldShowNudge } from '@/lib/wholesale/tier-nudge'
import type { WholesaleTier } from '@/types/database'

interface AddToCartFormProps {
  productId: string
  sellPrice: number
  tiers: WholesaleTier[]
  minQty: number
  stockCount: number
  /** Lot B : variante défaut résolue côté serveur. Propagée en hidden input → addToCart. */
  defaultVariantId?: string | null
  /**
   * Libellé d'unité déjà résolu côté SERVEUR (string, jamais une fonction — cf. règle
   * projet sur les Client Components). Non fourni / null → aucun suffixe (C1a).
   */
  unitLabel?: string | null
}

const initialState: CartState = { error: null, success: false }

export function AddToCartForm({
  productId,
  sellPrice,
  tiers,
  minQty,
  stockCount,
  defaultVariantId,
  unitLabel,
}: AddToCartFormProps) {
  const t = useTranslations('wholesale.productDetail')
  const [state, action, isPending] = useActionState(addToCart, initialState)
  const [qty, setQty] = useState(minQty)
  // Lot B : la variante sélectionnée est initialisée sur la variante défaut.
  // Dans ce composant, pas de VariantSelector (le sélecteur est dans WholesaleProductSection
  // si le produit en a plusieurs) → pour l'instant on fixe la variante défaut.
  const [selectedVariantId] = useState<string | null>(defaultVariantId ?? null)

  // Live tier calculation — runs purely on the client
  const activeTier = tiers.length > 0 ? getWholesaleTier(tiers, qty) : null
  const unitPrice = activeTier ? activeTier.price_per_unit : sellPrice
  const subtotal = unitPrice * qty

  // Quantité libre : jamais plafonnée au stock. Au-delà du stock → sur-commande (devis),
  // jamais « indisponible » (règle métier A1). Le serveur garde son contrôle qty>stock.
  const decrement = () => setQty((q) => Math.max(minQty, q - 1))
  const increment = () => setQty((q) => q + 1)
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= minQty) setQty(val)
  }

  // qty > stock (y compris stock 0) → on bascule en devis « sur-commande », pas de panier.
  const isOverOrder = qty > stockCount

  // Nudge de palier (AM-2) — logique pure extraite dans tier-nudge.ts (testée).
  const nudge = computeTierNudge(tiers, qty, unitPrice, stockCount)
  const { unitsToNextTier, savingsPerUnit } = nudge
  const showNudge = shouldShowNudge(nudge)

  return (
    <div className="space-y-5">
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
                        {priceWithUnit(formatMAD(tier.price_per_unit), unitLabel)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Qty selector — toujours visible (la quantité décide panier vs devis) */}
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
        {stockCount > 0 && (
          <p className="text-xs text-faint mt-2">{t('addToCartStockCount', { count: stockCount })}</p>
        )}
      </div>

      {isOverOrder ? (
        /* Sur-commande : quantité > stock → devis / confirmation équipe (jamais « indisponible ») */
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">{t('overOrderTitle')}</p>
          <p className="text-xs text-muted">{t('overOrderDesc')}</p>
          <a
            href="#quote"
            className="inline-flex items-center justify-center w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            {t('overOrderCta')}
          </a>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="productId" value={productId} />
          {selectedVariantId && (
            <input type="hidden" name="variantId" value={selectedVariantId} />
          )}
          {/* Controlled qty is synced to hidden input on every render */}
          <input type="hidden" name="quantity" value={qty} />

          {/* Next-tier nudge */}
          {showNudge && (
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
              <span className="font-medium text-foreground">{priceWithUnit(formatMAD(unitPrice), unitLabel)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-line pt-1.5 mt-1.5">
              <span className="text-foreground font-medium">{t('addToCartSubtotal')}</span>
              <span className="font-bold text-foreground text-base">{formatMAD(subtotal)}</span>
            </div>
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
          {state.warning === 'restocking' && (
            <div className="bg-accent-soft border border-accent px-3 py-2 rounded-lg">
              <p className="text-sm text-accent-fg">{t('addToCartRestockingWarning')}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? t('addToCartAdding') : t('addToCartButton')}
          </button>
        </form>
      )}
    </div>
  )
}
