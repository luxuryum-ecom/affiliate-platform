// ─── AM-1 — Réassort 1-clic : planification PURE (testable, sans I/O) ────────
//
// « Recommander ma dernière commande » : on relit les lignes de la dernière
// commande gros et on décide lesquelles peuvent RETOURNER au panier. La logique
// de décision (garder / ignorer) est isolée ici pour être testée sans base.
//
// Règle : on n'ajoute au panier QUE les produits encore commandables en direct
// (actifs, stock local — ensemble fourni par l'appelant après lecture RLS). Les
// autres (retirés, passés en devis/import) sont IGNORÉS et comptés → l'UI le dit.
// AUCUN prix n'est copié : seuls product_id / variant_id / quantité voyagent ;
// le prix est recalculé par le panier/checkout existants (zéro logique argent ici).

export interface ReorderItem {
  product_id: string
  variant_id: string | null
  quantity: number
}

export interface ReorderPlan {
  /** Lignes à (ré)insérer au panier, dédupliquées par (product_id, variant_id). */
  toAdd: ReorderItem[]
  /** Nombre de lignes ignorées car le produit n'est plus commandable en direct. */
  skippedCount: number
}

/** Clé d'unicité d'une ligne de panier (mêmes règles que la contrainte DB). */
function lineKey(it: ReorderItem): string {
  return `${it.product_id}|${it.variant_id ?? ''}`
}

/**
 * Construit le plan de réassort à partir des lignes de la dernière commande.
 *
 * @param items         Lignes de la commande (product_id, variant_id, quantité).
 * @param orderableIds  Ensemble des product_id encore commandables en direct.
 * @returns             { toAdd, skippedCount }.
 *
 * - Ignore toute quantité ≤ 0 ou non entière (défensif ; comptée comme skipped).
 * - Ignore les produits absents de `orderableIds` (comptés comme skipped).
 * - Déduplique par (product_id, variant_id) en gardant la PREMIÈRE occurrence
 *   (les lignes de commande sont déjà uniques ; garde-fou).
 */
export function planReorder(items: ReorderItem[], orderableIds: Set<string>): ReorderPlan {
  const seen = new Set<string>()
  const toAdd: ReorderItem[] = []
  let skippedCount = 0

  for (const it of items) {
    const qtyOk = Number.isInteger(it.quantity) && it.quantity > 0
    if (!qtyOk || !orderableIds.has(it.product_id)) {
      skippedCount++
      continue
    }
    const key = lineKey(it)
    if (seen.has(key)) continue // doublon exact → on ne le recompte pas en skipped
    seen.add(key)
    toAdd.push({ product_id: it.product_id, variant_id: it.variant_id, quantity: it.quantity })
  }

  return { toAdd, skippedCount }
}
