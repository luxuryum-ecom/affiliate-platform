// ─── Pont marketplace fournisseur ↔ catalogue interne ────────────────────────
// SOURCE DE VÉRITÉ UNIQUE pour « ce produit est-il commandable en direct ? ».
//
// Un produit du marketplace (`supplier_products`) n'est réellement commandable
// en direct que s'il existe une ligne MIROIR dans le catalogue interne
// (`products`) : active + approved + local_stock + nom qui matche. C'est cette
// ligne que le checkout (addMarketplaceToCart) utilise pour le panier.
//
// Avant ce module, la décision « direct » était calculée d'un côté à partir du
// stock fournisseur (page + getSupplierProductCtaMode) et de l'autre exigeait le
// miroir catalogue (cart.ts) → deux sources de vérité divergentes, d'où le CTA
// « Commander » suivi d'un refus « pas encore disponible ». Ce module unifie.
//
// Pas de `'use server'` ici : module utilitaire serveur (prend un client Supabase),
// importé par les pages serveur ET par l'action panier.

import type { createClient } from '@/lib/supabase/server'
import { catalogNameMatchesProduct, normalizeCatalogLookupName } from '@/lib/wholesale-cta'
import type { Product } from '@/types/database'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Ligne catalogue réellement utilisée au checkout (seuils inclus). */
export type CatalogLink = Pick<
  Product,
  'id' | 'name' | 'wholesale_min_qty' | 'stock_count' | 'source_supplier_product_id'
>

type SupplierLike = { public_name: string | null; product_name: string }

const CATALOG_SELECT = 'id, name, wholesale_min_qty, stock_count, source_supplier_product_id'

function lookupNameOf(p: SupplierLike): string {
  return (p.public_name || p.product_name).trim()
}

/**
 * Résout le miroir catalogue commandable d'UN produit fournisseur.
 * Retourne null si aucun → le produit n'est PAS commandable en direct (→ 'rfq').
 * Reproduit exactement la logique historique de cart.ts (ilike + match normalisé).
 */
export async function findCatalogLink(
  supabase: ServerClient,
  product: SupplierLike & { id?: string },
): Promise<CatalogLink | null> {
  // Lien FORT : miroir auto-provisionné rattaché par id (migr. 069). Prioritaire,
  // insensible au renommage (contrairement au match nom).
  if (product.id) {
    const { data: linked } = (await supabase
      .from('products')
      .select(CATALOG_SELECT)
      .eq('source_supplier_product_id', product.id)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('availability_type', 'local_stock')
      .maybeSingle()) as { data: CatalogLink | null; error: unknown }
    if (linked) return linked
  }

  // Repli historique : match par nom normalisé (miroirs manuels pré-069).
  const lookupName = lookupNameOf(product)

  const { data } = (await supabase
    .from('products')
    .select(CATALOG_SELECT)
    .eq('active', true)
    .eq('approval_status', 'approved')
    .eq('availability_type', 'local_stock')
    .ilike('name', lookupName)
    .order('id', { ascending: true })) as { data: CatalogLink[] | null; error: unknown }

  const rows = data ?? []
  return rows.find((p) => catalogNameMatchesProduct(p, lookupName)) ?? rows[0] ?? null
}

/**
 * Version BATCH pour la page liste : résout le miroir d'un lot de produits
 * fournisseurs en UNE requête. On charge tous les produits catalogue commandables
 * (local_stock approuvés actifs) puis on matche par nom NORMALISÉ (même règle que
 * `catalogNameMatchesProduct`) — évite N requêtes et reste cohérent avec le unitaire.
 * Clé de la Map = supplierProduct.id ; absent = pas de miroir = non commandable.
 */
export async function findCatalogLinks(
  supabase: ServerClient,
  products: (SupplierLike & { id: string })[],
): Promise<Map<string, CatalogLink>> {
  const result = new Map<string, CatalogLink>()
  if (products.length === 0) return result

  const { data } = (await supabase
    .from('products')
    .select(CATALOG_SELECT)
    .eq('active', true)
    .eq('approval_status', 'approved')
    .eq('availability_type', 'local_stock')
    .order('id', { ascending: true })) as { data: CatalogLink[] | null; error: unknown }

  const bySource = new Map<string, CatalogLink>()
  const byNormalizedName = new Map<string, CatalogLink>()
  for (const row of data ?? []) {
    // Lien FORT : miroir auto-provisionné (migr. 069) — prioritaire sur le match nom.
    if (row.source_supplier_product_id) bySource.set(row.source_supplier_product_id, row)
    const key = normalizeCatalogLookupName(row.name)
    // Premier gagnant sur un ordre déterministe (id croissant) → même miroir choisi
    // que la résolution unitaire en cas de doublons de noms dans le catalogue.
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, row)
  }

  for (const p of products) {
    const link =
      bySource.get(p.id) ?? byNormalizedName.get(normalizeCatalogLookupName(lookupNameOf(p)))
    if (link) result.set(p.id, link)
  }
  return result
}
