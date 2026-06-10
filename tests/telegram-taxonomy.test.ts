import { describe, it, expect } from 'vitest'
import {
  normalizeCategory,
  normalizeSubcategory,
  buildCleanExtraction,
  aiExtractionRawSchema,
} from '@/lib/telegram/schema'

// « catégorie inconnue » → fallback sûr, jamais une valeur hors taxonomie.
describe('normalizeCategory (catégorie inconnue)', () => {
  it('garde une catégorie valide exacte', () => {
    expect(normalizeCategory('Textile')).toBe('Textile')
  })

  it('est insensible à la casse', () => {
    expect(normalizeCategory('textile')).toBe('Textile')
    expect(normalizeCategory('  CHAUSSURES  ')).toBe('Chaussures')
  })

  it('rabat une catégorie inconnue sur « Autres »', () => {
    expect(normalizeCategory('Voitures')).toBe('Autres')
    expect(normalizeCategory('électroménager bizarre')).toBe('Autres')
  })

  it('rabat null / vide sur « Autres »', () => {
    expect(normalizeCategory(null)).toBe('Autres')
    expect(normalizeCategory(undefined)).toBe('Autres')
    expect(normalizeCategory('')).toBe('Autres')
  })
})

describe('normalizeSubcategory', () => {
  it('garde une sous-catégorie valide de la catégorie', () => {
    expect(normalizeSubcategory('Textile', 'Femme')).toBe('Femme')
  })

  it('rejette une sous-catégorie absente de la catégorie → ""', () => {
    expect(normalizeSubcategory('Textile', 'Épices')).toBe('')
  })

  it('rejette une sous-catégorie inconnue → ""', () => {
    expect(normalizeSubcategory('Textile', 'n\'importe quoi')).toBe('')
    expect(normalizeSubcategory('Autres', null)).toBe('')
  })
})

describe('buildCleanExtraction (intégration nettoyage)', () => {
  it('nettoie une fiche avec catégorie inconnue + prix string', () => {
    const clean = buildCleanExtraction({
      product_name: '  Sac en cuir  ',
      category: 'Maroquinerie', // inconnue
      subcategory: 'Sacs', // inconnue
      description: '  Beau sac.  ',
      price_mad: '250 dh',
    })
    expect(clean.product_name).toBe('Sac en cuir')
    expect(clean.category).toBe('Autres')
    expect(clean.subcategory).toBe('')
    expect(clean.description).toBe('Beau sac.')
    expect(clean.suggested_wholesale_price_mad).toBe(250)
  })

  it('met description à null si vide, prix à null si absent', () => {
    const clean = buildCleanExtraction({
      product_name: 'X',
      category: 'Textile',
      subcategory: 'Homme',
      description: '   ',
      price_mad: null,
    })
    expect(clean.description).toBeNull()
    expect(clean.suggested_wholesale_price_mad).toBeNull()
    expect(clean.category).toBe('Textile')
    expect(clean.subcategory).toBe('Homme')
  })

  it('le schéma IA rejette une sortie incomplète', () => {
    expect(aiExtractionRawSchema.safeParse({ product_name: 'x' }).success).toBe(false)
    expect(
      aiExtractionRawSchema.safeParse({
        product_name: 'x',
        category: 'Textile',
        subcategory: '',
        description: 'd',
        price_mad: 10,
      }).success,
    ).toBe(true)
  })
})
