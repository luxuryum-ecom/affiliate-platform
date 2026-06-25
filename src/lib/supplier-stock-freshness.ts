// V5-bis.2 — Fraîcheur du stock fournisseur (helper PUR, testable, zéro I/O).
//
// Le stock fournisseur est un snapshot DÉCLARÉ (jamais décrémenté). Sa fiabilité
// dépend de son âge : plus la dernière déclaration est ancienne, plus il faut
// inviter le grossiste à « confirmer » avant de s'engager. On NE bloque JAMAIS
// une commande (Option A figée) — c'est un signal d'affichage, jamais une règle.
//
// Décisions figées (Option B disciplinée, Abdou) : fraîcheur au niveau PRODUIT,
// dérivée de `supplier_products.stock_quantity_updated_at`. Aucun montant touché.
// Seuils PROVISOIRES (ambiguïté C2, à affiner selon le rythme réel d'envoi des
// fournisseurs) — exportés en constantes pour être ajustables sans changer la logique.

/** Stock déclaré il y a ≤ 72h = considéré frais. */
export const STOCK_FRESH_MAX_HOURS = 72
/** Stock déclaré il y a > 7 jours = considéré périmé. */
export const STOCK_EXPIRED_MIN_HOURS = 168

export type StockFreshness = 'fresh' | 'stale' | 'expired' | 'unknown'

/**
 * Classe la fraîcheur d'un stock fournisseur d'après l'horodatage dédié.
 * - `unknown` : pas d'horodatage exploitable (jamais déclaré / date invalide).
 * - `fresh`   : âge ≤ STOCK_FRESH_MAX_HOURS.
 * - `stale`   : entre frais et périmé (tiède).
 * - `expired` : âge > STOCK_EXPIRED_MIN_HOURS.
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
  return 'stale'
}

/**
 * Faut-il afficher le signal « à confirmer » ? Vrai dès que le stock n'est PAS
 * frais (tiède, périmé, ou jamais déclaré). Ne bloque jamais une commande.
 */
export function stockNeedsConfirmation(freshness: StockFreshness): boolean {
  return freshness !== 'fresh'
}
