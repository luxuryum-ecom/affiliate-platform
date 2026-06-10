import { describe, it, expect } from 'vitest'
import { sanitizeNonNegativeInt, buildCleanExtraction } from '@/lib/telegram/schema'

// Stock & délai : entier ≥ 0, plafonné ; tout cas douteux → null (jamais inventer).
describe('sanitizeNonNegativeInt', () => {
  it('accepte un entier positif et zéro', () => {
    expect(sanitizeNonNegativeInt(50, 1000)).toBe(50)
    expect(sanitizeNonNegativeInt(0, 1000)).toBe(0)
  })

  it('rejette un négatif → null', () => {
    expect(sanitizeNonNegativeInt(-5, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt('-5', 1000)).toBeNull()
  })

  it('rejette un non-entier → null', () => {
    expect(sanitizeNonNegativeInt(5.5, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt('5.5', 1000)).toBeNull()
  })

  it('rejette NaN / Infinity / null / undefined / objet → null', () => {
    expect(sanitizeNonNegativeInt(NaN, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt(Infinity, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt(null, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt(undefined, 1000)).toBeNull()
    expect(sanitizeNonNegativeInt({}, 1000)).toBeNull()
  })

  it('extrait un entier d\'une chaîne avec texte', () => {
    expect(sanitizeNonNegativeInt('stock 50', 1000)).toBe(50)
    expect(sanitizeNonNegativeInt('20j', 1000)).toBe(20)
    expect(sanitizeNonNegativeInt('  50 unités ', 1000)).toBe(50)
  })

  it('rejette au-dessus du plafond et les chaînes vides', () => {
    expect(sanitizeNonNegativeInt(101, 100)).toBeNull()
    expect(sanitizeNonNegativeInt('', 1000)).toBeNull()
    expect(sanitizeNonNegativeInt('aucun', 1000)).toBeNull()
  })
})

describe('buildCleanExtraction — stock & délai', () => {
  const base = {
    product_name: 'Table de réunion',
    category: 'Maison & packaging',
    subcategory: 'Articles ménagers',
    description: 'Table + chaises.',
    price_mad: 2000,
  }

  it('capture « stock 50, délai 20j »', () => {
    const clean = buildCleanExtraction({ ...base, stock_quantity: 50, lead_time_days: 20 })
    expect(clean.stock_quantity).toBe(50)
    expect(clean.lead_time_days).toBe(20)
  })

  it('accepte des valeurs en chaîne', () => {
    const clean = buildCleanExtraction({ ...base, stock_quantity: '50', lead_time_days: '20' })
    expect(clean.stock_quantity).toBe(50)
    expect(clean.lead_time_days).toBe(20)
  })

  it('met null si absents', () => {
    const clean = buildCleanExtraction({ ...base, stock_quantity: null })
    expect(clean.stock_quantity).toBeNull()
    expect(clean.lead_time_days).toBeNull() // undefined → null
  })

  it('rejette stock négatif et délai absurde (> plafond)', () => {
    const clean = buildCleanExtraction({ ...base, stock_quantity: -3, lead_time_days: 5000 })
    expect(clean.stock_quantity).toBeNull()
    expect(clean.lead_time_days).toBeNull() // 5000 > 3650 jours
  })
})
