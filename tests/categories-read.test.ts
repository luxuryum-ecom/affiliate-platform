import { describe, it, expect } from 'vitest'
import {
  buildTreeFromRows,
  buildContext,
  staticTree,
  loadCategoryContext,
  type CategoryRow,
} from '@/lib/categories/read'
import { CATEGORY_TAXONOMY, PRODUCT_CATEGORIES, isAffiliateAllowedCategory } from '@/lib/taxonomy'
import { normalizeCategory, normalizeSubcategory } from '@/lib/telegram/schema'

// ─────────────────────────────────────────────────────────────────────────────
// SOUS-LOT 2 — lecture base + FALLBACK fail-closed.
// Tests déterministes (fetcher injecté) : aucune dépendance DB / réseau.
// Prouve : (1) la lecture DB se transforme correctement ; (2) toute panne/vide
// retombe sur taxonomy.ts ; (3) le fallback n'élargit JAMAIS le canal affilié.
// ─────────────────────────────────────────────────────────────────────────────

// Petit jeu de lignes DB miroir d'une partie de la taxonomie.
const SAMPLE_ROWS: CategoryRow[] = [
  { id: 'p1', slug: 'Textile', parent_id: null, affiliate_allowed: true, active: true, sort_order: 1 },
  { id: 'p2', slug: 'Alimentaire', parent_id: null, affiliate_allowed: false, active: true, sort_order: 2 },
  { id: 's1', slug: 'Femme', parent_id: 'p1', affiliate_allowed: false, active: true, sort_order: 2 },
  { id: 's2', slug: 'Homme', parent_id: 'p1', affiliate_allowed: false, active: true, sort_order: 1 },
  { id: 's3', slug: 'Bio', parent_id: 'p2', affiliate_allowed: false, active: true, sort_order: 1 },
]

describe('buildTreeFromRows — transformation DB → arbre', () => {
  it('groupe parents/enfants et trie par sort_order', () => {
    const tree = buildTreeFromRows(SAMPLE_ROWS)
    expect(tree.map((n) => n.slug)).toEqual(['Textile', 'Alimentaire'])
    const textile = tree.find((n) => n.slug === 'Textile')!
    expect(textile.subcategories).toEqual(['Homme', 'Femme']) // trié par sort_order
    expect(textile.affiliateAllowed).toBe(true)
    expect(tree.find((n) => n.slug === 'Alimentaire')!.affiliateAllowed).toBe(false)
  })

  it('ignore les lignes inactives', () => {
    const rows: CategoryRow[] = [
      ...SAMPLE_ROWS,
      { id: 'p3', slug: 'Désactivée', parent_id: null, affiliate_allowed: true, active: false, sort_order: 3 },
    ]
    const tree = buildTreeFromRows(rows)
    expect(tree.map((n) => n.slug)).not.toContain('Désactivée')
  })

  it('lève si aucune catégorie parente active (→ déclenche le fallback amont)', () => {
    const onlySubs: CategoryRow[] = [SAMPLE_ROWS[2]]
    expect(() => buildTreeFromRows(onlySubs)).toThrow()
  })

  it('affiliateAllowed est POSITIF : une valeur non-true → false (fail-closed)', () => {
    const rows: CategoryRow[] = [
      // @ts-expect-error — simule une valeur DB inattendue (null) : ne doit pas ouvrir le canal
      { id: 'x', slug: 'X', parent_id: null, affiliate_allowed: null, active: true, sort_order: 1 },
    ]
    expect(buildTreeFromRows(rows)[0].affiliateAllowed).toBe(false)
  })
})

describe('staticTree — fallback = copie de taxonomy.ts', () => {
  it('reproduit exactement les 12 catégories + flags affiliés du code', () => {
    const tree = staticTree()
    expect(tree.map((n) => n.slug)).toEqual([...PRODUCT_CATEGORIES])
    for (const node of tree) {
      expect(node.affiliateAllowed).toBe(isAffiliateAllowedCategory(node.slug))
      expect(node.subcategories).toEqual([...CATEGORY_TAXONOMY[node.slug as keyof typeof CATEGORY_TAXONOMY]])
    }
  })
})

describe('loadCategoryContext — fail-closed', () => {
  it('lecture OK → origin "db", arbre issu de la base', async () => {
    const ctx = await loadCategoryContext(async () => SAMPLE_ROWS)
    expect(ctx.origin).toBe('db')
    expect(ctx.tree.map((n) => n.slug)).toEqual(['Textile', 'Alimentaire'])
  })

  it('fetcher qui LÈVE (DB injoignable) → origin "fallback" = taxonomy.ts', async () => {
    const ctx = await loadCategoryContext(async () => {
      throw new Error('DB down')
    })
    expect(ctx.origin).toBe('fallback')
    expect(ctx.tree.map((n) => n.slug)).toEqual([...PRODUCT_CATEGORIES])
  })

  it('table VIDE → origin "fallback" (jamais une taxonomie vide)', async () => {
    const ctx = await loadCategoryContext(async () => [])
    expect(ctx.origin).toBe('fallback')
    expect(ctx.tree.length).toBe(PRODUCT_CATEGORIES.length)
  })

  it('le fallback n\'élargit JAMAIS le canal : aucune catégorie affiliée de plus que taxonomy.ts', async () => {
    const ctx = await loadCategoryContext(async () => {
      throw new Error('boom')
    })
    for (const node of ctx.tree) {
      // si le fallback marquait une catégorie affiliée à tort → fuite. Vérif stricte.
      expect(node.affiliateAllowed).toBe(isAffiliateAllowedCategory(node.slug))
    }
  })
})

describe('source DB branchée sur la normalisation d\'ingestion', () => {
  it('normalizeCategory/Subcategory utilisent la source fournie (DB) au lieu du code', () => {
    const ctx = buildContext(buildTreeFromRows(SAMPLE_ROWS), 'db')
    // 'Bio' est sous Alimentaire dans la source DB échantillon
    expect(normalizeCategory('alimentaire', ctx.source)).toBe('Alimentaire')
    expect(normalizeSubcategory('Alimentaire', 'bio', ctx.source)).toBe('Bio')
    // 'Chaussures' absente de l'échantillon DB → inconnue → 'Autres' (fail-safe conservé)
    expect(normalizeCategory('Chaussures', ctx.source)).toBe('Autres')
  })

  it('le promptBlock liste les catégories de la source', () => {
    const ctx = buildContext(buildTreeFromRows(SAMPLE_ROWS), 'db')
    expect(ctx.promptBlock).toContain('- Textile : Homme, Femme')
    expect(ctx.promptBlock).toContain('- Alimentaire : Bio')
  })
})
