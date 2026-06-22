import { describe, it, expect } from 'vitest'
import {
  normalizeCategory,
  normalizeSubcategory,
  sanitizeSuggestedCategory,
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

// CAT-IA-SUGGEST — proposition de NOUVELLE catégorie (file de validation).
describe('sanitizeSuggestedCategory', () => {
  it('propose un nouveau libellé inédit quand la catégorie résolue = Autres', () => {
    expect(sanitizeSuggestedCategory('Électroménager', 'Autres')).toBe('Électroménager')
    expect(sanitizeSuggestedCategory('  Quincaillerie  ', 'Autres')).toBe('Quincaillerie')
  })

  it('ne propose RIEN si une vraie catégorie a matché (≠ Autres)', () => {
    expect(sanitizeSuggestedCategory('Électroménager', 'Textile')).toBeNull()
  })

  it('ignore vide / null / « Autres » lui-même', () => {
    expect(sanitizeSuggestedCategory(null, 'Autres')).toBeNull()
    expect(sanitizeSuggestedCategory('', 'Autres')).toBeNull()
    expect(sanitizeSuggestedCategory('   ', 'Autres')).toBeNull()
    expect(sanitizeSuggestedCategory('Autres', 'Autres')).toBeNull()
    expect(sanitizeSuggestedCategory('  autres ', 'Autres')).toBeNull()
  })

  it('ne propose pas un doublon d\'une catégorie existante (insensible à la casse)', () => {
    expect(sanitizeSuggestedCategory('Textile', 'Autres')).toBeNull()
    expect(sanitizeSuggestedCategory('  chaussures ', 'Autres')).toBeNull()
  })

  it('borne la longueur à 60 caractères', () => {
    const long = 'X'.repeat(100)
    expect(sanitizeSuggestedCategory(long, 'Autres')).toHaveLength(60)
  })
})

describe('buildCleanExtraction (intégration nettoyage)', () => {
  it('surface suggested_category quand catégorie inconnue + proposition inédite', () => {
    const clean = buildCleanExtraction({
      product_name: 'Mixeur 500W',
      category: 'Électroménager', // inconnue → Autres
      subcategory: '',
      description: 'Petit électroménager.',
      price: 300,
      suggested_category: 'Électroménager',
    })
    expect(clean.category).toBe('Autres')
    expect(clean.suggested_category).toBe('Électroménager')
  })

  it('suggested_category = null si une vraie catégorie a matché', () => {
    const clean = buildCleanExtraction({
      product_name: 'T-shirt',
      category: 'Textile',
      subcategory: 'Homme',
      description: 'x',
      price: 50,
      suggested_category: 'Habillement', // ignorée : Textile a matché
    })
    expect(clean.category).toBe('Textile')
    expect(clean.suggested_category).toBeNull()
  })

  it('suggested_category = null quand absent du payload IA', () => {
    const clean = buildCleanExtraction({
      product_name: 'X',
      category: 'Voitures', // inconnue → Autres, mais pas de proposition
      subcategory: '',
      description: 'x',
      price: null,
    })
    expect(clean.category).toBe('Autres')
    expect(clean.suggested_category).toBeNull()
  })
})

describe('buildCleanExtraction (intégration nettoyage — base)', () => {
  it('nettoie une fiche avec catégorie inconnue + prix string', () => {
    const clean = buildCleanExtraction({
      product_name: '  Sac en cuir  ',
      category: 'Maroquinerie', // inconnue
      subcategory: 'Sacs', // inconnue
      description: '  Beau sac.  ',
      price: '250 dh',
    })
    expect(clean.product_name).toBe('Sac en cuir')
    expect(clean.category).toBe('Autres')
    expect(clean.subcategory).toBe('')
    expect(clean.description).toBe('Beau sac.')
    expect(clean.price_source).toBe(250)
  })

  it('met description à null si vide, prix à null si absent', () => {
    const clean = buildCleanExtraction({
      product_name: 'X',
      category: 'Textile',
      subcategory: 'Homme',
      description: '   ',
      price: null,
    })
    expect(clean.description).toBeNull()
    expect(clean.price_source).toBeNull()
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
        price: 10,
      }).success,
    ).toBe(true)
  })
})
