import type { PlatformMarginType, SupplierProductStatus } from '@/types/database'

export type ModerationFlag = 'approved' | 'review_required' | 'blocked'

/** Columns safe for supplier-facing reads — excludes moderation and admin-internal fields. */
export const SUPPLIER_PRODUCT_SELECT =
  'id, product_name, category, origin_country, min_quantity, suggested_wholesale_price_mad, source_currency, fx_rate_source_to_mad, supplier_type, approval_status, created_at, stock_quantity, stock_mode, stock_quantity_updated_at'

const FORBIDDEN_IN_SUPPLIER_SELECT = [
  'ai_risk_score',
  'moderation_reason',
  'moderation_signals',
  'moderation_flag',
  'admin_notes',
  'supplier_private_notes',
  'platform_margin_type',
  'platform_margin_value',
  'apply_platform_margin',
  'final_wholesale_price_mad',
  'approved_by',
] as const

export function assertSupplierSelectSafe(select: string): void {
  for (const field of FORBIDDEN_IN_SUPPLIER_SELECT) {
    if (select.includes(field)) {
      throw new Error(`Supplier select must not include ${field}`)
    }
  }
}

export type BulkApprovalCheckInput = {
  public_name: string | null
  min_quantity: number
  suggested_wholesale_price_mad: number | null
  supplier_unit_price_usd: number | null
  stock_quantity: number | null
  lead_time_days: number | null
  platform_margin_type: PlatformMarginType | null
  platform_margin_value: number | null
  moq_tier_count: number
}

export function validateSupplierProductReadyForApproval(
  input: BulkApprovalCheckInput,
): { ok: true } | { ok: false; reason: string } {
  const missing: string[] = []
  if (!input.public_name?.trim()) missing.push('nom public')
  if (input.min_quantity < 1) missing.push('MOQ')
  const hasPrice =
    (input.suggested_wholesale_price_mad != null && input.suggested_wholesale_price_mad > 0) ||
    (input.supplier_unit_price_usd != null && input.supplier_unit_price_usd > 0) ||
    input.moq_tier_count > 0
  if (!hasPrice) missing.push('prix')
  if (input.stock_quantity == null && input.lead_time_days == null) {
    missing.push('stock ou délai')
  }
  if (
    !input.platform_margin_type ||
    input.platform_margin_value == null ||
    input.platform_margin_value <= 0
  ) {
    missing.push('marge plateforme')
  }
  if (missing.length === 0) return { ok: true }
  return {
    ok: false,
    reason: `Approbation impossible — manque : ${missing.join(', ')}.`,
  }
}

export type ModerationSignal =
  | 'counterfeit'
  | 'prohibited'
  | 'suspicious'
  | 'incomplete'

export type ModerationInput = {
  product_name: string
  description: string | null
  photos: string[]
  category: string
  min_quantity: number
  stock_quantity: number | null
  lead_time_days: number | null
  suggested_wholesale_price_mad: number | null
  supplier_unit_price_usd: number | null
  moq_tier_count: number
}

export type ModerationResult = {
  moderation_flag: ModerationFlag
  ai_risk_score: number
  moderation_reason: string
  moderation_signals: ModerationSignal[]
}

const COUNTERFEIT_BRANDS = [
  'nike', 'adidas', 'puma', 'reebok', 'louis vuitton', 'gucci', 'prada', 'chanel',
  'hermes', 'dior', 'rolex', 'apple', 'samsung', 'iphone', 'playstation', 'xbox',
  'lacoste', 'zara', 'h&m', 'balenciaga', 'versace', 'armani', 'burberry',
]

const PROHIBITED_TERMS = [
  'arme', 'weapon', 'cannabis', 'cbd', 'drogue', 'cocaine', 'contrefaçon',
  'counterfeit', 'fake brand', 'réplique', 'copie officielle', 'ivory', 'ivoire',
  'tabac', 'cigarette', 'vape nicotine',
]

export function moderateSupplierProduct(input: ModerationInput): ModerationResult {
  const text = [
    input.product_name,
    input.description ?? '',
    input.category,
  ]
    .join(' ')
    .toLowerCase()

  const signals: ModerationSignal[] = []
  let score = 0
  const reasons: string[] = []

  for (const brand of COUNTERFEIT_BRANDS) {
    if (text.includes(brand)) {
      signals.push('counterfeit')
      score = Math.max(score, 85)
      reasons.push(`Marque protégée détectée (« ${brand} »).`)
      break
    }
  }

  for (const term of PROHIBITED_TERMS) {
    if (text.includes(term)) {
      signals.push('prohibited')
      score = Math.max(score, 95)
      reasons.push(`Terme interdit détecté (« ${term} »).`)
      break
    }
  }

  const incomplete: string[] = []
  if (!input.product_name.trim()) incomplete.push('nom produit')
  if (!input.description?.trim()) incomplete.push('description')
  if (input.photos.length === 0) incomplete.push('photos')
  if (!input.category.trim()) incomplete.push('catégorie')
  if (input.min_quantity < 1) incomplete.push('MOQ')
  const hasPrice =
    (input.suggested_wholesale_price_mad != null && input.suggested_wholesale_price_mad > 0) ||
    (input.supplier_unit_price_usd != null && input.supplier_unit_price_usd > 0) ||
    input.moq_tier_count > 0
  if (!hasPrice) incomplete.push('prix ou paliers')
  if (input.stock_quantity == null && input.lead_time_days == null) {
    incomplete.push('stock ou délai')
  }

  if (incomplete.length > 0) {
    signals.push('incomplete')
    score = Math.max(score, 45)
    reasons.push(`Fiche incomplète : ${incomplete.join(', ')}.`)
  }

  if (input.product_name.length < 4) {
    signals.push('suspicious')
    score = Math.max(score, 40)
    reasons.push('Nom de produit trop court.')
  }
  if (
    input.suggested_wholesale_price_mad != null &&
    input.suggested_wholesale_price_mad > 0 &&
    input.suggested_wholesale_price_mad < 5
  ) {
    signals.push('suspicious')
    score = Math.max(score, 50)
    reasons.push('Prix anormalement bas.')
  }

  let moderation_flag: ModerationFlag = 'approved'
  if (signals.includes('prohibited') || signals.includes('counterfeit') || score >= 75) {
    moderation_flag = 'blocked'
  } else if (signals.includes('incomplete') || signals.includes('suspicious') || score >= 30) {
    moderation_flag = 'review_required'
  }

  const moderation_reason =
    reasons.length > 0
      ? reasons.join(' ')
      : 'Contrôles automatiques passés — validation admin requise avant publication.'

  return {
    moderation_flag,
    ai_risk_score: Math.min(100, score),
    moderation_reason,
    moderation_signals: [...new Set(signals)],
  }
}

export const MODERATION_FLAG_LABELS: Record<ModerationFlag, string> = {
  approved: 'OK — file complète',
  review_required: 'Revue requise',
  blocked: 'Bloqué',
}

export const SUPPLIER_PRODUCT_STATUS_BADGES: Record<
  SupplierProductStatus,
  { label: string; cls: string }
> = {
  pending_review: { label: 'En attente de validation', cls: 'bg-warning-soft text-warning-fg' },
  approved: { label: 'Approuvé', cls: 'bg-success-soft text-success-fg' },
  blocked: { label: 'Bloqué', cls: 'bg-danger-soft text-danger-fg' },
}

export const MODERATION_SIGNAL_LABELS: Record<ModerationSignal, string> = {
  counterfeit: 'Marque / contrefaçon',
  prohibited: 'Produit interdit',
  suspicious: 'Anomalie',
  incomplete: 'Fiche incomplète',
}
