// ─── Miroir catalogue auto-provisionné (commande directe Maroc) ──────────────
// Logique PURE (aucune I/O) → testable unitairement. Câblée par :
//   - src/app/actions/supplier-products.ts (approveSupplierProduct) : UPSERT du miroir.
//   - src/app/actions/orders.ts (création de commande) : pré-remplissage du coût fournisseur.
//
// Règle argent (validée @finance, conditions C-B1..C-B5) :
//   sell_price       = final_wholesale_price_mad   (prix vitrine, déjà marge incluse)
//   factory_cost_mad = suggested_wholesale_price_mad (coût fournisseur AVANT marge)
//   marge plateforme = sell_price − factory_cost_mad, captée UNE seule fois (jamais réappliquée).
//
// Unité de vente + conditionnement (sale_unit/pack_size/pack_unit) = AFFICHAGE PUR : reportés du
// supplier_product au miroir comme le fait déjà le flux Finaliser, pour qu'un produit APPROUVÉ
// (non finalisé) garde son unité au catalogue. ZÉRO impact sur l'argent (sell/factory/marge).

import { normalizeSaleUnit } from '@/lib/units'
import { isValidMediaUrl } from '@/lib/product-media'
import type { MediaItem } from '@/types/database'

/** Entrée minimale issue d'un supplier_product pour décider/construire le miroir. */
export interface SupplierMirrorInput {
  id: string
  product_name: string
  public_name: string | null
  availability_type: string
  /** Coût fournisseur converti MAD, AVANT marge plateforme. */
  suggested_wholesale_price_mad: number | null
  /** Prix vitrine = COALESCE(final, suggested) ; déjà marge incluse. */
  final_wholesale_price_mad: number | null
  stock_quantity: number | null
  min_quantity: number
  /** Unité de vente brute (supplier_products.unit) — AFFICHAGE PUR, reportée au catalogue. */
  unit: string | null
  /** Conditionnement descriptif (affichage pur). */
  pack_size: number | null
  pack_unit: string | null
  /** Photos fournisseur (text[] d'URLs) — AFFICHAGE PUR, propagées au catalogue. */
  photos: string[] | null
  /** Catégorie/sous-catégorie fournisseur (canoniques) — reportées au miroir (D2). */
  category: string | null
  subcategory: string | null
}

/** Ligne `products` à UPSERT. Colonnes minimales : suffisantes pour findCatalogLink + checkout. */
export interface MirrorRow {
  source_supplier_product_id: string
  name: string
  sell_price: number
  factory_cost_mad: number
  wholesale_min_qty: number
  stock_count: number
  availability_type: 'local_stock'
  approval_status: 'approved'
  active: true
  // CANAL (D2) — un miroir = canal GROSSISTE only (prix grossiste, AUCUN capital affilié).
  // `affiliate_enabled=false` EXPLICITE (jamais le défaut `true` de la colonne) → ferme la
  // fuite : un miroir ne doit JAMAIS apparaître au catalogue affilié ni être facturé en COD
  // affilié sur une base sans capital. Catégorie reportée pour le rangement/rayons.
  affiliate_enabled: false
  category: string
  subcategory: string
  // Unité de vente + conditionnement — AFFICHAGE PUR (aucun calcul). null = pièce / aucun cond.
  sale_unit: string | null
  pack_size: number | null
  pack_unit: string | null
  // Photos — AFFICHAGE PUR. media = canonical (jsonb [{url,type}]), images = legacy dérivé,
  // exactement comme upsertProduct. OPTIONNELS : posés UNIQUEMENT si le fournisseur a des
  // photos valides → à la ré-approbation (UPDATE), l'absence de ces champs préserve une
  // galerie éventuellement curée côté admin (on n'écrase jamais avec du vide).
  media?: MediaItem[]
  images?: string[]
}

export type MirrorSkipReason =
  | 'not_local_stock' // C-B5 : import → reste devis
  | 'no_fx_rate' // C-B3 : prix MAD indisponible (devise sans taux) → reste devis
  | 'non_positive_price' // CHECK products.sell_price > 0
  | 'negative_margin' // C-B2 : sell < factory (ne devrait jamais arriver)

