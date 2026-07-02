// ─── Paliers de gros INDICATIFS (MAD) d'un produit fournisseur international ──────
// AFFICHAGE SEUL (fiche marketplace `/wholesale/marketplace/[id]`). Un produit import
// n'a PAS de miroir catalogue (donc pas de `wholesale_tiers`), et la vue redacted
// grossiste n'expose NI le taux FX NI la marge (anti-court-circuit mig 068/075), et la
// table `supplier_products` est admin-only (mig 091). On lit donc fx + marge via
// service_role côté SERVEUR uniquement, puis on réutilise `buildMirrorTiers` (AUDITÉ) pour
// dériver des paliers MAD ENTIERS. Le taux FX et le taux de marge ne quittent JAMAIS cette
// fonction : elle ne renvoie que des `WholesaleTier` MAD dérivés (aucune fuite).
//
// ⚠️ INDICATIF, HORS LEDGER : ces paliers ne sont JAMAIS lus par `getWholesaleTier`, le
// panier, le checkout ou un ledger. Le prix ferme est communiqué au devis. Retourne [] si
// non convertible (pas de fx / pas de palier) → l'appelant n'affiche rien (fail-safe).

import { createAdminClient } from '@/lib/supabase/admin'
import { buildMirrorTiers } from '@/lib/supplier-pricing'
import type { PlatformMarginType, WholesaleTier } from '@/types/database'

export async function getIndicativeMadTiers(
  supplierProductId: string,
): Promise<WholesaleTier[]> {
  const admin = createAdminClient()
  const { data } = (await admin
    .from('supplier_products')
    .select(
      'approval_status, fx_rate_source_to_mad, apply_platform_margin, platform_margin_type, platform_margin_value, supplier_product_moq_tiers(min_quantity, unit_price_usd)',
    )
    .eq('id', supplierProductId)
    .maybeSingle()) as {
    data: {
      approval_status: string
      fx_rate_source_to_mad: number | null
      apply_platform_margin: boolean | null
      platform_margin_type: string | null
      platform_margin_value: number | null
      supplier_product_moq_tiers: { min_quantity: number; unit_price_usd: number }[] | null
    } | null
  }

  // Ne montrer que pour un produit réellement approuvé (parité avec la visibilité fiche).
  if (!data || data.approval_status !== 'approved') return []

  // Mêmes params que le miroir Maroc : le 1er palier s'aligne sur la base du prix unitaire
  // déjà affiché (FX + marge produit) → cohérence. `buildMirrorTiers` écarte tout palier
  // non convertible (pas de fx → []), arrondit en ENTIER MAD, borne et trie. Zéro parseFloat.
  return buildMirrorTiers(
    data.supplier_product_moq_tiers ?? [],
    data.fx_rate_source_to_mad,
    !!data.apply_platform_margin,
    (data.platform_margin_type ?? 'percentage') as PlatformMarginType,
    data.platform_margin_value != null ? Number(data.platform_margin_value) : null,
  )
}
