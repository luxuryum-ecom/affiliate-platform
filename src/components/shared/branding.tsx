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
        <p className={`${s.name} font-bold text-foreground leading-none`}>Mozouna Group</p>
        <p className={`${s.tagline} text-gold-600 leading-none mt-0.5`}>Plateforme B2B Maroc</p>
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

// Chips catégorie neutralisés (plus d'arc-en-ciel) : fond neutre + accent OR.
const CATEGORY_CHIP = 'bg-surface-2 text-accent-fg border border-line'
const CATEGORY_COLORS: Record<string, string> = {
  'Textile':              CATEGORY_CHIP,
  'Matières premières':   CATEGORY_CHIP,
  'Chaussures':           CATEGORY_CHIP,
  'Cosmétique & hygiène': CATEGORY_CHIP,
  'Alimentaire':          CATEGORY_CHIP,
  'Maison & packaging':   CATEGORY_CHIP,
  'Artisanat':            CATEGORY_CHIP,
  'Autres':               CATEGORY_CHIP,
}

export function CategoryBadge({ category, subcategory, className = '' }: { category?: string; subcategory?: string; className?: string }) {
  if (!category) return null
  const cls = CATEGORY_COLORS[category] ?? CATEGORY_CHIP
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls} ${className}`}>
      {category}
      {subcategory && <span className="opacity-70">· {subcategory}</span>}
    </span>
  )
}

// ─── Supplier type badge ───────────────────────────────────────────────────────

export function SupplierTypeBadge({ type }: { type: 'morocco' | 'international' }) {
  // Type = information neutre (différencié par le drapeau), plus de vert/bleu.
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-surface-2 text-muted border border-line">
      {type === 'morocco' ? '🇲🇦 Fournisseur Maroc' : '🌍 International'}
    </span>
  )
}

// ─── Stock / import badge ──────────────────────────────────────────────────────

export function AvailabilityBadge({ type }: { type: string }) {
  return type === 'local_stock' ? (
    // Stock dispo = SUCCÈS (vert sémantique légitime).
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success-soft text-success-fg border border-success">
      ✓ Stock disponible
    </span>
  ) : (
    // Import/commande = info neutre (plus de violet).
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
      ⏳ Import / Commande
    </span>
  )
}

// ─── Premium badges ────────────────────────────────────────────────────────────

export function VerifiedBadge() {
  // Signal premium → accent OR (signature).
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-300">
      ✓ Vérifié
    </span>
  )
}

export function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-300">
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
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-400">
      ✦ Gold
    </span>
  )
}

export function FastResponseBadge() {
  // Trait premium positif (pas un succès/stock) → accent OR, plus de vert déco.
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-200">
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
  const bg = 'bg-surface-2 border-line' // neutre (plus de vert/bleu) — l'icône différencie
  return (
    <div className={`${dim} ${bg} rounded-lg border flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
  )
}

// ─── Spec chips ────────────────────────────────────────────────────────────────

export function MOQChip({ qty, unit }: { qty: number; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
      MOQ {qty} {unit}
    </span>
  )
}

export function LeadTimeChip({ days }: { days: number }) {
  // Délai = info neutre (plus de bleu).
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
      {days}j
    </span>
  )
}

export function StockChip({ qty, unit }: { qty: number; unit: string }) {
  // Niveau de stock = sémantique : succès / en attente / rupture.
  const cls = qty > 100
    ? 'bg-success-soft text-success-fg border-success'
    : qty > 0
    ? 'bg-warning-soft text-warning-fg border-warning'
    : 'bg-danger-soft text-danger-fg border-danger'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${cls}`}>
      {qty > 0 ? `${qty} ${unit}` : 'Rupture'}
    </span>
  )
}

// ─── Category color lookup (exported for filters) ─────────────────────────────

export { CATEGORY_COLORS, PRODUCT_CATEGORIES }
