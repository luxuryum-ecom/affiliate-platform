import { describe, it, expect } from 'vitest'
import {
  computeStockFreshness,
  stockNeedsConfirmation,
  STOCK_FRESH_MAX_HOURS,
  STOCK_EXPIRED_MIN_HOURS,
} from '@/lib/supplier-stock-freshness'

// Horloge de référence fixe pour des tests déterministes.
const NOW = new Date('2026-06-25T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

describe('computeStockFreshness', () => {
  it('retourne unknown si pas d\'horodatage', () => {
    expect(computeStockFreshness(null, NOW)).toBe('unknown')
    expect(computeStockFreshness(undefined, NOW)).toBe('unknown')
    expect(computeStockFreshness('', NOW)).toBe('unknown')
  })

  it('retourne unknown si date invalide', () => {
    expect(computeStockFreshness('pas-une-date', NOW)).toBe('unknown')
  })

  it('frais : âge <= seuil frais (72h)', () => {
    expect(computeStockFreshness(hoursAgo(0), NOW)).toBe('fresh')
    expect(computeStockFreshness(hoursAgo(1), NOW)).toBe('fresh')
    expect(computeStockFreshness(hoursAgo(STOCK_FRESH_MAX_HOURS), NOW)).toBe('fresh')
  })

  it('tiède : entre seuil frais et seuil périmé', () => {
    expect(computeStockFreshness(hoursAgo(STOCK_FRESH_MAX_HOURS + 1), NOW)).toBe('stale')
    expect(computeStockFreshness(hoursAgo(120), NOW)).toBe('stale')
    expect(computeStockFreshness(hoursAgo(STOCK_EXPIRED_MIN_HOURS), NOW)).toBe('stale')
  })

  it('périmé : âge > seuil périmé (7j)', () => {
    expect(computeStockFreshness(hoursAgo(STOCK_EXPIRED_MIN_HOURS + 1), NOW)).toBe('expired')
    expect(computeStockFreshness(hoursAgo(24 * 30), NOW)).toBe('expired')
  })

  it('horodatage dans le futur (horloge décalée) → frais, jamais pénalisé', () => {
    expect(computeStockFreshness(hoursAgo(-10), NOW)).toBe('fresh')
  })
})

describe('stockNeedsConfirmation', () => {
  it('faux uniquement quand frais', () => {
    expect(stockNeedsConfirmation('fresh')).toBe(false)
    expect(stockNeedsConfirmation('stale')).toBe(true)
    expect(stockNeedsConfirmation('expired')).toBe(true)
    expect(stockNeedsConfirmation('unknown')).toBe(true)
  })
})
