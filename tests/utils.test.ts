import { describe, it, expect } from 'vitest'
import {
  calculateNetAffiliateCommission,
  calculatePlatformPrice,
  MIN_DELIVERY_FEE_MAD,
  MIN_DELIVERY_FEE_CASABLANCA_MAD,
  DELIVERY_PROVISION_MAD,
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

  it('livraison DELIVERY_PROVISION_MAD = 35 (provision fixe dans le capital)', () => {
    expect(DELIVERY_PROVISION_MAD).toBe(35)
  })

  // Option B (capital exact) — la marge est désormais soustraite via le PRIX
  // PLATEFORME ARRONDI (calculatePlatformPrice), donc plus de demi-centime issu de
  // la marge fractionnaire. Cas : usine 11.5, 15% → calculatePlatformPrice =
  // ROUND(11.5×1.15)=ROUND(13.225)=13 → net = 50 − 13 − 10 − 0 − 10 = 17 → ×3 = 51.
  // (L'ancien comportement marge non arrondie donnait 50.33 ; Option B = entier net.)
  it('Option B : marge soustraite arrondie (prix plateforme), pas de fraction (×3 = 51)', () => {
    const c = calculateNetAffiliateCommission({
      affiliateSellPrice: 50, factoryCostMad: 11.5,
      marginType: 'percentage', marginValue: 15,
      deliveryFee: 10, confirmationFee: 0, packagingFee: 10, quantity: 3,
    })
    expect(c).toBe(51)
  })
})

// ── Règle capital affilié (migration 073) ────────────────────────────────────
// CAPITAL = calculatePlatformPrice(usine, marge) + packaging + confirmation + DELIVERY_PROVISION_MAD
// COMMISSION au prix catalogue = sell_price − capital = 0 (par construction).
// COMMISSION au-dessus du catalogue > 0 strictement.

describe('règle capital affilié — commission au catalogue = 0, au-dessus > 0', () => {
  // Paramètres fixture : usine 100, marge 0%, packaging 10, confirmation 10, provision 35
  // capital = ROUND(100 × 1) + 10 + 10 + 35 = 155
  // commission au catalogue (sell = 155) = 155 − 100 − 0 − 35 − 10 − 10 = 0

  it('sell_price = capital → commission exactement 0 (marge % 0)', () => {
    const usine = 100
    const capital = calculatePlatformPrice(usine, 'percentage', 0) + 10 + 10 + DELIVERY_PROVISION_MAD
    expect(capital).toBe(155)
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital,
      factoryCostMad: usine,
      marginType: 'percentage',
      marginValue: 0,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBe(0)
  })

  it('sell_price = capital → commission exactement 0 (marge % 20)', () => {
    // capital = ROUND(100 × 1.20) + 10 + 10 + 35 = 120 + 55 = 175
    const usine = 100
    const capital = calculatePlatformPrice(usine, 'percentage', 20) + 10 + 10 + DELIVERY_PROVISION_MAD
    expect(capital).toBe(175)
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital,
      factoryCostMad: usine,
      marginType: 'percentage',
      marginValue: 20,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBe(0)
  })

  it('sell_price = capital → commission exactement 0 (marge fixe)', () => {
    // capital = ROUND(100 + 30) + 10 + 10 + 35 = 130 + 55 = 185
    const usine = 100
    const capital = calculatePlatformPrice(usine, 'fixed', 30) + 10 + 10 + DELIVERY_PROVISION_MAD
    expect(capital).toBe(185)
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital,
      factoryCostMad: usine,
      marginType: 'fixed',
      marginValue: 30,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBe(0)
  })

  // Cas MARGE NON ENTIÈRE (le trou d'arrondi signalé par @finance, désormais fermé) :
  // usine 183, 20% → marge brute 36.6. Ancien calcul (marge non arrondie) :
  // commission catalogue = +0.4 (l'affilié touchait 0.40 MAD au catalogue → interdit).
  // Option B : calculatePlatformPrice(183,20%)=ROUND(219.6)=220 → capital 220+10+10+35=275 ;
  // commission au catalogue (sell=275) = 275 − 220 − 35 − 10 − 10 = 0 PILE.
  it('marge NON ENTIÈRE (usine 183, 20%) → commission au catalogue = 0 exact', () => {
    const usine = 183
    const capital = calculatePlatformPrice(usine, 'percentage', 20) + 10 + 10 + DELIVERY_PROVISION_MAD
    expect(capital).toBe(275)
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital,
      factoryCostMad: usine,
      marginType: 'percentage',
      marginValue: 20,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBe(0)
  })

  it('sell_price > capital → commission strictement positive', () => {
    const usine = 100
    const capital = calculatePlatformPrice(usine, 'percentage', 20) + 10 + 10 + DELIVERY_PROVISION_MAD
    // +50 au-dessus du catalogue
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital + 50,
      factoryCostMad: usine,
      marginType: 'percentage',
      marginValue: 20,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBeGreaterThan(0)
    expect(commission).toBe(50)
  })

  it('sell_price < capital → commission négative (planchée à 0 par les appelants)', () => {
    const usine = 100
    const capital = calculatePlatformPrice(usine, 'percentage', 20) + 10 + 10 + DELIVERY_PROVISION_MAD
    const commission = calculateNetAffiliateCommission({
      affiliateSellPrice: capital - 10,
      factoryCostMad: usine,
      marginType: 'percentage',
      marginValue: 20,
      packagingFee: 10,
      confirmationFee: 10,
      deliveryFee: DELIVERY_PROVISION_MAD,
      quantity: 1,
    })
    expect(commission).toBeLessThan(0)
    expect(Math.max(0, commission)).toBe(0)
  })
})
