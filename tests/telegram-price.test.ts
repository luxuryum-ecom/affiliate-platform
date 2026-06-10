import { describe, it, expect } from 'vitest'
import { sanitizeExtractedPrice } from '@/lib/telegram/schema'

// @finance — un prix extrait ne doit JAMAIS être négatif, nul, NaN, absurde,
// ni silencieusement tronqué. En cas d'ambiguïté → null.
describe('sanitizeExtractedPrice — bornes', () => {
  it('accepte un nombre positif', () => {
    expect(sanitizeExtractedPrice(120)).toBe(120)
  })

  it('rejette négatif / zéro / sous le plancher (1 MAD)', () => {
    expect(sanitizeExtractedPrice(-5)).toBeNull()
    expect(sanitizeExtractedPrice(0)).toBeNull()
    expect(sanitizeExtractedPrice(0.5)).toBeNull()
    expect(sanitizeExtractedPrice('0,50')).toBeNull()
    expect(sanitizeExtractedPrice(0.99)).toBeNull()
    expect(sanitizeExtractedPrice(1)).toBe(1)
  })

  it('rejette une chaîne négative (le signe est conservé)', () => {
    expect(sanitizeExtractedPrice('-5 dh')).toBeNull()
    expect(sanitizeExtractedPrice('-12,50')).toBeNull()
  })

  it('rejette NaN, null, undefined, objet, Infinity → null', () => {
    expect(sanitizeExtractedPrice(NaN)).toBeNull()
    expect(sanitizeExtractedPrice(null)).toBeNull()
    expect(sanitizeExtractedPrice(undefined)).toBeNull()
    expect(sanitizeExtractedPrice({})).toBeNull()
    expect(sanitizeExtractedPrice(Infinity)).toBeNull()
  })

  it('frontière du plafond', () => {
    expect(sanitizeExtractedPrice(1_000_000)).toBe(1_000_000)
    expect(sanitizeExtractedPrice(1_000_000.01)).toBeNull()
    expect(sanitizeExtractedPrice(2_000_000)).toBeNull()
  })
})

describe('sanitizeExtractedPrice — parsing chaîne', () => {
  it('extrait un prix avec devise et espaces', () => {
    expect(sanitizeExtractedPrice('120 DH')).toBe(120)
    expect(sanitizeExtractedPrice('  85dh ')).toBe(85)
  })

  it('virgule décimale simple', () => {
    expect(sanitizeExtractedPrice('120,50')).toBe(120.5)
    expect(sanitizeExtractedPrice('120.50')).toBe(120.5)
  })

  it('séparateur de milliers (point ou virgule, formats EU/US)', () => {
    expect(sanitizeExtractedPrice('1.234,56')).toBe(1234.56) // EU : point=millier
    expect(sanitizeExtractedPrice('1,234.56')).toBe(1234.56) // US : virgule=millier
    expect(sanitizeExtractedPrice('1 234,56')).toBe(1234.56) // espace=millier
    expect(sanitizeExtractedPrice('12.345')).toBe(12345) // groupe de 3 → millier
    expect(sanitizeExtractedPrice('12,345')).toBe(12345)
  })

  it('rejette les séparateurs incohérents → null (jamais tronquer)', () => {
    expect(sanitizeExtractedPrice('12.34.56')).toBeNull() // groupes ≠ 3
    expect(sanitizeExtractedPrice('12,5,5')).toBeNull()
    expect(sanitizeExtractedPrice('100-50')).toBeNull() // tiret intercalé
  })

  it('un montant au-dessus du plafond après parsing → null', () => {
    expect(sanitizeExtractedPrice('1.234.567')).toBeNull() // 1 234 567 > plafond
  })

  it('arrondit à 2 décimales', () => {
    expect(sanitizeExtractedPrice(12.999)).toBe(13)
    expect(sanitizeExtractedPrice(99.991)).toBe(99.99)
  })

  it('rejette une chaîne sans chiffre ASCII', () => {
    expect(sanitizeExtractedPrice('pas de prix')).toBeNull()
    expect(sanitizeExtractedPrice('-')).toBeNull()
    expect(sanitizeExtractedPrice('')).toBeNull()
    expect(sanitizeExtractedPrice('٠١٢')).toBeNull() // chiffres arabes non ASCII
  })
})
