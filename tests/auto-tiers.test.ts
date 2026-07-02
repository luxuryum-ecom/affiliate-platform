import { describe, it, expect } from 'vitest'
import { generateAutoTiers, buildMirrorTiers } from '@/lib/supplier-pricing'
import { getWholesaleTier } from '@/lib/utils'
import type { WholesaleTier } from '@/types/database'

// ─── generateAutoTiers — génération auto de paliers dégressifs (PUR, sans DB) ─
// RÈGLE MÉTIER (Abdou, ARGENT) — MISE À JOUR 2026-07 :
//   Plancher marge/unité = 8 % du prix de vente UNIQUEMENT (le montant DH fixe
//   « 10 DH » a été RETIRÉ). Calcul interne en CENTIMES ENTIERS, prix rendus au
//   CENTIME (2 décimales). Palier 1 = prix ACTUEL exact. Dernier palier = jusqu'à
//   70 % de la marge redonnée (garde ≥ 30 %), jamais sous le plancher 8 %.
//   4 tranches MOQ/×5/×10/×50, interpolation linéaire des prix.
// Les anciennes assertions bâties sur max(8%, 10 DH) sont CADUQUES : avec 8 %
// seul, un produit dont la marge pleine dépasse 8 % du prix génère désormais
// des paliers même si la marge en DH est < 10 (ex. légume, tomate, sardine,
// article à 1 DH).

