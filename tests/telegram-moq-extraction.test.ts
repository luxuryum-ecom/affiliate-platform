import { describe, it, expect } from 'vitest'
import { buildCleanExtraction, type AiExtractionRaw } from '@/lib/telegram/schema'

// @finance — LOT 3 : l'extraction IA des paliers passe par sanitizeMoqTiers en BOUT
// de chaîne (buildCleanExtraction), AVANT toute écriture. Ces tests sont
// DÉTERMINISTES (pas d'appel IA) : ils partent d'une sortie IA brute et prouvent le
// nettoyage. Le résultat n'est jamais un prix public (pending_review + modération).

// Fabrique une sortie IA brute minimale (les champs non testés prennent des valeurs neutres).
function raw(partial: Partial<AiExtractionRaw>): AiExtractionRaw {
  return {
    product_name: 'Maillot',
    category: 'Autres',
    subcategory: '',
    description: '',
    price: null,
    stock_quantity: null,
    lead_time_days: null,
    unit: null,
    pack_size: null,
    pack_unit: null,
    suggested_category: null,
    moq_tiers: null,
    ...partial,
  }
}

describe('LOT 3 — extraction IA des paliers (buildCleanExtraction)', () => {
  it('(a) "20 aed, 50=18, 100=16, min 50" → paliers extraits, triés, minimum = 50', () => {
    // L'IA met le prix headline dans price, et les couples qté→prix dans moq_tiers.
    const clean = buildCleanExtraction(
      raw({ price: 20, moq_tiers: [{ min_quantity: 100, unit_price: 16 }, { min_quantity: 50, unit_price: 18 }] }),
    )
    expect(clean.moq_tiers).toEqual([
      { min_quantity: 50, unit_price: 18 },
      { min_quantity: 100, unit_price: 16 },
    ])
    // Le 1er palier (trié) porte le MINIMUM de commande.
    expect(clean.moq_tiers[0].min_quantity).toBe(50)
    // Le prix headline reste séparé (base), non écrasé par les paliers.
    expect(clean.price_source).toBe(20)
  })

  it('(b) "quantité 500" SEULE → stock, PAS un palier', () => {
    // Désambiguïsation prompt : quantité sans prix = stock. Au niveau clean, on
    // prouve que le stock reste du stock et qu'AUCUN palier n'est fabriqué.
    const clean = buildCleanExtraction(raw({ stock_quantity: 500, moq_tiers: [] }))
    expect(clean.stock_quantity).toBe(500)
    expect(clean.moq_tiers).toEqual([])
  })

  it('(c) échelle CROISSANTE → rejetée en [] par le sanitizer', () => {
    const clean = buildCleanExtraction(
      raw({ moq_tiers: [{ min_quantity: 10, unit_price: 20 }, { min_quantity: 50, unit_price: 22 }] }),
    )
    expect(clean.moq_tiers).toEqual([])
  })

  it('doublon de quantité → rejeté en []', () => {
    const clean = buildCleanExtraction(
      raw({ moq_tiers: [{ min_quantity: 50, unit_price: 18 }, { min_quantity: 50, unit_price: 16 }] }),
    )
    expect(clean.moq_tiers).toEqual([])
  })

  it('aucun palier (null / absent) → []', () => {
    expect(buildCleanExtraction(raw({ moq_tiers: null })).moq_tiers).toEqual([])
    expect(buildCleanExtraction(raw({})).moq_tiers).toEqual([])
  })

  it('prix de palier en chaîne (« 18,50 ») → number, arrondi 2 déc.', () => {
    const clean = buildCleanExtraction(
      raw({ moq_tiers: [{ min_quantity: 10, unit_price: '18,50' }] }),
    )
    expect(clean.moq_tiers).toEqual([{ min_quantity: 10, unit_price: 18.5 }])
  })

  it('palier au prix/quantité invalide écarté ; stock inchangé', () => {
    const clean = buildCleanExtraction(
      raw({
        stock_quantity: 200,
        moq_tiers: [
          { min_quantity: 10, unit_price: 20 },
          { min_quantity: 50, unit_price: null }, // écarté
        ],
      }),
    )
    expect(clean.moq_tiers).toEqual([{ min_quantity: 10, unit_price: 20 }])
    expect(clean.stock_quantity).toBe(200)
  })
})
