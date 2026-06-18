// ─── Hook « économie totale en achetant gros » (AFFICHAGE PUR) ───────────────
// Calcule, À PARTIR DES `wholesale_tiers` DÉJÀ STOCKÉS, l'économie TOTALE (montant
// global, pas par pièce) de chaque palier vs le prix du plus petit palier :
//   économie_totale(palier) = (prix_petit_palier − prix_palier) × quantité_du_palier
// AUCUN recalcul de prix serveur, aucune donnée sensible — pure lecture/présentation.
// Garde-fou : < 2 paliers exploitables → null (n'affiche rien).

import type { WholesaleTier } from '@/types/database'

export interface TierSaving {
  /** Quantité du palier (= seuil min_qty). */
  minQty: number
  /** Prix unitaire à ce palier. */
  pricePerUnit: number
  /** Économie TOTALE vs le plus petit palier, pour un lot de `minQty` pièces. */
  totalSaving: number
}

export interface WholesaleSavings {
  /** Prix unitaire du plus petit palier (référence). */
  basePrice: number
  /** Paliers avec une économie strictement positive. */
  tiers: TierSaving[]
  /** Plus gros montant d'économie (pour l'accroche). */
  maxSaving: number
  /** Quantité associée au plus gros montant. */
  maxSavingQty: number
}

/**
 * Construit les économies totales par palier. PUR (aucune I/O) → testable.
 * - Ignore les paliers non finis / ≤ 0 (robustesse contre des données héritées).
 * - Trie par quantité croissante ; le plus petit palier (qty min) sert de référence.
 * - Ne garde que les paliers dont l'économie est > 0.
 * - Retourne null si < 2 paliers exploitables ou aucune économie positive.
 */
export function computeWholesaleSavings(
  tiers: WholesaleTier[] | null | undefined,
): WholesaleSavings | null {
  if (!tiers || tiers.length < 2) return null

  const sorted = tiers
    .filter(
      (t) =>
        Number.isFinite(t.min_qty) &&
        t.min_qty > 0 &&
        Number.isFinite(t.price_per_unit) &&
        t.price_per_unit > 0,
    )
    .sort((a, b) => a.min_qty - b.min_qty)

  if (sorted.length < 2) return null

  const basePrice = sorted[0].price_per_unit
  const savings: TierSaving[] = []
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i]
    // Centièmes entiers pour absorber l'imprécision flottante, puis arrondi MAD.
    const totalSaving = Math.round((basePrice - t.price_per_unit) * t.min_qty)
    if (totalSaving > 0) {
      savings.push({ minQty: t.min_qty, pricePerUnit: t.price_per_unit, totalSaving })
    }
  }
  if (savings.length === 0) return null

  const top = savings.reduce((m, s) => (s.totalSaving > m.totalSaving ? s : m), savings[0])
  return { basePrice, tiers: savings, maxSaving: top.totalSaving, maxSavingQty: top.minQty }
}

/**
 * Groupage des milliers par ESPACE, en chiffres LATINS, déterministe (indépendant
 * de l'ICU/locale, qui peut produire un point ambigu « 3.000 »). Ex. 3000 → « 3 000 ».
 * RTL : les chiffres latins restent en numéraux 1234567890 (règle i18n du projet).
 */
function groupLatin(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Entier en chiffres latins + suffixe MAD. Ex. 3000 → « 3 000 MAD ». */
export function formatSavingMad(n: number): string {
  return `${groupLatin(n)} MAD`
}

/** Quantité en chiffres latins. Ex. 500 → « 500 », 1000 → « 1 000 ». */
export function formatSavingQty(n: number): string {
  return groupLatin(n)
}