describe('generateAutoTiers — cas limites financiers (plancher 8% seul, centimes)', () => {
  it('TOMATE : petits montants, marge > 8% mais < 10 DH → génère 4 paliers (preuve : aucun plancher DH fixe)', () => {
    // cost=4, sell=5 → fullMargin=1 (100c) ; floor=0.08×500c=40c=0.40 DH ; 100>40 → paliers
    // lastMargin=max(40, round(0.3×100)=30)=40 → dernier=4+0.40=4.40
    const tiers = generateAutoTiers(4, 5, 10)
    expect(tiers).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 5 },
      { min_qty: 50, max_qty: 99, price_per_unit: 4.8 },
      { min_qty: 100, max_qty: 499, price_per_unit: 4.6 },
      { min_qty: 500, price_per_unit: 4.4 },
    ])
    // palier 1 = prix de vente EXACT
    expect(tiers[0].price_per_unit).toBe(5)
    // marges (arrondi épsilon) ≥ plancher 0.40 DH, toutes > coût 4
    for (const t of tiers) {
      expect(t.price_per_unit - 4).toBeGreaterThanOrEqual(0.4 - 1e-9)
      expect(t.price_per_unit).toBeGreaterThan(4)
    }
  })

  it('SARDINE : marge > 8% → 4 paliers, prix au centime', () => {
    // cost=6, sell=7 → fullMargin=1 (100c) ; floor=0.08×700c=56c=0.56 DH
    // lastMargin=max(56, round(30))=56 → dernier=6+0.56=6.56
    const tiers = generateAutoTiers(6, 7, 10)
    expect(tiers).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 7 },
      { min_qty: 50, max_qty: 99, price_per_unit: 6.85 },
      { min_qty: 100, max_qty: 499, price_per_unit: 6.71 },
      { min_qty: 500, price_per_unit: 6.56 },
    ])
    for (const t of tiers) {
      expect(t.price_per_unit - 6).toBeGreaterThanOrEqual(0.56 - 1e-9)
      expect(t.price_per_unit).toBeGreaterThan(6)
    }
  })

  it('ARTICLE 1 DH : jamais bloqué par un plancher DH fixe (preuve directe)', () => {
    // cost=1, sell=2 → fullMargin=1 (100c) ; floor=0.08×200c=16c=0.16 DH (bien < 10 DH)
    // lastMargin=max(16, round(30))=30 → dernier=1+0.30=1.30
    const tiers = generateAutoTiers(1, 2, 10)
    expect(tiers).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 2 },
      { min_qty: 50, max_qty: 99, price_per_unit: 1.77 },
      { min_qty: 100, max_qty: 499, price_per_unit: 1.53 },
      { min_qty: 500, price_per_unit: 1.3 },
    ])
    for (const t of tiers) {
      expect(t.price_per_unit - 1).toBeGreaterThanOrEqual(0.16 - 1e-9)
      expect(t.price_per_unit).toBeGreaterThan(1)
    }
    // la marge du dernier palier (0.30 DH) est très inférieure à l'ancien plancher
    // fixe de 10 DH → preuve que ce plancher n'existe plus dans le code.
    expect(tiers[tiers.length - 1].price_per_unit - 1).toBeLessThan(10)
  })

  it('MARGE < 8% du prix → [] (plancher non atteint)', () => {
    // cost=100, sell=105 → fullMargin=5 ; floor=round(0.08×10500c)=840c=8.40 DH ; 5≤8.4 → []
    expect(generateAutoTiers(100, 105, 10)).toEqual([])
  })

  it('MARGE nulle / OFF → []', () => {
    expect(generateAutoTiers(100, 100, 10)).toEqual([])
  })

  it('ÉLECTROMÉNAGER (gros montants) : INCHANGÉ — le plancher 8% dominait déjà l\'ancien plancher 10 DH', () => {
    const tiers = generateAutoTiers(4000, 5000, 5)
    expect(tiers).toEqual([
      { min_qty: 5, max_qty: 24, price_per_unit: 5000 },
      { min_qty: 25, max_qty: 49, price_per_unit: 4800 },
      { min_qty: 50, max_qty: 249, price_per_unit: 4600 },
      { min_qty: 250, price_per_unit: 4400 },
    ])
    expect(tiers[0].price_per_unit).toBe(5000)
    const last = tiers[tiers.length - 1]
    // plancher = 8% × 5000 = 400 (pile, comme avant : ce cas ne bouge pas)
    const floor = Math.round(0.08 * 5000)
    expect(floor).toBe(400)
    expect(last.price_per_unit - 4000).toBe(400)
    for (const t of tiers) expect(t.price_per_unit - 4000).toBeGreaterThanOrEqual(floor)
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].price_per_unit).toBeLessThan(tiers[i - 1].price_per_unit)
    }
    expect(tiers[0].max_qty).toBe(24)
    expect(tiers[1].max_qty).toBe(49)
    expect(tiers[2].max_qty).toBe(249)
    expect(tiers[3].max_qty).toBeUndefined()
  })

  it('coût fractionnaire : calcul en centimes entiers, marge ≥ plancher, jamais sous le coût', () => {
    // cost=4.5, sell=6 → fullMargin=1.5 (150c) ; floor=round(0.08×600c)=48c=0.48 DH
    // lastMargin=max(48, round(0.3×150)=45)=48 → dernier=4.5+0.48=4.98
    const tiers = generateAutoTiers(4.5, 6, 10)
    expect(tiers[0].price_per_unit).toBe(6)
    const last = tiers[tiers.length - 1]
    expect(last.price_per_unit).toBe(4.98)
    for (const t of tiers) {
      expect(Number.isInteger(Math.round(t.price_per_unit * 100))).toBe(true) // au centime
      expect(t.price_per_unit - 4.5).toBeGreaterThanOrEqual(0.48 - 1e-9)
      expect(t.price_per_unit).toBeGreaterThan(4.5)
    }
  })

  it('LÉGUME (ex-caduc) : marge pleine 20% > plancher 8% → génère désormais des paliers (avant : []) ', () => {
    // cost=8, sell=10 → fullMargin=2 (200c) ; floor=round(0.08×1000c)=80c=0.80 DH ; 200>80 → paliers
    // AVANT (plancher max(8%,10 DH)) : floor=10 DH ⇒ marge 2 ≤ 10 ⇒ []. Ce comportement est CADUC.
    const tiers = generateAutoTiers(8, 10, 10)
    expect(tiers).toHaveLength(4)
    expect(tiers[0].price_per_unit).toBe(10)
    const last = tiers[tiers.length - 1]
    // lastMargin=max(80, round(0.3×200)=60)=80 → dernier=8+0.80=8.80
    expect(last.price_per_unit).toBe(8.8)
    for (const t of tiers) expect(t.price_per_unit).toBeGreaterThan(8)
  })

  describe('invariants génériques (plusieurs profils, y compris petits produits)', () => {
    const cases: [number, number, number][] = [
      [4000, 5000, 5], // électroménager
      [100, 200, 10], // moyen
      [4.5, 6, 10], // coût fractionnaire
      [4, 5, 10], // tomate (petit produit)
      [6, 7, 10], // sardine (petit produit)
      [1, 2, 10], // article 1 DH (petit produit)
      [8, 10, 10], // légume (ex-caduc, génère maintenant)
      [1, 20, 1], // moq minimal
      [50, 1000, 100], // grosse marge, gros moq
    ]

    for (const [cost, sell, moq] of cases) {
      it(`cost=${cost} sell=${sell} moq=${moq} → invariants respectés`, () => {
        const tiers = generateAutoTiers(cost, sell, moq)
        if (tiers.length === 0) return // marge insuffisante (≤ 8% du prix), rien à vérifier de plus

        const sellC = Math.round(sell * 100)
        const floorC = Math.round(0.08 * sellC) // plancher = 8% du prix SEUL, aucun montant DH fixe

        // (a) palier 1 == prix de vente EXACT
        expect(tiers[0].price_per_unit).toBe(sell)

        // (b) chaque marge ≥ plancher 8% (tolérance flottante)
        for (const t of tiers) {
          const marginC = Math.round(t.price_per_unit * 100) - Math.round(cost * 100)
          expect(marginC).toBeGreaterThanOrEqual(floorC - 1) // ±1 centime d'arrondi toléré
        }

        // (c) MUR ABSOLU : chaque palier STRICTEMENT au-dessus du coût (plancher 8% > 0)
        for (const t of tiers) {
          expect(t.price_per_unit).toBeGreaterThan(cost)
        }

        // (d) prix non-croissants
        for (let i = 1; i < tiers.length; i++) {
          expect(tiers[i].price_per_unit).toBeLessThanOrEqual(tiers[i - 1].price_per_unit)
        }

        // (e) max_qty bornés sauf le dernier ; = next.min_qty - 1
        for (let i = 0; i < tiers.length - 1; i++) {
          expect(tiers[i].max_qty).toBe(tiers[i + 1].min_qty - 1)
        }
        expect(tiers[tiers.length - 1].max_qty).toBeUndefined()

        // (f) 4 paliers
        expect(tiers).toHaveLength(4)

        // (g) quantités ancrées MOQ/×5/×10/×50
        const minQty = Number.isInteger(moq) && moq >= 1 ? moq : 1
        expect(tiers.map((t) => t.min_qty)).toEqual([minQty, minQty * 5, minQty * 10, minQty * 50])

        // (h) prix au centime (2 décimales max), quantités entières
        for (const t of tiers) {
          expect(Number.isInteger(Math.round(t.price_per_unit * 100))).toBe(true)
          expect(Number.isInteger(t.min_qty)).toBe(true)
          if (t.max_qty !== undefined) expect(Number.isInteger(t.max_qty)).toBe(true)
        }
      })
    }

    it('AUCUN plancher 10 DH résiduel : au moins un cas génère une marge dernier-palier < 10 DH', () => {
      const tomate = generateAutoTiers(4, 5, 10)
      const last = tomate[tomate.length - 1]
      expect(last.price_per_unit - 4).toBeLessThan(10) // 0.40 DH, très inférieur à 10 DH
      expect(tomate.length).toBe(4) // preuve que ce n'est PAS bloqué par un plancher DH
    })
  })

  it('MOQ divers : moq=1 → quantités 1/5/10/50', () => {
    const tiers = generateAutoTiers(10, 100, 1)
    expect(tiers.map((t) => t.min_qty)).toEqual([1, 5, 10, 50])
  })

  it('MOQ divers : moq=100 → quantités 100/500/1000/5000', () => {
    const tiers = generateAutoTiers(10, 100, 100)
    expect(tiers.map((t) => t.min_qty)).toEqual([100, 500, 1000, 5000])
  })

  it('entrées invalides / dégénérées → []', () => {
    expect(generateAutoTiers(null, 100, 10)).toEqual([])
    expect(generateAutoTiers(100, null, 10)).toEqual([])
    expect(generateAutoTiers(NaN, 100, 10)).toEqual([])
    expect(generateAutoTiers(100, NaN, 10)).toEqual([])
    expect(generateAutoTiers(100, 0, 10)).toEqual([])
    expect(generateAutoTiers(100, -50, 10)).toEqual([])
    expect(generateAutoTiers(-10, 100, 10)).toEqual([]) // cost négatif < 0 → []
    expect(generateAutoTiers(200, 100, 10)).toEqual([]) // cost > sell → marge négative → []
  })
})

