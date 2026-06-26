// V5-bis.2 — Fraîcheur du stock fournisseur (helper PUR, testable, zéro I/O).
//
// Le stock fournisseur est un snapshot DÉCLARÉ (jamais décrémenté). Sa fiabilité
// dépend de son âge : plus la dernière déclaration est ancienne, plus il faut
// inviter le grossiste à « confirmer » avant de s'engager. On NE bloque JAMAIS
// une commande (Option A figée) — c'est un signal d'affichage, jamais une règle.
//
// Décisions figées (Option B disciplinée, Abdou) : fraîcheur au niveau PRODUIT,
// dérivée de `supplier_products.stock_quantity_updated_at`. Aucun montant touché.
//
// 3 PALIERS (tranchés Abdou C2, 2026-06-25) :
//   • frais        : < 3 jours    → PAS de badge.
//   • à surveiller : 3 à 14 jours → badge GRIS « Mis à jour il y a X jours ».
//   • à confirmer  : > 14 jours OU date inconnue → badge ORANGE « À confirmer ».
// Seuils exportés en constantes (ajustables sans changer la logique).

/** Stock déclaré il y a ≤ 3 jours = frais (aucun badge). */
export const STOCK_FRESH_MAX_HOURS = 72
/** Stock déclaré il y a > 14 jours = à confirmer (badge orange). */
export const STOCK_EXPIRED_MIN_HOURS = 336

export type StockFreshness = 'fresh' | 'watch' | 'expired' | 'unknown'

/**
 * Classe la fraîcheur d'un stock fournisseur d'après l'horodatage dédié.
 * - `unknown` : pas d'horodatage exploitable (jamais déclaré / date invalide).
 * - `fresh`   : âge ≤ STOCK_FRESH_MAX_HOURS (< 3 j).
 * - `watch`   : entre frais et périmé (3 à 14 j) → « à surveiller ».
 * - `expired` : âge > STOCK_EXPIRED_MIN_HOURS (> 14 j) → « à confirmer ».
 * `now` est injecté pour la testabilité (aucune dépendance à l'horloge en test).
 */
export function computeStockFreshness(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): StockFreshness {
  if (!updatedAt) return 'unknown'
  const ts = Date.parse(updatedAt)
  if (Number.isNaN(ts)) return 'unknown'

  const ageHours = (now.getTime() - ts) / 3_600_000
  // Horodatage dans le futur (horloge décalée) → on ne pénalise pas : frais.
  if (ageHours <= STOCK_FRESH_MAX_HOURS) return 'fresh'
  if (ageHours > STOCK_EXPIRED_MIN_HOURS) return 'expired'
  return 'watch'
}

/**
 * Âge du stock en jours ENTIERS (pour le libellé « Mis à jour il y a X jours »).
 * `null` si pas d'horodatage exploitable. Jamais négatif (horloge décalée → 0).
 */
export function stockAgeDays(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!updatedAt) return null
  const ts = Date.parse(updatedAt)
  if (Number.isNaN(ts)) return null
  const ageHours = (now.getTime() - ts) / 3_600_000
  if (ageHours < 0) return 0
  return Math.floor(ageHours / 24)
}

/**
 * Palier « à confirmer » (badge orange) : stock périmé (> 14 j) OU date inconnue.
 * Fail-safe : en cas d'incertitude (date absente/invalide) on invite à confirmer,
 * jamais l'inverse. Ne bloque JAMAIS une commande.
 */
export function stockNeedsConfirmation(freshness: StockFreshness): boolean {
  return freshness === 'expired' || freshness === 'unknown'
}

/** Palier « à surveiller » (badge gris « Mis à jour il y a X jours »). */
export function stockNeedsWatch(freshness: StockFreshness): boolean {
  return freshness === 'watch'
}
