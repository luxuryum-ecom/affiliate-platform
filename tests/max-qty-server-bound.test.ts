import { describe, it, expect } from 'vitest'
import { boundWholesaleTierMaxQty, getWholesaleTier } from '@/lib/utils'
import type { WholesaleTier } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// FIX SURFACTURATION CATALOGUE — bornage serveur du max_qty (LOT A2, ⚠️ ARGENT)
//
// Bug : le formulaire catalogue admin peut sauver des paliers SANS max_qty. Sur un
// produit à ≥2 paliers, getWholesaleTier (.find) renvoie alors le 1er palier (le plus
// cher) pour TOUTE quantité → prix facturé ≠ prix affiché (surfacturation grossiste).
// Correctif : boundWholesaleTierMaxQty borne chaque palier par (min du suivant − 1),
// dernier ouvert — logique identique à buildMirrorTiers (canal fournisseur, déjà sûr).
// ─────────────────────────────────────────────────────────────────────────────

describe('boundWholesaleTierMaxQty — (a) paliers sans max_qty correctement bornés', () => {
  it('borne chaque palier par (min du suivant − 1), dernier palier ouvert', () => {
    const unbounded: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 18 },
      { min_qty: 100, price_per_unit: 16 },
    ]
    expect(boundWholesaleTierMaxQty(unbounded)).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 20 },
      { min_qty: 50, max_qty: 99, price_per_unit: 18 },
      { min_qty: 100, price_per_unit: 16 }, // dernier ouvert
    ])
  })

  it('deux paliers : le 1er est borné, le 2e reste ouvert', () => {
    const t: WholesaleTier[] = [
      { min_qty: 5, price_per_unit: 30 },
      { min_qty: 20, price_per_unit: 25 },
    ]
    expect(boundWholesaleTierMaxQty(t)).toEqual([
      { min_qty: 5, max_qty: 19, price_per_unit: 30 },
      { min_qty: 20, price_per_unit: 25 },
    ])
  })

  it('un seul palier : reste ouvert (rien à borner)', () => {
    const t: WholesaleTier[] = [{ min_qty: 12, price_per_unit: 40 }]
    expect(boundWholesaleTierMaxQty(t)).toEqual([{ min_qty: 12, price_per_unit: 40 }])
  })

  it('tableau vide → vide', () => {
    expect(boundWholesaleTierMaxQty([])).toEqual([])
  })

  it("retire un max_qty erroné posé sur le DERNIER palier (invariant : dernier ouvert)", () => {
    const t: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, max_qty: 999, price_per_unit: 16 }, // max_qty aberrant sur le dernier
    ]
    expect(boundWholesaleTierMaxQty(t)).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 16 }, // borne retirée
    ])
  })

  it("n'altère NI min_qty NI price_per_unit (aucun prix touché — RÈGLE ARGENT)", () => {
    const t: WholesaleTier[] = [
      { min_qty: 3, price_per_unit: 149.5 },
      { min_qty: 30, price_per_unit: 99.99 },
    ]
    const out = boundWholesaleTierMaxQty(t)
    expect(out.map((x) => x.min_qty)).toEqual([3, 30])
    expect(out.map((x) => x.price_per_unit)).toEqual([149.5, 99.99])
  })
})

describe('getWholesaleTier — (b) bon palier pour chaque quantité sur données RÉPARÉES', () => {
  const repaired = boundWholesaleTierMaxQty([
    { min_qty: 10, price_per_unit: 20 },
    { min_qty: 50, price_per_unit: 18 },
    { min_qty: 100, price_per_unit: 16 },
  ])

  it('AVANT réparation : la surfacturation existe (qté 100 facturée au 1er palier = 20)', () => {
    const buggy: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 18 },
      { min_qty: 100, price_per_unit: 16 },
    ]
    // Sans bornage, .find renvoie le 1er palier pour toute quantité ≥ 10.
    expect(getWholesaleTier(buggy, 100)?.price_per_unit).toBe(20) // ← BUG prouvé
    expect(getWholesaleTier(buggy, 60)?.price_per_unit).toBe(20) // ← BUG prouvé
  })

  it('qté sous le 1er palier (5) → null', () => {
    expect(getWholesaleTier(repaired, 5)).toBeNull()
  })

  it('bornes du palier 1 [10..49] → 20 MAD/u', () => {
    expect(getWholesaleTier(repaired, 10)?.price_per_unit).toBe(20)
    expect(getWholesaleTier(repaired, 49)?.price_per_unit).toBe(20)
  })

  it('bornes du palier 2 [50..99] → 18 MAD/u (plus de surfacturation)', () => {
    expect(getWholesaleTier(repaired, 50)?.price_per_unit).toBe(18)
    expect(getWholesaleTier(repaired, 99)?.price_per_unit).toBe(18)
  })

  it('palier 3 ouvert [100..∞] → 16 MAD/u', () => {
    expect(getWholesaleTier(repaired, 100)?.price_per_unit).toBe(16)
    expect(getWholesaleTier(repaired, 100000)?.price_per_unit).toBe(16)
  })

  it('le prix facturé == le prix du palier volume attendu pour un balayage de quantités', () => {
    const cases: Array<[number, number]> = [
      [10, 20], [25, 20], [49, 20],
      [50, 18], [75, 18], [99, 18],
      [100, 16], [500, 16], [9999, 16],
    ]
    for (const [qty, expected] of cases) {
      expect(getWholesaleTier(repaired, qty)?.price_per_unit).toBe(expected)
    }
  })
})

describe('boundWholesaleTierMaxQty — (c) idempotence (données déjà bornées non altérées)', () => {
  it('des paliers déjà correctement bornés restent identiques (2e passage == 1er)', () => {
    const alreadyBounded: WholesaleTier[] = [
      { min_qty: 10, max_qty: 49, price_per_unit: 20 },
      { min_qty: 50, max_qty: 99, price_per_unit: 18 },
      { min_qty: 100, price_per_unit: 16 },
    ]
    expect(boundWholesaleTierMaxQty(alreadyBounded)).toEqual(alreadyBounded)
  })

  it('bound(bound(x)) === bound(x) pour des paliers non bornés (point fixe)', () => {
    const unbounded: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 18 },
      { min_qty: 100, price_per_unit: 16 },
    ]
    const once = boundWholesaleTierMaxQty(unbounded)
    const twice = boundWholesaleTierMaxQty(once)
    expect(twice).toEqual(once)
  })
})