export type MirrorDecision =
  | { create: false; reason: MirrorSkipReason }
  | { create: true; row: MirrorRow }

/**
 * Décide si un supplier_product doit avoir un miroir catalogue, et le construit.
 * Déterministe : même entrée → même sortie (idempotence de l'UPSERT onConflict).
 */
export function buildSupplierMirror(sp: SupplierMirrorInput): MirrorDecision {
  // C-B5 — seuls les produits Maroc en stock local sont commandables en direct.
  if (sp.availability_type !== 'local_stock') return { create: false, reason: 'not_local_stock' }

  // C-B3 — sans prix MAD (devise sans taux FX), pas de miroir : le produit reste en devis.
  const factory = sp.suggested_wholesale_price_mad
  if (factory == null) return { create: false, reason: 'no_fx_rate' }

  // sell_price = prix vitrine (final) ; si la marge n'a pas été appliquée, final == suggested.
  const sell = sp.final_wholesale_price_mad ?? factory

  if (sell <= 0) return { create: false, reason: 'non_positive_price' } // CHECK sell_price > 0
  if (sell < factory) return { create: false, reason: 'negative_margin' } // C-B2 (garde défensive)

  // Unité de vente reportée (AFFICHAGE PUR) — unité RÉELLE seulement : pcs/null → null = pièce
  // implicite (inchangé). Identique au flux Finaliser. Aucun impact argent.
  const saleUnit = normalizeSaleUnit(sp.unit)

  // Photos — AFFICHAGE PUR : on ne garde que les URLs http(s) valides (même filtre que le
  // form admin). text[] fournisseur → media jsonb + images legacy, sans aucune transformation
  // d'argent. Vide → champs omis (cf. MirrorRow : ne jamais écraser une galerie curée).
  const validPhotos = (sp.photos ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => isValidMediaUrl(u))
  const photoCols =
    validPhotos.length > 0
      ? {
          media: validPhotos.map((url) => ({ url, type: 'image' as const })),
          images: validPhotos,
        }
      : {}

  return {
    create: true,
    row: {
      source_supplier_product_id: sp.id,
      name: (sp.public_name || sp.product_name).trim(),
      sell_price: sell,
      factory_cost_mad: factory,
      wholesale_min_qty: sp.min_quantity,
      // stock fournisseur NULL → 0 : pas de survente. Avec 0, la commande directe bascule
      // en sur-commande → devis (règle A1), jamais « indisponible ». Stock déclaré → direct.
      stock_count: sp.stock_quantity ?? 0,
      availability_type: 'local_stock',
      approval_status: 'approved',
      active: true,
      // CANAL GROSSISTE only — jamais affilié sans capital. Catégorie canonique reportée
      // (NOT NULL DEFAULT '' en base → '' si non classé, le fail-closed canal = grossiste).
      affiliate_enabled: false,
      category: sp.category ?? '',
      subcategory: sp.subcategory ?? '',
      // AFFICHAGE PUR — reporté tel quel, comme le flux Finaliser. Aucun calcul.
      sale_unit: saleUnit === 'piece' ? null : saleUnit,
      pack_size: sp.pack_size ?? null,
      pack_unit: sp.pack_unit ?? null,
      ...photoCols,
    },
  }
}

/**
 * C-B1 — Coût fournisseur pré-rempli d'une commande directe = Σ(factory_cost_mad × qty).
 * CENTIMES ENTIERS (zéro flottant). factory_cost_mad NULL (catalogue legacy) → 0 pour cette
 * ligne (l'admin ajuste). Pour un miroir auto-provisionné, factory_cost_mad est toujours posé,
 * donc le coût n'est jamais un 0 silencieux. Renvoie une chaîne `numeric`-safe (2 décimales).
 */
export function computeSupplierCostMad(
  lines: { factory_cost_mad: number | null; quantity: number }[],
): string {
  let cents = 0
  for (const l of lines) {
    const unit = l.factory_cost_mad ?? 0
    cents += Math.round(unit * 100) * l.quantity
  }
  return (cents / 100).toFixed(2)
}
