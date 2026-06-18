import { describe, it, expect } from 'vitest'
import {
  computeWholesaleSavings,
  formatSavingMad,
  formatSavingQty,
} from '@/lib/wholesale-savings'

describe('computeWholesaleSavings', () => {
  it('exemple canonique 52/50/48/46 (qty 10/50/100/500)', () => {
    const r = computeWholesaleSavings([
      { min_qty: 10, max_qty: 49, price_per_unit: 52 },
      { min_qty: 50, max_qty: 99, price_per_unit: 50 },
      { min_qty: 100, max_qty: 499, price_per_unit: 48 },
      { min_qty: 500, price_per_unit: 46 },
    ])!
    expect(r).not.toBeNull()
    expect(r.basePrice).toBe(52)
    // économie totale = (52 − prix) × min_qty
    expect(r.tiers).toEqual([
      { minQty: 50, pricePerUnit: 50, totalSaving: 100 },
      { minQty: 100, pricePerUnit: 48, totalSaving: 400 },
      { minQty: 500, pricePerUnit: 46, totalSaving: 3000 },
    ])
    expect(r.maxSaving).toBe(3000)
    expect(r.maxSavingQty).toBe(500)
  })

  it('garde-fou : null si < 2 paliers', () => {
    expect(computeWholesaleSavings([])).toBeNull()
    expect(computeWholesaleSavings([{ min_qty: 10, price_per_unit: 50 }])).toBeNull()
    expect(computeWholesaleSavings(null)).toBeNull()
    expect(computeWholesaleSavings(undefined)).toBeNull()
  })

  it('trie les paliers non ordonnés', () => {
    const r = computeWholesaleSavings([
      { min_qty: 500, price_per_unit: 46 },
      { min_qty: 10, price_per_unit: 52 },
      { min_qty: 100, price_per_unit: 48 },
    ])!
    expect(r.basePrice).toBe(52)
    expect(r.maxSaving).toBe(3000)
    expect(r.tiers.map((t) => t.minQty)).toEqual([100, 500])
  })

  it('ignore les paliers sans économie (prix ≥ base) et les valeurs invalides', () => {
    // base = 50 ; un palier plus cher (55) → économie négative, exclu.
    const r = computeWholesaleSavings([
      { min_qty: 10, price_per_unit: 50 },
      { min_qty: 50, price_per_unit: 55 },
      { min_qty: 100, price_per_unit: 45 },
    ])!
    expect(r.tiers).toEqual([{ minQty: 100, pricePerUnit: 45, totalSaving: 500 }])
    expect(r.maxSaving).toBe(500)
  })

  it('null si aucune économie positive (paliers tous au même prix)', () => {
    expect(
      computeWholesaleSavings([
        { min_qty: 10, price_per_unit: 50 },
        { min_qty: 100, price_per_unit: 50 },
      ]),
    ).toBeNull()
  })

  it('rejette les valeurs non finies / négatives', () => {
    const r = computeWholesaleSavings([
      { min_qty: 10, price_per_unit: 52 },
      { min_qty: -5, price_per_unit: 40 },
      { min_qty: 100, price_per_unit: 0 },
      { min_qty: 200, price_per_unit: 46 },
    ])!
    // seuls 10@52 et 200@46 sont valides → 1 économie : (52−46)×200 = 1200
    expect(r.tiers).toEqual([{ minQty: 200, pricePerUnit: 46, totalSaving: 1200 }])
  })
})

describe('formatSaving* (chiffres latins)', () => {
  it('formatSavingMad : entier latin groupé par espace + MAD, sans décimales', () => {
    expect(formatSavingMad(3000)).toBe('3 000 MAD')
    expect(formatSavingMad(100)).toBe('100 MAD')
  })
  it('formatSavingQty : entier latin groupé par espace', () => {
    expect(formatSavingQty(500)).toBe('500')
    expect(formatSavingQty(1000)).toBe('1 000')
  })
})
