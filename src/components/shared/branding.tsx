import { getTranslations } from 'next-intl/server'
import { getOriginConfig, TRUST_BADGES, PRODUCT_CATEGORIES, CATEGORY_ICONS as CANONICAL_CATEGORY_ICONS } from '@/lib/taxonomy'

// AFFICHAGE PUR — i18n FR/AR/EN. Ces composants sont des SERVER COMPONENTS (tous leurs
// usages sont des pages serveur) : ils résolvent leurs libellés via getTranslations
// (jamais une fonction `t` passée à un Client Component — règle absolue #2). Les valeurs
// DONNÉE (catégorie, sous-catégorie, qty, unit) ne sont pas traduites ici.

// ─── Mozouna Group Logo ────────────────────────────────────────────────────────

export async function MozounaLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const t = await getTranslations('badges')
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
        <p className={`${s.tagline} text-gold-600 leading-none mt-0.5`}>{t('tagline')}</p>
      </div>
    </div>
  )
}

// ─── Origin badge ──────────────────────────────────────────────────────────────

export async function OriginBadge({ country, className = '' }: { country: string; className?: string }) {
  const t = await getTranslations('badges')
  const config = getOriginConfig(country)
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${config.badgeCls} ${config.textCls} ${className}`}>
      <span>{config.flag}</span>
      <span>{t('originLabel', { country })}</span>
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

// NB: category/subcategory = valeurs DONNÉE de la taxonomie (FR en base, utilisées comme
// clés ailleurs). Leur traduction d'affichage est un chantier taxonomie séparé (cf. Décision 2
// FEUILLE_DE_ROUTE) → non traité ici pour ne rien casser. Composant laissé synchrone.
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

export async function SupplierTypeBadge({ type }: { type: 'morocco' | 'international' }) {
  const t = await getTranslations('badges')
  // Type = information neutre (différencié par le drapeau), plus de vert/bleu.
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-surface-2 text-muted border border-line">
      {type === 'morocco' ? `🇲🇦 ${t('supplierMorocco')}` : `🌍 ${t('supplierInternational')}`}
    </span>
  )
}

// ─── Stock / import badge ──────────────────────────────────────────────────────

export async function AvailabilityBadge({ type }: { type: string }) {
  const t = await getTranslations('badges')
  return type === 'local_stock' ? (
    // Stock dispo = SUCCÈS (vert sémantique légitime).
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success-soft text-success-fg border border-success">
      ✓ {t('stockAvailable')}
    </span>
  ) : (
    // Import/commande = info neutre (plus de violet).
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
      ⏳ {t('importOrder')}
    </span>
  )
}

// ─── Premium badges ────────────────────────────────────────────────────────────

export async function VerifiedBadge() {
  const t = await getTranslations('badges')
  // Signal premium → accent OR (signature).
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-300">
      ✓ {t('verified')}
    </span>
  )
}

export async function FeaturedBadge() {
  const t = await getTranslations('badges')
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-300">
      ★ {t('featured')}
    </span>
  )
}

// ─── Trust badges strip ────────────────────────────────────────────────────────

export async function TrustBadgesStrip() {
  const t = await getTranslations('badges')
  return (
    <div className="flex flex-wrap gap-2">
      {TRUST_BADGES.map((b) => (
        <span key={b.id} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${b.cls}`}>
          <span>{b.icon}</span>
          <span>{t('trustLabel', { id: b.id })}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Gold supplier & fast response badges ─────────────────────────────────────

export function GoldSupplierBadge() {
  // « Gold » = nom de palier universel (non traduit).
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-400">
      ✦ Gold
    </span>
  )
}

export async function FastResponseBadge() {
  const t = await getTranslations('badges')
  // Trait premium positif (pas un succès/stock) → accent OR, plus de vert déco.
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-accent-soft text-accent-fg border border-gold-200">
      ⚡ {t('fastResponse')}
    </span>
  )
}

// ─── Supplier logo block ───────────────────────────────────────────────────────

export function SupplierLogoBlock({
  supplierType,
  category,
  size = 'md',
}: {
  supplierType: 'morocco' | 'international'
  category?: string
  size?: 'sm' | 'md'
}) {
  const icon = (category && CANONICAL_CATEGORY_ICONS[category]) ?? (supplierType === 'morocco' ? '🇲🇦' : '🌍')
  const dim = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-base'
  const bg = 'bg-surface-2 border-line' // neutre (plus de vert/bleu) — l'icône différencie
  return (
    <div className={`${dim} ${bg} rounded-lg border flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
  )
}

// ─── Spec chips ────────────────────────────────────────────────────────────────

export async function MOQChip({ qty, unit }: { qty: number; unit: string }) {
  const t = await getTranslations('badges')
  // unit peut être vide (produits internes) → pas d'espace orphelin.
  const u = unit?.trim()
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
      {t('moq')} {qty}{u ? ` ${u}` : ''}
    </span>
  )
}

export async function LeadTimeChip({ days }: { days: number }) {
  const t = await getTranslations('badges')
  // Délai = info neutre (plus de bleu).
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
      {t('leadTimeDays', { days })}
    </span>
  )
}

export async function StockChip({ qty, unit }: { qty: number; unit: string }) {
  const t = await getTranslations('badges')
  // Niveau de stock = sémantique : succès / en attente / rupture.
  const cls = qty > 100
    ? 'bg-success-soft text-success-fg border-success'
    : qty > 0
    ? 'bg-warning-soft text-warning-fg border-warning'
    : 'bg-danger-soft text-danger-fg border-danger'
  const u = unit?.trim()
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${cls}`}>
      {qty > 0 ? `${qty}${u ? ` ${u}` : ''}` : t('outOfStock')}
    </span>
  )
}

// ─── Category color lookup (exported for filters) ─────────────────────────────

export { CATEGORY_COLORS, PRODUCT_CATEGORIES }
