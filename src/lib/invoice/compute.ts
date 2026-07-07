// ─── Calcul de facture — module PUR, testable, revu @finance ─────────────────
//
// RÈGLE ARGENT GRAVÉE (condition @finance du LOT V3) :
//   Le TOTAL TTC de la facture est TOUJOURS **strictement égal** au montant
//   réellement facturé de la commande (`wholesale_orders.total_amount`). On ne
//   ré-additionne PAS les lignes pour former le total (l'arrondi pourrait
//   dériver) : le total est la source de vérité, et l'on en DÉRIVE le HT / la
//   TVA. Ainsi « total affiché = total facturé » est un invariant, quel que
//   soit le taux de TVA choisi.
//
//   Toute l'arithmétique se fait en **centimes entiers** (jamais de float sur
//   l'argent — CLAUDE.md n°4). Les montants `numeric` Postgres arrivent en
//   `number` JS ; on les convertit en centimes par arrondi bancaire simple
//   (`Math.round`) une seule fois, en frontière.

/** Convertit un montant MAD (`number`, 2 décimales max) en centimes entiers. */
export function toCentimes(amountMad: number): number {
  return Math.round(amountMad * 100)
}

/** Reconvertit des centimes entiers en montant MAD (`number`, 2 décimales). */
export function fromCentimes(centimes: number): number {
  return centimes / 100
}

/** Une ligne de facture, exprimée en centimes (TTC — tel que facturé). */
export interface InvoiceLineCentimes {
  /** Libellé de la ligne (nom produit ou « Livraison »). */
  label: string
  /** Détail secondaire (palier, quantité × PU) — optionnel. */
  detail?: string
  /** Quantité (unités). Null pour une ligne forfaitaire (ex. livraison). */
  quantity: number | null
  /** Prix unitaire TTC en centimes. Null pour une ligne forfaitaire. */
  unitPriceCentimes: number | null
  /** Total TTC de la ligne en centimes. */
  totalCentimes: number
}

/** Totaux fiscaux dérivés, tous en centimes entiers. */
export interface InvoiceTotalsCentimes {
  /** Total TTC = montant réellement facturé (source de vérité). */
  totalTtcCentimes: number
  /** Total HT = round(TTC / (1 + taux)). */
  totalHtCentimes: number
  /** Montant de TVA = TTC − HT (jamais recalculé indépendamment → ht+tva=ttc). */
  vatCentimes: number
  /** Taux de TVA appliqué, en pourcentage (ex. 20 pour 20 %). 0 = non applicable. */
  vatRatePercent: number
}

/**
 * Dérive le décompte HT / TVA à partir du TTC facturé.
 *
 * Invariant garanti : `totalHt + vat === totalTtc` (au centime près, exact).
 * Le HT est arrondi ; la TVA absorbe le reste → aucune dérive possible.
 *
 * @param totalTtcCentimes  Montant TTC réellement facturé, en centimes.
 * @param vatRatePercent    Taux de TVA en % (≥ 0). 0 → TVA non applicable.
 */
export function deriveTotals(
  totalTtcCentimes: number,
  vatRatePercent: number,
): InvoiceTotalsCentimes {
  if (!Number.isInteger(totalTtcCentimes) || totalTtcCentimes < 0) {
    throw new Error('deriveTotals: totalTtcCentimes doit être un entier ≥ 0')
  }
  if (!(vatRatePercent >= 0) || !Number.isFinite(vatRatePercent)) {
    throw new Error('deriveTotals: vatRatePercent doit être un nombre ≥ 0')
  }

  if (vatRatePercent === 0) {
    return {
      totalTtcCentimes,
      totalHtCentimes: totalTtcCentimes,
      vatCentimes: 0,
      vatRatePercent: 0,
    }
  }

  const totalHtCentimes = Math.round(totalTtcCentimes / (1 + vatRatePercent / 100))
  const vatCentimes = totalTtcCentimes - totalHtCentimes

  return { totalTtcCentimes, totalHtCentimes, vatCentimes, vatRatePercent }
}

/**
 * Numéro de facture déterministe et lisible, dérivé de la commande.
 * Format : `FAC-YYYY-XXXXXXXX` (année de la commande + 8 premiers hex de l'UUID,
 * en majuscules). Déterministe → réémettre la même facture donne le même numéro.
 */
export function buildInvoiceNumber(orderId: string, orderedAtIso: string): string {
  const year = new Date(orderedAtIso).getUTCFullYear()
  const ref = orderId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `FAC-${year}-${ref}`
}
