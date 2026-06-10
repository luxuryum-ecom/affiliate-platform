import { describe, it, expect } from 'vitest'
import {
  calculateNetAffiliateCommission,
  MIN_DELIVERY_FEE_MAD,
  MIN_DELIVERY_FEE_CASABLANCA_MAD,
} from '@/lib/utils'

describe('constantes de plancher livraison (D1)', () => {
  it('national = 35, Casablanca = 25', () => {
    expect(MIN_DELIVERY_FEE_MAD).toBe(35)
    expect(MIN_DELIVERY_FEE_CASABLANCA_MAD).toBe(25)
  })
})

describe('calculateNetAffiliateCommission', () => {
  const base = {
    marginType: 'percentage' as const,
    marginValue: 0,
    packagingFee: 10,
    confirmationFee: 10,
    quantity: 1,
  }

  it('produit normal → commission positive exacte (200-100-0-35-10-10=45)', () => {
    const c = calculateNetAffiliateCommission({ ...base, affiliateSellPrice: 200, factoryCostMad: 100, deliveryFee: 35 })
    expect(c).toBe(45)
  })

  it('marge en pourcentage correctement déduite (200-100-20-35-10-10=25)', () => {
    const c = calculateNetAffiliateCommission({
      affiliateSellPrice: 200, factoryCostMad: 100,
      marginType: 'percentage', marginValue: 20,
      deliveryFee: 35, confirmationFee: 10, packagingFee: 10, quantity: 1,
    })
    expect(c).toBe(25)
  })

  it('la quantité multiplie le net (45 × 3 = 135)', () => {
    const c = calculateNetAffiliateCommission({ ...base, affiliateSellPrice: 200, factoryCostMad: 100, deliveryFee: 35, quantity: 3 })
    expect(c).toBe(135)
  })

  it('produit à faible marge → valeur négative ; le plancher 0 est appliqué par les appelants', () => {
    // 100 - 100 - 0 - 35 - 10 - 10 = -55
    const c = calculateNetAffiliateCommission({ ...base, affiliateSellPrice: 100, factoryCostMad: 100, deliveryFee: 35 })
    expect(c).toBe(-55)
    // products.ts et placeOrder font Math.max(0, …) → jamais sous 0
    expect(Math.max(0, c)).toBe(0)
  })

  it('la livraison (jamais 0) réduit bien la commission', () => {
    const sansFloor = calculateNetAffiliateCommission({ ...base, affiliateSellPrice: 200, factoryCostMad: 100, deliveryFee: 0 })
    const avecFloor = calculateNetAffiliateCommission({ ...base, affiliateSellPrice: 200, factoryCostMad: 100, deliveryFee: 35 })
    expect(sansFloor - avecFloor).toBe(35)
  })
})
