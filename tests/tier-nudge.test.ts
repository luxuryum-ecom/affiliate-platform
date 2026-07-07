import { describe, it, expect } from 'vitest'
import { computeTierNudge, shouldShowNudge } from '@/lib/wholesale/tier-nudge'
import type { WholesaleTier } from '@/types/database'

// ─── AM-2 — nudge de palier « ajoute X → économise Z / unité ». Test qui
//     protège unitsToNextTier / savingsPerUnit / nextTierReachable. ──────────

const TIERS: WholesaleTier[] = [
  { min_qty: 10, max_qty: 49, price_per_unit: 20 },
  { min_qty: 50, max_qty: 199, price_per_unit: 18 },
  { min_qty: 200, price_per_unit: 16 },
]

describe('computeTierNudge — prochain palier', () => {
  it('trouve le palier IMMÉDIATEMENT au-dessus (le plus proche), pas le dernier', () => {
    // qty 30, prix courant 20 → prochain palier = 50 (pas 200)
    const n = computeTierNudge(TIERS, 30, 20, 1000)
    expect(n.nextTier?.min_qty).toBe(50)
    expect(n.unitsToNextTier).toBe(20) // 50 - 30
    expect(n.savingsPerUnit).toBe(2) // 20 - 18
  })

  it('depuis le 2e palier, pointe vers le 3e', () => {
    const n = computeTierNudge(TIERS, 80, 18, 1000)
    expect(n.nextTier?.min_qty).toBe(200)
    expect(n.unitsToNextTier).toBe(120) // 200 - 80
    expect(n.savingsPerUnit).toBe(2) // 18 - 16
  })

  it('au dernier palier : aucun palier suivant → valeurs neutres', () => {
    const n = computeTierNudge(TIERS, 250, 16, 1000)
    expect(n.nextTier).toBeNull()
    expect(n.nextTierReachable).toBe(false)
    expect(n.unitsToNextTier).toBe(0)
    expect(n.savingsPerUnit).toBe(0)
  })

  it('produit sans palier → aucun nudge', () => {
    const n = computeTierNudge([], 5, 25, 1000)
    expect(n.nextTier).toBeNull()
    expect(n.unitsToNextTier).toBe(0)
    expect(n.savingsPerUnit).toBe(0)
    expect(shouldShowNudge(n)).toBe(false)
  })
})

describe('computeTierNudge — atteignabilité (stock)', () => {
  it('palier suivant HORS stock disponible → non atteignable', () => {
    // qty 30, prochain palier 50, mais stock = 40 → pas atteignable
    const n = computeTierNudge(TIERS, 30, 20, 40)
    expect(n.nextTier?.min_qty).toBe(50)
    expect(n.nextTierReachable).toBe(false)
    expect(shouldShowNudge(n)).toBe(false)
  })

  it('palier suivant EXACTEMENT au niveau du stock → atteignable', () => {
    const n = computeTierNudge(TIERS, 30, 20, 50)
    expect(n.nextTierReachable).toBe(true)
    expect(shouldShowNudge(n)).toBe(true)
  })

  it('palier suivant sous le stock dispo → atteignable', () => {
    const n = computeTierNudge(TIERS, 30, 20, 1000)
    expect(n.nextTierReachable).toBe(true)
  })
})

describe('shouldShowNudge — seuil d’affichage (inchangé)', () => {
  it('affiché seulement si atteignable ET économie > 0', () => {
    const reachableWithSaving = computeTierNudge(TIERS, 30, 20, 1000)
    expect(shouldShowNudge(reachableWithSaving)).toBe(true)
  })

  it('économie nulle (paliers à prix égal) → pas de nudge même si atteignable', () => {
    const flat: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 20 },
    ]
    const n = computeTierNudge(flat, 20, 20, 1000)
    expect(n.nextTierReachable).toBe(true)
    expect(n.savingsPerUnit).toBe(0)
    expect(shouldShowNudge(n)).toBe(false)
  })

  it('économie négative (palier suivant plus cher — cas aberrant) → pas de nudge', () => {
    const weird: WholesaleTier[] = [
      { min_qty: 10, price_per_unit: 15 },
      { min_qty: 50, price_per_unit: 18 },
    ]
    const n = computeTierNudge(weird, 20, 15, 1000)
    expect(n.savingsPerUnit).toBeLessThan(0)
    expect(shouldShowNudge(n)).toBe(false)
  })

  it('paliers non triés en entrée : trouve quand même le plus proche au-dessus', () => {
    const unsorted: WholesaleTier[] = [
      { min_qty: 200, price_per_unit: 16 },
      { min_qty: 10, price_per_unit: 20 },
      { min_qty: 50, price_per_unit: 18 },
    ]
    const n = computeTierNudge(unsorted, 30, 20, 1000)
    expect(n.nextTier?.min_qty).toBe(50)
  })
})
