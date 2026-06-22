// ─── Résolveur d'affichage des catégories (server-only) ──────────────────────
// Transforme l'arbre catégories (base, via cache fail-closed) en liste 100%
// SÉRIALISABLE pour l'UI : filtres `?category=`, rails, grilles, et les `<select>`
// des forms CLIENT (admin/supplier). AUCUNE fonction n'est exposée → conforme
// RÈGLE #2 (strings/données seulement vers les Client Components).
//
// Ordre de fallback NON-RÉGRESSIF (les 12 catégories seedées rendent à l'identique) :
//   libellé : i18n `categories` → label DB (locale) → slug canonique
//   icône   : CATEGORY_ICONS (figé) → icon DB → 📦
//   image   : CATEGORY_IMAGES (figé) → image_url DB → undefined
// Une catégorie créée en admin (sans clé i18n ni entrée figée) prend donc ses
// libellé/icône/image DEPUIS LA BASE et apparaît partout automatiquement.
//
// Le canal D2 (getChannelDecision) n'est PAS concerné ici : affichage/lecture seul.

import { getTranslations, getLocale } from 'next-intl/server'
import { CATEGORY_ICONS, CATEGORY_IMAGES } from '@/lib/taxonomy'
import { getCategoryContext } from './index'
import type { CategoryNode } from './read'

const FALLBACK_ICON = '📦'

export type CategorySubDisplay = { value: string; label: string }

export type CategoryDisplay = {
  /** Nom canonique == products.category (clé de filtre ET d'écriture). */
  value: string
  label: string
  icon: string
  image?: string
  /** Canal affilié autorisé (D2) — exposé pour info, jamais recalculé ici. */
  affiliateAllowed: boolean
  subcategories: CategorySubDisplay[]
}

type Locale = 'fr' | 'ar' | 'en'
function normLocale(l: string): Locale {
  return l === 'ar' || l === 'en' ? l : 'fr'
}

/** t(key) avec repli null si la clé est absente (next-intl lève sur clé manquante). */
function tryT(t: (k: string) => string, key: string): string | null {
  try {
    return t(key)
  } catch {
    return null
  }
}

function buildDisplay(
  node: CategoryNode,
  locale: Locale,
  tCat: (k: string) => string,
): CategoryDisplay {
  const label = tryT(tCat, node.slug) ?? node.labels?.[locale] ?? node.slug
  const icon = CATEGORY_ICONS[node.slug] ?? node.icon ?? FALLBACK_ICON
  const image = CATEGORY_IMAGES[node.slug] ?? node.imageUrl ?? undefined
  const subcategories: CategorySubDisplay[] = node.subcategories.map((sub) => ({
    value: sub,
    label: tryT(tCat, `sub_${sub}`) ?? node.subLabels?.[sub]?.[locale] ?? sub,
  }))
  return {
    value: node.slug,
    label,
    icon,
    image: image ?? undefined,
    affiliateAllowed: node.affiliateAllowed,
    subcategories,
  }
}

/**
 * Liste des catégories pour l'AFFICHAGE, résolue côté serveur, 100% sérialisable.
 * Lecture cachée + fail-closed (taxonomy.ts figé si base injoignable). À passer
 * telle quelle aux Client Components (forms) ou à consommer dans les pages serveur.
 */
export async function getCategoryDisplayList(): Promise<CategoryDisplay[]> {
  const [ctx, tCat, locale] = await Promise.all([
    getCategoryContext(),
    getTranslations('categories'),
    getLocale(),
  ])
  const loc = normLocale(locale)
  return ctx.tree.map((node) => buildDisplay(node, loc, tCat))
}

/** Sous-catégories d'une catégorie donnée (liste vide si inconnue). */
export function subcategoriesOf(
  list: CategoryDisplay[],
  category: string | null | undefined,
): CategorySubDisplay[] {
  if (!category) return []
  return list.find((c) => c.value === category)?.subcategories ?? []
}
