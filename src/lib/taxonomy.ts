// ─── Product taxonomy — categories, subcategories, origins ───────────────────
// Single source of truth for all product classification UI across the platform.

export const CATEGORY_TAXONOMY = {
  'Textile': [
    'Homme',
    'Femme',
    'Enfant',
    'Sous-vêtements',
    'Hijab',
    'Burkini',
    'Sportswear',
  ],
  'Matières premières': [
    'Tissus vrac',
    'Maille vrac',
    'Denim',
    'Coton',
    'Accessoires textile',
  ],
  'Chaussures': [
    'Homme',
    'Femme',
    'Enfant',
  ],
  'Cosmétique & hygiène': [
    'Cosmétique',
    'Parfum',
    'Papier hygiénique',
    'Hygiène',
  ],
  'Alimentaire': [
    'Produits alimentaires',
    'Épices',
    'Conserves',
    'Bio',
  ],
  'Maison & packaging': [
    'Emballage',
    'Articles ménagers',
    'Décoration',
  ],
  'Artisanat': [
    'Artisanat marocain',
    'Cadeaux',
    'Décoration artisanale',
  ],
  // Catégorie parente dédiée (D2, 2026-06-20) — produits finis grand public = canal affilié.
  'Électronique & gadgets': [
    'Électronique',
    'Téléphonie & accessoires',
    'Gadgets',
    'Audio',
  ],
  'Sport & Fitness': [
    'Fitness',
    'Yoga',
    'Sport de plein air',
    'Accessoires sport',
  ],
  'Jouets & enfants': [
    'Jouets',
    'Jeux éducatifs',
    'Peluches',
    'Loisirs créatifs',
  ],
  'Accessoires & maroquinerie': [
    'Sacs',
    'Maroquinerie',
    'Bijoux',
    'Lunettes',
    'Ceintures',
  ],
  'Autres': [
    'Accessoires',
    'Divers',
  ],
} as const satisfies Record<string, readonly string[]>

export type ProductCategory = keyof typeof CATEGORY_TAXONOMY

export const PRODUCT_CATEGORIES = Object.keys(CATEGORY_TAXONOMY) as ProductCategory[]

export function getSubcategories(category: string): readonly string[] {
  return (CATEGORY_TAXONOMY as Record<string, readonly string[]>)[category] ?? []
}

// ─── CANAL PAR CATÉGORIE (D2) — décision figée 2026-06-20 ─────────────────────
// Quelles catégories PEUVENT aller en canal AFFILIÉ (dropshipping COD). Tout le
// reste (matières premières/tissu brut, agroalimentaire, divers) = GROSSISTE seul.
// Résolution FAIL-CLOSED : catégorie inconnue/vide → grossiste (jamais affilié).
// NB : `affiliate_enabled=true` exige AUSSI le capital affilié (mig 073) — ce flag
// ne fait qu'AUTORISER le canal, il ne dérive aucun montant.
const AFFILIATE_ALLOWED_CATEGORIES: ReadonlySet<string> = new Set([
  'Textile',
  'Chaussures',
  'Cosmétique & hygiène',
  'Maison & packaging',
  'Artisanat',
  'Électronique & gadgets',
  'Sport & Fitness',
  'Jouets & enfants',
  'Accessoires & maroquinerie',
])

/** Catégorie connue de la taxonomie ? (allowlist serveur — défense en profondeur). */
export function isValidCategory(category: string | null | undefined): category is ProductCategory {
  return !!category && (PRODUCT_CATEGORIES as readonly string[]).includes(category)
}

/**
 * Le canal AFFILIÉ est-il autorisé pour cette catégorie ? FAIL-CLOSED :
 * catégorie vide/inconnue/non listée → false (grossiste seul). Jamais l'inverse.
 */
export function isAffiliateAllowedCategory(category: string | null | undefined): boolean {
  return !!category && AFFILIATE_ALLOWED_CATEGORIES.has(category)
}

// ─── Origin country visual config ─────────────────────────────────────────────

