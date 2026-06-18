import { describe, it, expect } from 'vitest'
import { buildCleanExtraction, type AiExtractionRaw } from '@/lib/telegram/schema'

// Fiche IA brute minimale valide — on ne fait varier que `unit` (et la légende
// implicite). Les autres champs prouvent la NON-RÉGRESSION (inchangés).
const base: AiExtractionRaw = {
  product_name: 'Riz basmati',
  category: 'Autres',
  subcategory: '',
  description: 'Sac de riz',
  price: 12,
  stock_quantity: null,
  lead_time_days: null,
}

describe('P2 — extraction IA de l’unité de vente', () => {
  it('« le mètre » / « metre » / arabe → metre', () => {
    expect(buildCleanExtraction({ ...base, unit: 'metre' }).unit).toBe('metre')
    expect(buildCleanExtraction({ ...base, unit: 'le mètre' }).unit).toBe('metre')
    expect(buildCleanExtraction({ ...base, unit: 'متر' }).unit).toBe('metre')
  })
  it('« 12 dh le kg » → kg (le kilo / كيلو)', () => {
    expect(buildCleanExtraction({ ...base, unit: 'kg' }).unit).toBe('kg')
    expect(buildCleanExtraction({ ...base, unit: 'le kilo' }).unit).toBe('kg')
    expect(buildCleanExtraction({ ...base, unit: 'كيلو' }).unit).toBe('kg')
  })
  it('« 8 dh le carton » → carton (la caisse / كرطونة)', () => {
    expect(buildCleanExtraction({ ...base, unit: 'carton' }).unit).toBe('carton')
    expect(buildCleanExtraction({ ...base, unit: 'la caisse' }).unit).toBe('carton')
    expect(buildCleanExtraction({ ...base, unit: 'كرطونة' }).unit).toBe('carton')
  })
  it('« le paquet » / « le sac » → paquet', () => {
    expect(buildCleanExtraction({ ...base, unit: 'paquet' }).unit).toBe('paquet')
    expect(buildCleanExtraction({ ...base, unit: 'le sac' }).unit).toBe('paquet')
  })
  it('description SANS unité → piece (défaut, jamais d’erreur)', () => {
    expect(buildCleanExtraction({ ...base, unit: null }).unit).toBe('piece')
    expect(buildCleanExtraction({ ...base, unit: undefined }).unit).toBe('piece')
    expect(buildCleanExtraction({ ...base, unit: '' }).unit).toBe('piece')
    expect(buildCleanExtraction({ ...base, unit: 'bidule-inconnu' }).unit).toBe('piece')
    // unit absent du tout (fiche pré-P2) → piece
    expect(buildCleanExtraction(base).unit).toBe('piece')
  })

  it('NON-RÉGRESSION : les autres champs restent inchangés quelle que soit l’unité', () => {
    const c = buildCleanExtraction({ ...base, unit: 'kg' })
    expect(c.product_name).toBe('Riz basmati')
    expect(c.price_source).toBe(12)
    expect(c.category).toBe('Autres')
    expect(c.stock_quantity).toBeNull()
    expect(c.lead_time_days).toBeNull()
  })
})

describe('P3 — extraction conditionnement (pack_size / pack_unit)', () => {
  it('« carton de 50 boîtes » → pack_size 50, pack_unit "boîte"', () => {
    const c = buildCleanExtraction({ ...base, unit: 'carton', pack_size: 50, pack_unit: 'boîte' })
    expect(c.pack_size).toBe(50)
    expect(c.pack_unit).toBe('boîte')
  })
  it('incomplet (taille seule OU nom seul) → { null, null } = pas de conditionnement', () => {
    expect(buildCleanExtraction({ ...base, pack_size: 50, pack_unit: null }).pack_size).toBeNull()
    expect(buildCleanExtraction({ ...base, pack_size: null, pack_unit: 'boîte' }).pack_unit).toBeNull()
  })
  it('taille < 2 (lot de 1) → ignoré', () => {
    const c = buildCleanExtraction({ ...base, pack_size: 1, pack_unit: 'boîte' })
    expect(c.pack_size).toBeNull()
    expect(c.pack_unit).toBeNull()
  })
  it('aucun conditionnement (défaut) → null/null, jamais d’erreur', () => {
    const c = buildCleanExtraction(base)
    expect(c.pack_size).toBeNull()
    expect(c.pack_unit).toBeNull()
  })
})
