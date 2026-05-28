import type { OrderSignalType } from '@/types/database'

export interface OrderSignalInput {
  order_id: string
  signal_type: OrderSignalType
  score: number
  metadata?: Record<string, unknown>
}

/** Heuristic duplicate detection: same phone + product within 24h. */
export function scoreDuplicateOrder(recentCount: number): number {
  if (recentCount <= 0) return 0
  if (recentCount === 1) return 35
  if (recentCount === 2) return 65
  return 90
}

/** Basic spam scoring from phone/name patterns (extensible for ML). */
export function scoreSpamOrder(phone: string, name: string): number {
  let score = 0
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9) score += 40
  if (/^(.)\1{5,}$/.test(digits)) score += 30
  if (name.trim().length < 3) score += 20
  if (/test|fake|xxx/i.test(name)) score += 25
  return Math.min(100, score)
}

/** Placeholder fraud score — hook for future AI models. */
export function scoreFraudOrder(opts: {
  duplicateScore: number
  spamScore: number
  hasAffiliate: boolean
}): number {
  const base = opts.duplicateScore * 0.5 + opts.spamScore * 0.4
  return Math.min(100, Math.round(base + (opts.hasAffiliate ? 0 : 5)))
}

export function buildConversionMetadata(clicks: number, orders: number): Record<string, unknown> {
  const rate = clicks > 0 ? Math.round((orders / clicks) * 10000) / 100 : 0
  return { clicks, orders, conversion_rate_pct: rate }
}

export function formatConversionRate(clicks: number, orders: number): string {
  if (clicks === 0) return '—'
  return `${((orders / clicks) * 100).toFixed(1)} %`
}

export function formatReturnRate(delivered: number, returned: number): string {
  const total = delivered + returned
  if (total === 0) return '0 %'
  return `${((returned / total) * 100).toFixed(1)} %`
}

/** Morocco delivery estimate by product availability. */
export function getDeliveryEstimate(availabilityType: string): {
  label: string
  daysMin: number
  daysMax: number
} {
  if (availabilityType === 'import_on_demand') {
    return { label: '7–14 jours ouvrables', daysMin: 7, daysMax: 14 }
  }
  return { label: '2–5 jours ouvrables', daysMin: 2, daysMax: 5 }
}
