import { describe, it, expect } from 'vitest'
import { getChannelDecision, type CategoryRow } from '@/lib/categories/read'
import {
  PRODUCT_CATEGORIES,
  isValidCategory,
  isAffiliateAllowedCategory,
} from '@/lib/taxonomy'

// ─────────────────────────────────────────────────────────────────────────────
// SOUS-LOT 3 — PREUVE DE NON-RÉGRESSION DU CANAL D2 (financier, ROUGE).
//
// Avant : products.ts décidait le canal via taxonomy.ts (isValidCategory +
// isAffiliateAllowedCategory). Après : via getChannelDecision (lecture base).
// Ce test prouve, CATÉGORIE PAR CATÉGORIE, que la décision est STRICTEMENT
// IDENTIQUE pour les 12 catégories — personne ne change de canal.
//
// La catégorie est LE déterminant de canal de TOUS les produits qui la portent
// (products.category) : parité par catégorie = parité par produit.
// ─────────────────────────────────────────────────────────────────────────────

// Lignes DB = miroir EXACT du seed (mig 081), reconstruit depuis taxonomy.ts.
// Le sous-lot 1 a déjà prouvé (octet pour octet) que le seed SQL == taxonomy.ts ;
// ici on prouve que la LOGIQUE de bascule rend la même décision que taxonomy.ts.
const SEED_ROWS: CategoryRow[] = PRODUCT_CATEGORIES.map((slug, i) => ({
  id: `cat-${i}`,
  slug,
  parent_id: null,
  affiliate_allowed: isAffiliateAllowedCategory(slug),
  active: true,
  sort_order: i + 1,
}))

describe('D2 — parité canal AVANT (taxonomy.ts) ↔ APRÈS (base) — par catégorie', () => {
  it('les 12 catégories ont un canal STRICTEMENT identique avant/après', async () => {
    const channel = await getChannelDecision(async () => SEED_ROWS)
    expect(channel.origin).toBe('db')
    for (const cat of PRODUCT_CATEGORIES) {
      // octet pour octet : même validité + même autorisation affilié
      expect(channel.isValidCategory(cat), `validité ${cat}`).toBe(isValidCategory(cat))
      expect(channel.isAffiliateAllowed(cat), `canal affilié ${cat}`).toBe(
        isAffiliateAllowedCategory(cat),
      )
    }
  })

  it('les 9 catégories affiliées RESTENT affiliées', async () => {
    const channel = await getChannelDecision(async () => SEED_ROWS)
    const affiliated = PRODUCT_CATEGORIES.filter((c) => channel.isAffiliateAllowed(c))
    expect(affiliated.sort()).toEqual(
      [
        'Accessoires & maroquinerie',
        'Artisanat',
        'Chaussures',
        'Cosmétique & hygiène',
        'Maison & packaging',
        'Sport & Fitness',
        'Textile',
        'Jouets & enfants',
        'Électronique & gadgets',
      ].sort(),
    )
    expect(affiliated.length).toBe(9)
  })

  it('Alimentaire ET Matières premières RESTENT grossiste-seul (jamais affilié)', async () => {
    const channel = await getChannelDecision(async () => SEED_ROWS)
    expect(channel.isAffiliateAllowed('Alimentaire')).toBe(false)
    expect(channel.isAffiliateAllowed('Matières premières')).toBe(false)
    expect(channel.isAffiliateAllowed('Autres')).toBe(false)
    // mais elles restent des catégories VALIDES (création grossiste possible)
    expect(channel.isValidCategory('Alimentaire')).toBe(true)
    expect(channel.isValidCategory('Matières premières')).toBe(true)
  })
})

describe('D2 — fail-closed (condition @finance/@security)', () => {
  it('base DOWN (fetcher lève) → fallback taxonomy.ts, canaux identiques', async () => {
    const channel = await getChannelDecision(async () => {
      throw new Error('DB down')
    })
    expect(channel.origin).toBe('fallback')
    for (const cat of PRODUCT_CATEGORIES) {
      expect(channel.isAffiliateAllowed(cat)).toBe(isAffiliateAllowedCategory(cat))
      expect(channel.isValidCategory(cat)).toBe(isValidCategory(cat))
    }
  })

  it('base VIDE → fallback (grossiste pour tout sauf les 9 figées)', async () => {
    const channel = await getChannelDecision(async () => [])
    expect(channel.origin).toBe('fallback')
    expect(channel.isAffiliateAllowed('Alimentaire')).toBe(false)
    expect(channel.isAffiliateAllowed('Textile')).toBe(true) // figée dans le fallback
  })

  it('catégorie INCONNUE → grossiste (jamais affilié) + invalide (anti-POST)', async () => {
    const channel = await getChannelDecision(async () => SEED_ROWS)
    expect(channel.isAffiliateAllowed('Voitures')).toBe(false)
    expect(channel.isValidCategory('Voitures')).toBe(false)
    expect(channel.isAffiliateAllowed(null)).toBe(false)
    expect(channel.isAffiliateAllowed('')).toBe(false)
  })

  it('catégorie DÉSACTIVÉE en base → invalide + grossiste (active filtré)', async () => {
    const rows: CategoryRow[] = SEED_ROWS.map((r) =>
      r.slug === 'Textile' ? { ...r, active: false } : r,
    )
    const channel = await getChannelDecision(async () => rows)
    // Textile désactivée → plus valide, plus affiliée (mais les autres intactes)
    expect(channel.isValidCategory('Textile')).toBe(false)
    expect(channel.isAffiliateAllowed('Textile')).toBe(false)
    expect(channel.isAffiliateAllowed('Chaussures')).toBe(true)
  })

  it('affiliate_allowed NON-true en base (ex. null) → grossiste (décision positive)', async () => {
    // Valeur DB corrompue simulée (null là où la colonne est boolean) : la décision
    // positive (=== true) doit la traiter comme NON autorisée, jamais ouvrir le canal.
    const corrupted = null as unknown as boolean
    const rows: CategoryRow[] = SEED_ROWS.map((r) =>
      r.slug === 'Textile' ? { ...r, affiliate_allowed: corrupted } : r,
    )
    const channel = await getChannelDecision(async () => rows)
    expect(channel.isAffiliateAllowed('Textile')).toBe(false)
  })
})