export const ORIGIN_COUNTRIES = [
  'Maroc',
  'Turquie',
  'Chine',
  'Égypte',
  'Dubai',
  'Autre',
  'Mixte',
] as const

export type OriginCountry = typeof ORIGIN_COUNTRIES[number]

export interface OriginConfig {
  flag: string
  label: string
  badgeCls: string
  textCls: string
}

// Chips PAYS neutralisés (plus d'arc-en-ciel) : drapeau + label, fond neutre.
// La distinction visuelle se fait par le drapeau, pas par une couleur sauvage.
const ORIGIN_BADGE_CLS = 'bg-surface-2 border border-line'
const ORIGIN_TEXT_CLS = 'text-muted'

export const ORIGIN_CONFIG: Record<OriginCountry, OriginConfig> = {
  'Maroc':   { flag: '🇲🇦', label: 'Maroc',   badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Turquie': { flag: '🇹🇷', label: 'Turquie', badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Chine':   { flag: '🇨🇳', label: 'Chine',   badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Égypte':  { flag: '🇪🇬', label: 'Égypte',  badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Dubai':   { flag: '🇦🇪', label: 'Dubai',   badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Autre':   { flag: '🌍',  label: 'Autre',   badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
  'Mixte':   { flag: '🌐',  label: 'Mixte',   badgeCls: ORIGIN_BADGE_CLS, textCls: ORIGIN_TEXT_CLS },
}

export function getOriginConfig(country: string): OriginConfig {
  return (
    (ORIGIN_CONFIG as Record<string, OriginConfig>)[country] ?? {
      flag: '🌍',
      label: country,
      badgeCls: ORIGIN_BADGE_CLS,
      textCls: ORIGIN_TEXT_CLS,
    }
  )
}

// ─── Category icons (emoji) ───────────────────────────────────────────────────
// Toutes les 12 catégories canoniques. Réutilisé par CategoryRail.
export const CATEGORY_ICONS: Record<string, string> = {
  'Textile':              '👗',
  'Matières premières':   '🧵',
  'Chaussures':           '👟',
  'Cosmétique & hygiène': '💄',
  'Alimentaire':          '🥗',
  'Maison & packaging':   '📦',
  'Artisanat':            '🧶',
  'Électronique & gadgets': '📱',
  'Sport & Fitness':      '🏋️',
  'Jouets & enfants':     '🧸',
  'Accessoires & maroquinerie': '👜',
  'Autres':               '🔧',
}

/**
 * Résout le libellé localisé d'une catégorie canonique.
 * Retourne le nom canonique lui-même si la traduction est absente (fallback safe).
 * Usage côté serveur uniquement (passe `t` de getTranslations('categories')).
 */
export function resolveCategoryLabel(
  canonicalName: string,
  t: (key: string) => string,
): string {
  try {
    return t(canonicalName)
  } catch {
    return canonicalName
  }
}

// ─── Trust badges ──────────────────────────────────────────────────────────────

// Trust badges = réassurance premium → accent OR unifié (signature), plus de
// bleu/indigo/slate décoratifs.
const TRUST_BADGE_CLS = 'bg-accent-soft text-accent-fg border border-gold-300'

export const TRUST_BADGES = [
  { id: 'verified_supplier',  label: 'Fournisseur vérifié',           icon: '✓',  cls: TRUST_BADGE_CLS },
  { id: 'local_stock',        label: 'Stock local Maroc',             icon: '🏭', cls: TRUST_BADGE_CLS },
  { id: 'international',       label: 'Fournisseur international',      icon: '🌍', cls: TRUST_BADGE_CLS },
  { id: 'transport_included', label: 'Transport & douane inclus',     icon: '🚢', cls: TRUST_BADGE_CLS },
  { id: 'platform_payment',   label: 'Paiement via plateforme',       icon: '🔒', cls: TRUST_BADGE_CLS },
  { id: 'identity_protected', label: 'Identité fournisseur protégée', icon: '🛡', cls: TRUST_BADGE_CLS },
] as const
