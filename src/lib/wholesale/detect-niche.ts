import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Détection de la NICHE d'un grossiste à partir de SON comportement réel.
 *
 * PÉRIMÈTRE STRICT — AFFICHAGE / PERSONNALISATION UNIQUEMENT :
 *  - Lecture seule. AUCUNE écriture. ZÉRO donnée financière touchée
 *    (prix, marge, capital, commission, stock réel) — on n'agrège que des
 *    catégories de produits déjà vus/achetés/demandés par le grossiste.
 *  - ISOLATION : on ne passe JAMAIS de `buyer_id` venant du client. Les requêtes
 *    s'appuient sur la RLS (`auth.uid()`) — un grossiste ne lit QUE ses propres
 *    lignes (cart/orders/devis/échantillons). Pas de service_role.
 *
 * Le résultat (`topNiche`) ne sert qu'à : (a) remonter la catégorie dominante en
 * tête de la grille marketplace (boost de tri borné), (b) le wording de la
 * bannière de tête. Cold-start (aucun signal) → `topNiche = null` → fallback neutre.
 */

// Pondération par type de signal (force de l'intention d'achat).
// Décision (autonomie, non-financier) : v1 pondère par TYPE de signal — la récence
// fine (peu de created_at homogènes entre sources) est reportée à un raffinement
// ultérieur. Cela garde l'algo déterministe et unitairement testable.
export const NICHE_WEIGHTS = {
  order:         3, // achat confirmé = signal le plus fort
  cart:          2, // intention en cours
  quote:         2, // devis produit interne demandé
  supplierQuote: 2, // devis produit fournisseur demandé
  sample:        1, // échantillon demandé
} as const

export interface NicheSignal {
  /** Catégorie produit (peut être vide → ignorée). */
  category: string
  /** Poids du signal. */
  weight: number
}

export interface NicheResult {
  /** Catégorie dominante détectée, ou `null` si aucun signal exploitable. */
  topNiche: string | null
  /** Score agrégé par catégorie (pour debug / future bannière multi-niche). */
  scores: Record<string, number>
}

/**
 * Logique de scoring PURE (testable sans base) : agrège les signaux pondérés par
 * catégorie, ignore les catégories vides, renvoie la dominante.
 * Départage déterministe : score décroissant, puis ordre alphabétique stable.
 */
export function scoreNiche(signals: NicheSignal[]): NicheResult {
  const scores: Record<string, number> = {}
  for (const s of signals) {
    const cat = (s.category ?? '').trim()
    if (!cat) continue // tolère les produits sans catégorie (internes non backfillés)
    scores[cat] = (scores[cat] ?? 0) + s.weight
  }

  const entries = Object.entries(scores)
  if (entries.length === 0) return { topNiche: null, scores: {} }

  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return { topNiche: entries[0][0], scores }
}

// Helper : extrait un tableau de lignes d'un résultat Supabase, sans jeter en cas d'erreur.
function rows<T>(res: { data: T[] | null; error: unknown } | undefined): T[] {
  if (!res || res.error || !Array.isArray(res.data)) return []
  return res.data
}

function uniqueIds(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))]
}

/**
 * Détecte la niche du grossiste CONNECTÉ (via le client Supabase déjà authentifié).
 *
 * NE prend PAS de buyer_id : la RLS filtre sur `auth.uid()`. Toute requête ne
 * renvoie donc que les lignes du grossiste courant — l'isolation inter-grossistes
 * est structurelle (pas applicative).
 *
 * Résolution product_id → category via les VUES lisibles par un grossiste
 * authentifié (`products_public_read`, `supplier_products_wholesaler_read`) —
 * et NON via la table `products` (lecture réservée à `anon`).
 */
export async function detectBuyerNiche(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>,
): Promise<NicheResult> {
  // ── 1. Signaux comportement (RLS → uniquement les lignes du grossiste) ──────
  const [orderItems, cartItems, quotes, supplierQuotes, samples] = await Promise.all([
    supabase.from('wholesale_order_items').select('product_id'),
    supabase.from('wholesale_cart_items').select('product_id'),
    supabase.from('quote_requests').select('product_id'),
    supabase.from('supplier_quote_requests').select('supplier_product_id'),
    supabase.from('sample_requests').select('supplier_product_id'),
  ])

  const oi = rows<{ product_id: string }>(orderItems)
  const ci = rows<{ product_id: string }>(cartItems)
  const qr = rows<{ product_id: string }>(quotes)
  const sq = rows<{ supplier_product_id: string }>(supplierQuotes)
  const sr = rows<{ supplier_product_id: string }>(samples)

  const internalIds = uniqueIds([...oi, ...ci, ...qr].map((r) => r.product_id))
  const supplierIds = uniqueIds([...sq, ...sr].map((r) => r.supplier_product_id))

  // Cold-start : aucun signal → niche indétectable → fallback neutre.
  if (internalIds.length === 0 && supplierIds.length === 0) {
    return { topNiche: null, scores: {} }
  }

  // ── 2. Résolution catégorie via vues authenticated-readable ─────────────────
  const [internalCats, supplierCats] = await Promise.all([
    internalIds.length
      ? supabase.from('products_public_read').select('id, category').in('id', internalIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase.from('supplier_products_wholesaler_read').select('id, category').in('id', supplierIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const intMap = new Map(
    rows<{ id: string; category: string | null }>(internalCats).map((r) => [r.id, r.category ?? '']),
  )
  const supMap = new Map(
    rows<{ id: string; category: string | null }>(supplierCats).map((r) => [r.id, r.category ?? '']),
  )

  // ── 3. Construction des signaux pondérés ────────────────────────────────────
  const signals: NicheSignal[] = []
  for (const r of oi) signals.push({ category: intMap.get(r.product_id) ?? '', weight: NICHE_WEIGHTS.order })
  for (const r of ci) signals.push({ category: intMap.get(r.product_id) ?? '', weight: NICHE_WEIGHTS.cart })
  for (const r of qr) signals.push({ category: intMap.get(r.product_id) ?? '', weight: NICHE_WEIGHTS.quote })
  for (const r of sq) signals.push({ category: supMap.get(r.supplier_product_id) ?? '', weight: NICHE_WEIGHTS.supplierQuote })
  for (const r of sr) signals.push({ category: supMap.get(r.supplier_product_id) ?? '', weight: NICHE_WEIGHTS.sample })

  return scoreNiche(signals)
}
