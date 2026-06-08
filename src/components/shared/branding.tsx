import { getOriginConfig, TRUST_BADGES, PRODUCT_CATEGORIES } from '@/lib/taxonomy'

// ─── Mozouna Group Logo ────────────────────────────────────────────────────────

export function MozounaLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { monogram: 'w-6 h-6 text-xs', name: 'text-xs', tagline: 'hidden' },
    md: { monogram: 'w-8 h-8 text-sm', name: 'text-sm', tagline: 'text-[10px]' },
    lg: { monogram: 'w-10 h-10 text-base', name: 'text-base', tagline: 'text-xs' },
  }
  const s = sizes[size]

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${s.monogram} rounded-lg bg-ink-900 ring-1 ring-gold-400/60 flex items-center justify-center font-bold text-gold-400 flex-shrink-0`}>
        M
      </div>
      <div>
        <p className={`${s.name} font-bold text-ink-900 leading-none`}>Mozouna Group</p>
        <p className={`${s.tagline} text-gold-700/70 leading-none mt-0.5`}>Plateforme B2B Maroc</p>
      </div>
    </div>
  )
}

// ─── Origin badge ──────────────────────────────────────────────────────────────

export function OriginBadge({ country, className = '' }: { country: string; className?: string }) {
  const config = getOriginConfig(country)
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${config.badgeCls} ${config.textCls} ${className}`}>
      <span>{config.flag}</span>
      <span>{config.label}</span>
    </span>
  )
}

// ─── Category badge ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'Textile':              'bg-pink-50 text-pink-700 border border-pink-200',
  'Matières premières':   'bg-stone-50 text-stone-700 border border-stone-200',
  'Chaussures':           'bg-orange-50 text-orange-700 border border-orange-200',
  'Cosmétique & hygiène': 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200',
  'Alimentaire':          'bg-lime-50 text-lime-700 border border-lime-200',
  'Maison & packaging':   'bg-cyan-50 text-cyan-700 border border-cyan-200',
  'Artisanat':            'bg-amber-50 text-amber-700 border border-amber-200',
  'Autres':               'bg-gray-100 text-gray-600 border border-gray-200',
}

export function CategoryBadge({ category, subcategory, className = '' }: { category?: string; subcategory?: string; className?: string }) {
  if (!category) return null
  const cls = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls} ${className}`}>
      {category}
      {subcategory && <span className="opacity-70">· {subcategory}</span>}
    </span>
  )
}

// ─── Supplier type badge ───────────────────────────────────────────────────────

export function SupplierTypeBadge({ type }: { type: 'morocco' | 'international' }) {
  return type === 'morocco' ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      🇲🇦 Fournisseur Maroc
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
      🌍 International
    </span>
  )
}

// ─── Stock / import badge ──────────────────────────────────────────────────────

export function AvailabilityBadge({ type }: { type: string }) {
  return type === 'local_stock' ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
      ✓ Stock disponible
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
      ⏳ Import / Commande
    </span>
  )
}

// ─── Premium badges ────────────────────────────────────────────────────────────

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-300">
      ✓ Vérifié
    </span>
  )
}

export function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700 border border-indigo-300">
      ★ Vedette
    </span>
  )
}

// ─── Trust badges strip ────────────────────────────────────────────────────────

export function TrustBadgesStrip() {
  return (
    <div className="flex flex-wrap gap-2">
      {TRUST_BADGES.map((b) => (
        <span key={b.id} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${b.cls}`}>
          <span>{b.icon}</span>
          <span>{b.label}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Gold supplier & fast response badges ─────────────────────────────────────

export function GoldSupplierBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-50 text-yellow-700 border border-yellow-300">
      ✦ Gold
    </span>
  )
}

export function FastResponseBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-700 border border-green-300">
      ⚡ Réactif
    </span>
  )
}

// ─── Supplier logo block ───────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  'Textile':              '👗',
  'Matières premières':   '🧱',
  'Chaussures':           '👟',
  'Cosmétique & hygiène': '💄',
  'Alimentaire':          '🥗',
  'Maison & packaging':   '🏠',
  'Artisanat':            '🎨',
}

export function SupplierLogoBlock({
  supplierType,
  category,
  size = 'md',
}: {
  supplierType: 'morocco' | 'international'
  category?: string
  size?: 'sm' | 'md'
}) {
  const icon = (category && CATEGORY_ICONS[category]) ?? (supplierType === 'morocco' ? '🇲🇦' : '🌍')
  const dim = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-base'
  const bg = supplierType === 'morocco' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
  return (
    <div className={`${dim} ${bg} rounded-lg border flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
  )
}

// ─── Spec chips ────────────────────────────────────────────────────────────────

export function MOQChip({ qty, unit }: { qty: number; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
      MOQ {qty} {unit}
    </span>
  )
}

export function LeadTimeChip({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
      {days}j
    </span>
  )
}

export function StockChip({ qty, unit }: { qty: number; unit: string }) {
  const cls = qty > 100
    ? 'bg-green-50 text-green-700 border-green-200'
    : qty > 0
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-600 border-red-200'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${cls}`}>
      {qty > 0 ? `${qty} ${unit}` : 'Rupture'}
    </span>
  )
}

// ─── Category color lookup (exported for filters) ─────────────────────────────

export { CATEGORY_COLORS, PRODUCT_CATEGORIES }
