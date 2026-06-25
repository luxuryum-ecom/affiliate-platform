import { describe, it, expect } from 'vitest'
import {
  computeStockFreshness,
  stockAgeDays,
  stockNeedsConfirmation,
  stockNeedsWatch,
  STOCK_FRESH_MAX_HOURS,
  STOCK_EXPIRED_MIN_HOURS,
} from '@/lib/supplier-stock-freshness'

// Horloge de référence fixe pour des tests déterministes.
const NOW = new Date('2026-06-25T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const daysAgo = (d: number) => hoursAgo(d * 24)

describe('computeStockFreshness — 3 paliers', () => {
  it('retourne unknown si pas d\'horodatage / date invalide', () => {
    expect(computeStockFreshness(null, NOW)).toBe('unknown')
    expect(computeStockFreshness(undefined, NOW)).toBe('unknown')
    expect(computeStockFreshness('', NOW)).toBe('unknown')
    expect(computeStockFreshness('pas-une-date', NOW)).toBe('unknown')
  })

  it('frais : âge <= 3 jours (72h)', () => {
    expect(computeStockFreshness(hoursAgo(0), NOW)).toBe('fresh')
    expect(computeStockFreshness(daysAgo(1), NOW)).toBe('fresh')
    expect(computeStockFreshness(hoursAgo(STOCK_FRESH_MAX_HOURS), NOW)).toBe('fresh')
  })

  it('à surveiller : entre 3 et 14 jours', () => {
    expect(computeStockFreshness(hoursAgo(STOCK_FRESH_MAX_HOURS + 1), NOW)).toBe('watch')
    expect(computeStockFreshness(daysAgo(7), NOW)).toBe('watch')
    expect(computeStockFreshness(hoursAgo(STOCK_EXPIRED_MIN_HOURS), NOW)).toBe('watch')
  })

  it('à confirmer : âge > 14 jours', () => {
    expect(computeStockFreshness(hoursAgo(STOCK_EXPIRED_MIN_HOURS + 1), NOW)).toBe('expired')
    expect(computeStockFreshness(daysAgo(30), NOW)).toBe('expired')
  })

  it('horodatage dans le futur (horloge décalée) → frais', () => {
    expect(computeStockFreshness(hoursAgo(-10), NOW)).toBe('fresh')
  })
})

describe('stockAgeDays', () => {
  it('null si pas d\'horodatage exploitable', () => {
    expect(stockAgeDays(null, NOW)).toBeNull()
    expect(stockAgeDays('pas-une-date', NOW)).toBeNull()
  })
  it('âge en jours entiers (tronqué)', () => {
    expect(stockAgeDays(daysAgo(0), NOW)).toBe(0)
    expect(stockAgeDays(daysAgo(1), NOW)).toBe(1)
    expect(stockAgeDays(hoursAgo(47), NOW)).toBe(1)
    expect(stockAgeDays(daysAgo(7), NOW)).toBe(7)
  })
  it('jamais négatif (horloge décalée → 0)', () => {
    expect(stockAgeDays(hoursAgo(-5), NOW)).toBe(0)
  })
})

describe('paliers de badge', () => {
  it('à confirmer (orange) uniquement pour expired/unknown', () => {
    expect(stockNeedsConfirmation('fresh')).toBe(false)
    expect(stockNeedsConfirmation('watch')).toBe(false)
    expect(stockNeedsConfirmation('expired')).toBe(true)
    expect(stockNeedsConfirmation('unknown')).toBe(true)
  })
  it('à surveiller (gris) uniquement pour watch', () => {
    expect(stockNeedsWatch('fresh')).toBe(false)
    expect(stockNeedsWatch('watch')).toBe(true)
    expect(stockNeedsWatch('expired')).toBe(false)
    expect(stockNeedsWatch('unknown')).toBe(false)
  })
})
