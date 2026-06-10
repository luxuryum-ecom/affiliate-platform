import { describe, it, expect } from 'vitest'
import { sanitizeExtractedPrice } from '@/lib/telegram/schema'

// @finance — un prix extrait ne doit JAMAIS être négatif, nul, NaN ou absurde.
describe('sanitizeExtractedPrice (prix non négatif)', () => {
  it('accepte un nombre positif', () => {
    expect(sanitizeExtractedPrice(120)).toBe(120)
  })

  it('rejette un nombre négatif → null', () => {
    expect(sanitizeExtractedPrice(-5)).toBeNull()
  })

  it('rejette zéro → null', () => {
    expect(sanitizeExtractedPrice(0)).toBeNull()
  })

  it('rejette une chaîne négative « -5 dh » → null (le signe est conservé)', () => {
    expect(sanitizeExtractedPrice('-5 dh')).toBeNull()
    expect(sanitizeExtractedPrice('-12,50')).toBeNull()
  })

  it('rejette NaN, null, undefined, objet → null', () => {
    expect(sanitizeExtractedPrice(NaN)).toBeNull()
    expect(sanitizeExtractedPrice(null)).toBeNull()
    expect(sanitizeExtractedPrice(undefined)).toBeNull()
    expect(sanitizeExtractedPrice({})).toBeNull()
    expect(sanitizeExtractedPrice(Infinity)).toBeNull()
  })

  it('extrait un prix d\'une chaîne avec devise et espaces', () => {
    expect(sanitizeExtractedPrice('120 DH')).toBe(120)
    expect(sanitizeExtractedPrice('  85dh ')).toBe(85)
  })

  it('gère la virgule décimale', () => {
    expect(sanitizeExtractedPrice('120,50')).toBe(120.5)
  })

  it('arrondit à 2 décimales via centimes (pas d\'artefact flottant)', () => {
    expect(sanitizeExtractedPrice(12.999)).toBe(13)
    expect(sanitizeExtractedPrice(99.991)).toBe(99.99)
    expect(sanitizeExtractedPrice('0.005')).toBe(0.01)
  })

  it('rejette un montant absurde au-dessus du plafond', () => {
    expect(sanitizeExtractedPrice(2_000_000)).toBeNull()
  })

  it('rejette une chaîne sans chiffre', () => {
    expect(sanitizeExtractedPrice('pas de prix')).toBeNull()
    expect(sanitizeExtractedPrice('-')).toBeNull()
    expect(sanitizeExtractedPrice('')).toBeNull()
  })
})
