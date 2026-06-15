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
  'Autres': [
    'Électronique',
    'Accessoires',
    'Divers',
  ],
} as const satisfies Record<string, readonly string[]>

export type ProductCategory = keyof typeof CATEGORY_TAXONOMY

export const PRODUCT_CATEGORIES = Object.keys(CATEGORY_TAXONOMY) as ProductCategory[]

export function getSubcategories(category: string): readonly string[] {
  return (CATEGORY_TAXONOMY as Record<string, readonly string[]>)[category] ?? []
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
