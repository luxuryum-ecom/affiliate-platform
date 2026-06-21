// ─── Lecture de la taxonomie depuis la base — SOUS-LOT 2 ─────────────────────
// Lit la table `categories` (mig 081) et la transforme en TaxonomySource utilisable
// par la normalisation d'ingestion + le prompt IA. FAIL-CLOSED : toute erreur de
// lecture OU table vide → repli sur la taxonomie FIGÉE de `taxonomy.ts`. Jamais
// d'élargissement par erreur (le canal D2 n'est PAS décidé ici — réservé au
// sous-lot 3 ; ici on n'alimente que l'IA d'ingestion).
//
// Ce fichier N'IMPORTE PAS next/cache → il reste testable en isolation (fetcher
// injectable) et runnable hors runtime Next. Le cache applicatif est ajouté par
// `index.ts` (unstable_cache). Lecture via client ANON (RLS SELECT public) :
// service_role n'est JAMAIS utilisé pour lire (règle d'or n°6).

import { createClient } from '@supabase/supabase-js'
import {
  PRODUCT_CATEGORIES,
  getSubcategories,
  isAffiliateAllowedCategory,
} from '@/lib/taxonomy'
import type { TaxonomySource } from '@/lib/telegram/schema'

/** Ligne brute de la table `categories` (colonnes lues). */
export type CategoryRow = {
  id: string
  slug: string
  parent_id: string | null
  affiliate_allowed: boolean
  active: boolean
  sort_order: number
}

/** Catégorie parente normalisée + ses sous-catégories actives. */
export type CategoryNode = {
  slug: string
  /** Canal affilié autorisé (D2). Lecture POSITIVE : true uniquement si === true. */
  affiliateAllowed: boolean
  subcategories: string[]
}

export type CategoryContext = {
  /** D'où vient l'arbre effectivement servi : 'db' (lecture réussie) ou 'fallback'. */
  origin: 'db' | 'fallback'
  tree: CategoryNode[]
  /** Pour la normalisation d'ingestion (normalizeCategory/Subcategory). */
  source: TaxonomySource
  /** Bloc texte « - Catégorie : sous-cats » injecté dans le prompt IA. */
  promptBlock: string
}

/** Fallback codé fail-closed : la taxonomie figée de `taxonomy.ts`. */
export function staticTree(): CategoryNode[] {
  return PRODUCT_CATEGORIES.map((slug) => ({
    slug,
    affiliateAllowed: isAffiliateAllowedCategory(slug),
    subcategories: [...getSubcategories(slug)],
  }))
}

/**
 * Transforme des lignes DB en arbre catégories. PUR (aucune I/O) → testable.
 * Ne garde que les catégories ACTIVES (filtre défensif, même si la requête filtre
 * déjà). Lève si aucune catégorie parente active (déclenche le fallback amont).
 */
export function buildTreeFromRows(rows: CategoryRow[]): CategoryNode[] {
  const active = rows.filter((r) => r.active)
  const parents = active
    .filter((r) => r.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
  if (parents.length === 0) throw new Error('categories: aucune catégorie parente active')
  return parents.map((p) => ({
    slug: p.slug,
    affiliateAllowed: p.affiliate_allowed === true, // positif, jamais ?? true
    subcategories: active
      .filter((s) => s.parent_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.slug),
  }))
}

/** Construit le contexte (source + prompt) à partir d'un arbre. PUR. */
export function buildContext(tree: CategoryNode[], origin: 'db' | 'fallback'): CategoryContext {
  const subsBySlug = new Map(tree.map((n) => [n.slug, n.subcategories]))
  const source: TaxonomySource = {
    categories: tree.map((n) => n.slug),
    getSubcategories: (category) => subsBySlug.get(category) ?? [],
  }
  const promptBlock = tree.map((n) => `- ${n.slug} : ${n.subcategories.join(', ')}`).join('\n')
  return { origin, tree, source, promptBlock }
}

/** Client de lecture ANON (RLS SELECT public). Pas de session, pas de service_role. */
function anonReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Lecture brute des catégories actives en base. Lève en cas d'erreur OU de table
 * vide (l'appelant retombe alors sur le fallback figé).
 */
export async function fetchCategoryRows(): Promise<CategoryRow[]> {
  const sb = anonReadClient()
  const { data, error } = await sb
    .from('categories')
    .select('id,slug,parent_id,affiliate_allowed,active,sort_order')
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('categories: table vide')
  return data as CategoryRow[]
}

/**
 * Contexte taxonomie EFFECTIF, fail-closed. Essaie la base via `fetcher` ; toute
 * erreur (réseau, RLS, table vide, aucun parent) → repli SILENCIEUX et SÛR sur la
 * taxonomie figée de `taxonomy.ts`. `fetcher` injectable pour les tests.
 */
export async function loadCategoryContext(
  fetcher: () => Promise<CategoryRow[]> = fetchCategoryRows,
): Promise<CategoryContext> {
  try {
    const rows = await fetcher()
    return buildContext(buildTreeFromRows(rows), 'db')
  } catch {
    return buildContext(staticTree(), 'fallback')
  }
}

// ─── DÉCISION DE CANAL D2 (financier) — lecture FRAÎCHE, non cachée ───────────
// Réservé à la décision d'écriture produit (products.ts). Conditions @finance/
// @security : (3) lecture NON cachée → on appelle loadCategoryContext avec le
// fetcher direct (fetchCategoryRows), JAMAIS le wrapper caché de index.ts.
// (1) décision POSITIVE : affilié autorisé UNIQUEMENT si affiliateAllowed === true.
// (2) fail-closed : DB down/vide/inconnue → grossiste (jamais d'élargissement).
// (5) `active` filtré : seules les catégories actives sont dans l'arbre.

export type ChannelDecision = {
  /** D'où vient la décision : 'db' (lecture fraîche réussie) ou 'fallback' (taxonomy.ts). */
  origin: 'db' | 'fallback'
  /** Catégorie connue ET active (anti-POST). Vide/inconnue/inactive → false. */
  isValidCategory: (category: string | null | undefined) => boolean
  /** Canal AFFILIÉ autorisé. POSITIF : true UNIQUEMENT si affiliateAllowed === true. */
  isAffiliateAllowed: (category: string | null | undefined) => boolean
}

/**
 * Décision de canal D2 (fraîche + fail-closed) pour l'écriture produit.
 * Mappe sur le NOM canonique (== products.category). `fetcher` injectable (tests).
 */
export async function getChannelDecision(
  fetcher: () => Promise<CategoryRow[]> = fetchCategoryRows,
): Promise<ChannelDecision> {
  const ctx = await loadCategoryContext(fetcher)
  const bySlug = new Map(ctx.tree.map((n) => [n.slug, n]))
  return {
    origin: ctx.origin,
    isValidCategory: (category) => !!category && bySlug.has(category),
    isAffiliateAllowed: (category) =>
      !!category && bySlug.get(category)?.affiliateAllowed === true,
  }
}