// ─── NON-RÉGRESSION ────────────────────────────────────────────────────────
// Prouve que le changement de plancher (8% seul, centimes) ne modifie AUCUNE
// autre fonction du module : buildMirrorTiers (paliers SOURCE fournisseur,
// Pull ref 5) reste strictement inchangé, et getWholesaleTier facture bien
// les paliers auto générés — y compris pour les petits produits (tomate) où
// les prix sont désormais au centime.

describe('Non-régression — buildMirrorTiers intact (produit AVEC paliers source)', () => {
  it('Pull ref 5 : paliers source USD → MAD, marge %20 — valeurs STRICTEMENT inchangées', () => {
    const r = buildMirrorTiers(
      [
        { min_quantity: 10, unit_price_usd: 20 },
        { min_quantity: 50, unit_price_usd: 18 },
        { min_quantity: 100, unit_price_usd: 16 },
      ],
      10,
      true,
      'percentage',
      20,
    )
    expect(r).toEqual([
      { min_qty: 10, max_qty: 49, price_per_unit: 240 }, // 20×10=200 +20% = 240
      { min_qty: 50, max_qty: 99, price_per_unit: 216 }, // 18×10=180 +20% = 216
      { min_qty: 100, price_per_unit: 192 }, // 16×10=160 +20% = 192, dernier ouvert
    ])
  })

  it('generateAutoTiers ne partage aucun état / ne modifie aucune autre fonction du module', () => {
    const before = buildMirrorTiers(
      [{ min_quantity: 1, unit_price_usd: 10 }],
      10,
      true,
      'percentage',
      25,
    )
    generateAutoTiers(4000, 5000, 5)
    generateAutoTiers(4, 5, 10) // petit produit, centimes
    generateAutoTiers(100, 105, 10) // cas []
    generateAutoTiers(null, null, 10)
    const after = buildMirrorTiers(
      [{ min_quantity: 1, unit_price_usd: 10 }],
      10,
      true,
      'percentage',
      25,
    )
    expect(after).toEqual(before)
    expect(after).toEqual([{ min_qty: 1, price_per_unit: 125 }])
  })
})

