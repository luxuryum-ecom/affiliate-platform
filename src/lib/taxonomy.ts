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

export const ORIGIN_CONFIG: Record<OriginCountry, OriginConfig> = {
  'Maroc':   { flag: '🇲🇦', label: 'Maroc',   badgeCls: 'bg-emerald-50 border border-emerald-200', textCls: 'text-emerald-700' },
  'Turquie': { flag: '🇹🇷', label: 'Turquie', badgeCls: 'bg-red-50 border border-red-200',         textCls: 'text-red-700'     },
  'Chine':   { flag: '🇨🇳', label: 'Chine',   badgeCls: 'bg-rose-50 border border-rose-200',       textCls: 'text-rose-700'    },
  'Égypte':  { flag: '🇪🇬', label: 'Égypte',  badgeCls: 'bg-amber-50 border border-amber-200',     textCls: 'text-amber-700'   },
  'Dubai':   { flag: '🇦🇪', label: 'Dubai',   badgeCls: 'bg-sky-50 border border-sky-200',         textCls: 'text-sky-700'     },
  'Autre':   { flag: '🌍',  label: 'Autre',   badgeCls: 'bg-gray-100 border border-gray-200',      textCls: 'text-gray-600'    },
  'Mixte':   { flag: '🌐',  label: 'Mixte',   badgeCls: 'bg-purple-50 border border-purple-200',   textCls: 'text-purple-700'  },
}

export function getOriginConfig(country: string): OriginConfig {
  return (
    (ORIGIN_CONFIG as Record<string, OriginConfig>)[country] ?? {
      flag: '🌍',
      label: country,
      badgeCls: 'bg-gray-100 border border-gray-200',
      textCls: 'text-gray-600',
    }
  )
}

// ─── Trust badges ──────────────────────────────────────────────────────────────

export const TRUST_BADGES = [
  {
    id: 'verified_supplier',
    label: 'Fournisseur vérifié',
    icon: '✓',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  {
    id: 'local_stock',
    label: 'Stock local Maroc',
    icon: '🏭',
    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  {
    id: 'international',
    label: 'Fournisseur international',
    icon: '🌍',
    cls: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  {
    id: 'transport_included',
    label: 'Transport & douane inclus',
    icon: '🚢',
    cls: 'bg-sky-50 text-sky-700 border border-sky-200',
  },
  {
    id: 'platform_payment',
    label: 'Paiement via plateforme',
    icon: '🔒',
    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
  {
    id: 'identity_protected',
    label: 'Identité fournisseur protégée',
    icon: '🛡',
    cls: 'bg-slate-50 text-slate-700 border border-slate-200',
  },
] as const
