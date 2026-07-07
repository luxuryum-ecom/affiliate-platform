import { describe, it, expect } from 'vitest'
import { planReorder, type ReorderItem } from '@/lib/wholesale/reorder'

// ─── AM-1 — réassort 1-clic : planification pure ─────────────────────────────

const mk = (product_id: string, quantity: number, variant_id: string | null = null): ReorderItem => ({
  product_id,
  variant_id,
  quantity,
})

describe('planReorder', () => {
  it('garde les produits commandables, ignore les autres (comptés)', () => {
    const items = [mk('a', 10), mk('b', 5), mk('c', 3)]
    const plan = planReorder(items, new Set(['a', 'c']))
    expect(plan.toAdd.map((i) => i.product_id)).toEqual(['a', 'c'])
    expect(plan.skippedCount).toBe(1) // b non commandable
  })

  it('préserve les quantités exactes', () => {
    const plan = planReorder([mk('a', 42), mk('b', 7)], new Set(['a', 'b']))
    expect(plan.toAdd).toEqual([
      { product_id: 'a', variant_id: null, quantity: 42 },
      { product_id: 'b', variant_id: null, quantity: 7 },
    ])
    expect(plan.skippedCount).toBe(0)
  })

  it('distingue les variantes du même produit', () => {
    const items = [mk('a', 10, 'v1'), mk('a', 5, 'v2')]
    const plan = planReorder(items, new Set(['a']))
    expect(plan.toAdd).toHaveLength(2)
    expect(plan.toAdd).toEqual([
      { product_id: 'a', variant_id: 'v1', quantity: 10 },
      { product_id: 'a', variant_id: 'v2', quantity: 5 },
    ])
  })

  it('déduplique une ligne (product_id, variant_id) identique sans la recompter en skipped', () => {
    const items = [mk('a', 10, 'v1'), mk('a', 99, 'v1')]
    const plan = planReorder(items, new Set(['a']))
    expect(plan.toAdd).toHaveLength(1)
    expect(plan.toAdd[0].quantity).toBe(10) // 1re occurrence gardée
    expect(plan.skippedCount).toBe(0)
  })

  it('ignore les quantités invalides (≤ 0 ou non entières)', () => {
    const items = [mk('a', 0), mk('b', -3), mk('c', 2.5), mk('d', 4)]
    const plan = planReorder(items, new Set(['a', 'b', 'c', 'd']))
    expect(plan.toAdd.map((i) => i.product_id)).toEqual(['d'])
    expect(plan.skippedCount).toBe(3)
  })

  it('aucun produit commandable → toAdd vide, tout skipped', () => {
    const plan = planReorder([mk('a', 1), mk('b', 2)], new Set())
    expect(plan.toAdd).toHaveLength(0)
    expect(plan.skippedCount).toBe(2)
  })

  it('liste vide → plan vide', () => {
    const plan = planReorder([], new Set(['a']))
    expect(plan.toAdd).toHaveLength(0)
    expect(plan.skippedCount).toBe(0)
  })
})
