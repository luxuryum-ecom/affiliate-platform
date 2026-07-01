// ─── Insert factorisé des paliers MOQ d'un produit fournisseur (mig 035) ─────
// Source unique de vérité pour écrire `supplier_product_moq_tiers`, partagée par
// les flux web (submitSupplierProduct) et CSV (publishBulkImport). LOT 2 : refactor
// PUR — remplace 2 inserts dupliqués sans changer le comportement.

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Palier à insérer : quantité seuil + prix unitaire dans la devise SOURCE du
 * fournisseur. `unit_price_usd` est passé VERBATIM à la colonne numeric — il peut
 * être une chaîne décimale (flux web, money.ts, règle argent #4) OU un nombre
 * (flux CSV). Aucune reconversion ici (zéro parseFloat).
 */
export type MoqTierInput = { min_quantity: number; unit_price_usd: string | number }

/**
 * Insère les paliers MOQ d'un produit fournisseur. Comportement IDENTIQUE aux
 * inserts d'origine :
 *  - aucun palier → no-op (équivaut au garde `tiers.length > 0` précédent) ;
 *  - lignes construites à l'identique : { supplier_product_id, min_quantity, unit_price_usd } ;
 *  - l'erreur est RENVOYÉE (jamais throw) : l'appelant décide — le flux web la
 *    remonte à l'utilisateur, le flux CSV l'ignore (best-effort), comme avant.
 */
export async function insertMoqTiers(
  admin: AdminClient,
  supplierProductId: string,
  tiers: MoqTierInput[],
): Promise<{ error: string | null }> {
  if (tiers.length === 0) return { error: null }

  const rows = tiers.map((t) => ({
    supplier_product_id: supplierProductId,
    min_quantity: t.min_quantity,
    unit_price_usd: t.unit_price_usd,
  }))

  const { error } = await admin.from('supplier_product_moq_tiers').insert(rows)
  return { error: error ? error.message : null }
}
