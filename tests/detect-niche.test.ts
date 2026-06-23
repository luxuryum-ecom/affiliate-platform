import { describe, it, expect } from 'vitest'
import { scoreNiche, NICHE_WEIGHTS, type NicheSignal } from '@/lib/wholesale/detect-niche'

// ─── Détecteur de niche grossiste (LOT vitrine intelligente) ──────────────────
// scoreNiche = logique PURE de pondération des signaux comportement → catégorie
// dominante. Affichage uniquement : aucune valeur financière n'intervient.

describe('scoreNiche — cold start', () => {
  it('aucun signal → topNiche null', () => {
    expect(scoreNiche([])).toEqual({ topNiche: null, scores: {} })
  })

  it('uniquement des catégories vides → topNiche null (tolérance produits non catégorisés)', () => {
    const signals: NicheSignal[] = [
      { category: '', weight: NICHE_WEIGHTS.order },
      { category: '   ', weight: NICHE_WEIGHTS.cart },
    ]
    expect(scoreNiche(signals)).toEqual({ topNiche: null, scores: {} })
  })
})

describe('scoreNiche — pondération', () => {
  it('un achat (×3) bat un panier (×2) de catégorie différente', () => {
    const r = scoreNiche([
      { category: 'Textile', weight: NICHE_WEIGHTS.order },
      { category: 'Alimentaire', weight: NICHE_WEIGHTS.cart },
    ])
    expect(r.topNiche).toBe('Textile')
    expect(r.scores).toEqual({ Textile: 3, Alimentaire: 2 })
  })

  it('cumule les poids d’une même catégorie sur plusieurs signaux', () => {
    const r = scoreNiche([
      { category: 'Cosmétique', weight: NICHE_WEIGHTS.cart }, // 2
      { category: 'Cosmétique', weight: NICHE_WEIGHTS.quote }, // 2
      { category: 'Cosmétique', weight: NICHE_WEIGHTS.sample }, // 1
      { category: 'Textile', weight: NICHE_WEIGHTS.order }, // 3
    ])
    // Cosmétique 5 > Textile 3
    expect(r.topNiche).toBe('Cosmétique')
    expect(r.scores.Cosmétique).toBe(5)
    expect(r.scores.Textile).toBe(3)
  })

  it('plusieurs achats dominent un seul devis fournisseur', () => {
    const r = scoreNiche([
      { category: 'Chaussures', weight: NICHE_WEIGHTS.order },
      { category: 'Chaussures', weight: NICHE_WEIGHTS.order },
      { category: 'Électronique & gadgets', weight: NICHE_WEIGHTS.supplierQuote },
    ])
    expect(r.topNiche).toBe('Chaussures') // 6 > 2
  })

  it('ignore les catégories vides mais garde les autres', () => {
    const r = scoreNiche([
      { category: '', weight: NICHE_WEIGHTS.order },
      { category: 'Maison & packaging', weight: NICHE_WEIGHTS.quote },
    ])
    expect(r.topNiche).toBe('Maison & packaging')
    expect(r.scores).toEqual({ 'Maison & packaging': 2 })
  })

  it('trim les libellés de catégorie', () => {
    const r = scoreNiche([
      { category: '  Textile  ', weight: NICHE_WEIGHTS.order },
      { category: 'Textile', weight: NICHE_WEIGHTS.cart },
    ])
    expect(r.topNiche).toBe('Textile')
    expect(r.scores).toEqual({ Textile: 5 })
  })
})

describe('scoreNiche — départage déterministe', () => {
  it('à score égal, ordre alphabétique stable', () => {
    const r = scoreNiche([
      { category: 'Textile', weight: NICHE_WEIGHTS.order },
      { category: 'Artisanat', weight: NICHE_WEIGHTS.order },
    ])
    // égalité 3/3 → 'Artisanat' avant 'Textile'
    expect(r.topNiche).toBe('Artisanat')
  })

  it('résultat indépendant de l’ordre d’entrée des signaux', () => {
    const a = scoreNiche([
      { category: 'Sport & Fitness', weight: NICHE_WEIGHTS.cart },
      { category: 'Jouets & enfants', weight: NICHE_WEIGHTS.order },
    ])
    const b = scoreNiche([
      { category: 'Jouets & enfants', weight: NICHE_WEIGHTS.order },
      { category: 'Sport & Fitness', weight: NICHE_WEIGHTS.cart },
    ])
    expect(a).toEqual(b)
    expect(a.topNiche).toBe('Jouets & enfants')
  })
})

describe('NICHE_WEIGHTS — ordre de force des signaux', () => {
  it('achat > panier/devis ≥ échantillon', () => {
    expect(NICHE_WEIGHTS.order).toBeGreaterThan(NICHE_WEIGHTS.cart)
    expect(NICHE_WEIGHTS.cart).toBeGreaterThanOrEqual(NICHE_WEIGHTS.sample)
    expect(NICHE_WEIGHTS.quote).toBeGreaterThan(NICHE_WEIGHTS.sample)
    expect(NICHE_WEIGHTS.supplierQuote).toBeGreaterThan(NICHE_WEIGHTS.sample)
  })
})