describe('Non-régression — getWholesaleTier facture correctement les paliers auto générés', () => {
  it('ÉLECTRO : bug max_qty non-borné NE se reproduit PAS sur les paliers auto', () => {
    const tiers: WholesaleTier[] = generateAutoTiers(4000, 5000, 5)

    expect(getWholesaleTier(tiers, 5)?.price_per_unit).toBe(5000)
    // Quantité intermédiaire (30) → DOIT tomber dans le 2e palier (25-49 → 4800), PAS le 1er.
    expect(getWholesaleTier(tiers, 30)?.price_per_unit).toBe(4800)
    // Grosse quantité (300) → dernier palier ouvert (250+, 4400)
    expect(getWholesaleTier(tiers, 300)?.price_per_unit).toBe(4400)

    expect(getWholesaleTier(tiers, 24)?.price_per_unit).toBe(5000)
    expect(getWholesaleTier(tiers, 25)?.price_per_unit).toBe(4800)
    expect(getWholesaleTier(tiers, 49)?.price_per_unit).toBe(4800)
    expect(getWholesaleTier(tiers, 50)?.price_per_unit).toBe(4600)
    expect(getWholesaleTier(tiers, 249)?.price_per_unit).toBe(4600)
    expect(getWholesaleTier(tiers, 250)?.price_per_unit).toBe(4400)
  })

  it('TOMATE (petit produit, prix au centime) : facturation par palier correcte', () => {
    const tiers: WholesaleTier[] = generateAutoTiers(4, 5, 10)

    expect(getWholesaleTier(tiers, 10)?.price_per_unit).toBe(5)
    expect(getWholesaleTier(tiers, 60)?.price_per_unit).toBe(4.8)
    expect(getWholesaleTier(tiers, 600)?.price_per_unit).toBe(4.4)
  })

  it('quantité sous le MOQ → aucun palier ne matche (null)', () => {
    const tiers: WholesaleTier[] = generateAutoTiers(4000, 5000, 5)
    expect(getWholesaleTier(tiers, 4)).toBeNull()
  })
})
