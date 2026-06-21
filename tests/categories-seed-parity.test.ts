import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CATEGORY_TAXONOMY,
  PRODUCT_CATEGORIES,
  isAffiliateAllowedCategory,
  isValidCategory,
} from '@/lib/taxonomy'

// ─────────────────────────────────────────────────────────────────────────────
// TEST DE PARITÉ — seed SQL (migration 081) ↔ src/lib/taxonomy.ts
//
// Condition @finance/@security : le seed de la table `categories` doit être une
// copie OCTET-POUR-OCTET de la taxonomie codée — noms canoniques (12 parents,
// 48 sous-catégories) ET flag D2 `affiliate_allowed` (9 parents à true). Toute
// divergence d'un caractère casse ce test → casse le build → empêche le commit.
// C'est le filet anti-régression de la décision de canal D2 quand la source
// deviendra dynamique (sous-lots 2/3).
// ─────────────────────────────────────────────────────────────────────────────

const SQL = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/081_categories_table.sql'),
  'utf8',
)

/** Extrait le bloc entre deux marqueurs SQL `-- MARK-START` / `-- MARK-END`. */
function block(start: string, end: string): string {
  const s = SQL.indexOf(start)
  const e = SQL.indexOf(end)
  expect(s, `marqueur ${start} présent`).toBeGreaterThan(-1)
  expect(e, `marqueur ${end} présent`).toBeGreaterThan(s)
  return SQL.slice(s + start.length, e)
}

// ── Parse des PARENTS : (slug, label_fr, label_ar, label_en, icon, image, affiliate_allowed, sort)
const parentBlock = block('-- SEED-PARENTS-START', '-- SEED-PARENTS-END')
const parentRowRe =
  /\(\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*(true|false),\s*\d+\)/g
const seededParents = new Map<string, boolean>()
for (const m of parentBlock.matchAll(parentRowRe)) {
  seededParents.set(m[1], m[2] === 'true')
}

// ── Parse des SOUS-CATÉGORIES : (parent_slug, slug, ...)
const subBlock = block('-- SEED-SUBS-START', '-- SEED-SUBS-END')
const subRowRe = /\(\s*'([^']+)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*\d+\)/g
const seededSubs = new Map<string, string[]>()
for (const m of subBlock.matchAll(subRowRe)) {
  const arr = seededSubs.get(m[1]) ?? []
  arr.push(m[2])
  seededSubs.set(m[1], arr)
}

describe('seed catégories 081 ↔ taxonomy.ts — parité', () => {
  it('parse correctement le seed (12 parents, 48 sous-catégories)', () => {
    expect(seededParents.size).toBe(12)
    const totalSubs = [...seededSubs.values()].reduce((n, a) => n + a.length, 0)
    expect(totalSubs).toBe(48)
  })

  it('les 12 catégories parentes correspondent EXACTEMENT à PRODUCT_CATEGORIES', () => {
    // même ensemble (anti-POST `isValidCategory` couvre les 12, pas seulement les 9 affiliées)
    expect([...seededParents.keys()].sort()).toEqual([...PRODUCT_CATEGORIES].sort())
    for (const cat of seededParents.keys()) {
      expect(isValidCategory(cat), `${cat} valide dans taxonomy.ts`).toBe(true)
    }
  })

  it('le flag affiliate_allowed correspond EXACTEMENT à isAffiliateAllowedCategory (9 affiliées)', () => {
    for (const [cat, allowed] of seededParents) {
      expect(allowed, `affiliate_allowed[${cat}]`).toBe(isAffiliateAllowedCategory(cat))
    }
    const affiliatedCount = [...seededParents.values()].filter(Boolean).length
    expect(affiliatedCount).toBe(9)
  })

  it('les sous-catégories de chaque parent correspondent EXACTEMENT (ordre + contenu)', () => {
    for (const parent of PRODUCT_CATEGORIES) {
      const expected = [...CATEGORY_TAXONOMY[parent]]
      const seeded = seededSubs.get(parent) ?? []
      expect(seeded, `sous-catégories de ${parent}`).toEqual(expected)
    }
  })

  it('aucun parent seedé hors taxonomie ni sous-catégorie orpheline', () => {
    for (const parent of seededSubs.keys()) {
      expect(isValidCategory(parent), `parent ${parent} de sous-cat connu`).toBe(true)
    }
  })
})
