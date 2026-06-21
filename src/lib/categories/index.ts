// ─── Taxonomie dynamique — point d'entrée applicatif (SOUS-LOT 2) ────────────
// Enrobe la lecture base (`read.ts`) d'un cache applicatif (unstable_cache).
// Le cache est invalidable par tag → les futures mutations admin (sous-lot 4)
// appelleront `revalidateTag(CATEGORIES_REVALIDATE_TAG)`.
//
// ⚠️ Ce cache alimente UNIQUEMENT l'IA d'ingestion (sous-lot 2). La décision de
// canal D2 (sous-lot 3) devra lire FRAIS (non caché) — voir conditions roadmap.

import { unstable_cache } from 'next/cache'
import {
  fetchCategoryRows,
  loadCategoryContext,
  type CategoryContext,
} from './read'

export * from './read'

/** Tag d'invalidation du cache catégories (revalidateTag à chaque mutation admin). */
export const CATEGORIES_REVALIDATE_TAG = 'categories'

// Lecture base cachée (60 s, invalidable par tag). En cas d'échec, l'exception
// remonte à loadCategoryContext qui applique le fallback fail-closed.
const cachedFetchRows = unstable_cache(fetchCategoryRows, ['categories-active-rows'], {
  tags: [CATEGORIES_REVALIDATE_TAG],
  revalidate: 60,
})

/**
 * Contexte taxonomie effectif (cache + fail-closed). À utiliser côté serveur
 * pour l'IA d'ingestion. Retombe sur la taxonomie figée si la base est
 * injoignable/vide (jamais d'élargissement par erreur).
 */
export async function getCategoryContext(): Promise<CategoryContext> {
  return loadCategoryContext(cachedFetchRows)
}
