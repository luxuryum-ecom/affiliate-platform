import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes safely — resolves conflicts in priority order. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

/** Format a number as Moroccan dirham. */
export function formatMAD(amount: number): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
  }).format(amount)
}
