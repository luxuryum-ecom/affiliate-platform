import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { PlatformMarginType } from '@/types/database'

/** Merge Tailwind classes safely — resolves conflicts in priority order. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compute the platform selling price from factory cost and margin.
 *
 * percentage: platform_price = factory_cost × (1 + value / 100)
 * fixed:      platform_price = factory_cost + value
 *
 * Result is rounded to whole MAD (no decimals) per business model.
 */
export function calculatePlatformPrice(
  factoryCostMad: number,
  marginType: PlatformMarginType,
  marginValue: number
): number {
  const raw =
    marginType === 'percentage'
      ? factoryCostMad * (1 + marginValue / 100)
      : factoryCostMad + marginValue
  return Math.round(raw)
}

/**
 * Plancher de frais de livraison (MAD) — différencié par zone.
 *
 * Règle métier non négociable : la livraison est TOUJOURS payée par l'affilié,
 * déduite de sa commission — jamais 0. Toute résolution de frais de livraison
 * est planchée à ces valeurs (D1) :
 *   - Casablanca (hub)      → 25 MAD
 *   - Reste du Maroc / défaut → 35 MAD
 */
export const MIN_DELIVERY_FEE_MAD = 35
export const MIN_DELIVERY_FEE_CASABLANCA_MAD = 25

/**
 * Compute the net affiliate commission per unit.
 *
 * net = affiliate_sell_price
 *       − factory_cost
 *       − platform_margin
 *       − packaging_fee
 *       − delivery_fee
 *       − confirmation_fee   (pass 0 when affiliate confirms himself)
 *
 * Returns the total for the given quantity (can be negative if sell_price is too low).
 */
export function calculateNetAffiliateCommission(params: {
  affiliateSellPrice: number
  factoryCostMad: number
  marginType: PlatformMarginType
  marginValue: number
  packagingFee: number
  deliveryFee: number
  /** Pass 0 when the affiliate handles order confirmation himself. */
  confirmationFee: number
  quantity: number
}): number {
  const platformMargin =
    params.marginType === 'percentage'
      ? params.factoryCostMad * (params.marginValue / 100)
      : params.marginValue

  const netPerUnit =
    params.affiliateSellPrice -
    params.factoryCostMad -
    platformMargin -
    params.deliveryFee -
    params.confirmationFee -
    params.packagingFee

  return parseFloat((netPerUnit * params.quantity).toFixed(2))
}

/**
 * Calculate the matching wholesale tier for a given quantity.
 * Returns the matching tier or null if below minimum or no tiers defined.
 */
export function getWholesaleTier(
  tiers: Array<{ min_qty: number; max_qty?: number; price_per_unit: number }>,
  quantity: number
): { price_per_unit: number; label: string } | null {
  if (!tiers.length || quantity <= 0) return null

  const match = tiers.find(
    (t) => quantity >= t.min_qty && (t.max_qty === undefined || quantity <= t.max_qty)
  )
  if (!match) return null

  const label = match.max_qty
    ? `${match.min_qty}–${match.max_qty} unités @ ${match.price_per_unit} MAD/u`
    : `${match.min_qty}+ unités @ ${match.price_per_unit} MAD/u`

  return { price_per_unit: match.price_per_unit, label }
}

/** Format a number in the given ISO 4217 currency (default MAD). */
export function formatCurrency(amount: number, currency: string = 'MAD'): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Format a number as Moroccan dirham. Thin wrapper over formatCurrency. */
export function formatMAD(amount: number): string {
  return formatCurrency(amount, 'MAD')
}
