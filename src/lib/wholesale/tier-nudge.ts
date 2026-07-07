// ─── Nudge de palier (AM-2) — logique PURE extraite pour test ────────────────
//
// « Ajoute X unités → tu économises Z DH par unité au palier suivant. »
//
// Cette logique vivait inline dans `add-to-cart-form.tsx` (Client Component).
// Elle est extraite ICI SANS AUCUN CHANGEMENT DE COMPORTEMENT afin de la
// protéger par des tests unitaires (le composant l'importe et l'appelle au
// rendu — elle ne renvoie que des valeurs sérialisables, jamais une fonction,
// donc conforme à la règle projet sur les Client Components).
//
// 🔒 Ne modifie PAS la forme des paliers ni le seuil d'affichage : le nudge
// s'affiche si et seulement si `nextTierReachable && savingsPerUnit > 0`
// (inchangé). Le prix unitaire courant (`unitPrice`) est calculé par l'appelant
// (palier actif ou prix de base).

import type { WholesaleTier } from '@/types/database'

export interface TierNudge {
  /** Prochain palier strictement au-dessus de la quantité courante, ou null. */
  nextTier: WholesaleTier | null
  /** Vrai si le prochain palier existe ET est atteignable dans le stock dispo. */
  nextTierReachable: boolean
  /** Unités à ajouter pour atteindre le prochain palier (0 si aucun). */
  unitsToNextTier: number
  /** Économie par unité au prochain palier vs prix courant (0 si aucun). */
  savingsPerUnit: number
}

/**
 * Calcule le nudge de palier pour une quantité donnée.
 *
 * @param tiers       Paliers du produit (min_qty / price_per_unit).
 * @param qty         Quantité actuellement sélectionnée.
 * @param unitPrice   Prix unitaire courant (palier actif OU prix de base).
 * @param stockCount  Stock disponible (borne l'atteignabilité du palier).
 */
export function computeTierNudge(
  tiers: WholesaleTier[],
  qty: number,
  unitPrice: number,
  stockCount: number,
): TierNudge {
  const nextTier =
    tiers
      .filter((tier) => tier.min_qty > qty)
      .sort((a, b) => a.min_qty - b.min_qty)[0] ?? null

  const nextTierReachable = nextTier != null && nextTier.min_qty <= stockCount
  const unitsToNextTier = nextTier ? nextTier.min_qty - qty : 0
  const savingsPerUnit = nextTier ? unitPrice - nextTier.price_per_unit : 0

  return { nextTier, nextTierReachable, unitsToNextTier, savingsPerUnit }
}

/** Le nudge doit-il s'afficher ? (seuil inchangé vs l'original). */
export function shouldShowNudge(nudge: TierNudge): boolean {
  return nudge.nextTierReachable && nudge.savingsPerUnit > 0
}
