// ─── Telegram ingestion — zod schemas + pure sanitizers (testable, no I/O) ───
// Toute donnée entrante (webhook Telegram, sortie IA) est validée ici avant
// d'atteindre la base. Aucune écriture directe non validée (RÈGLE D'OR n°7).

import { z } from 'zod'
import { PRODUCT_CATEGORIES, getSubcategories } from '@/lib/taxonomy'
import { normalizeSaleUnit, type SaleUnit } from '@/lib/units'

// ── 1. Payload webhook Telegram (sous-ensemble consommé) ─────────────────────

export const telegramPhotoSizeSchema = z.object({
  file_id: z.string().min(1),
  file_unique_id: z.string().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  file_size: z.number().int().nonnegative().optional(),
})

export const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
})

export const telegramChatSchema = z.object({
  id: z.number().int(),
  type: z.string().optional(),
})

export const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  from: telegramUserSchema.optional(),
  chat: telegramChatSchema,
  date: z.number().int().optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(telegramPhotoSizeSchema).optional(),
})

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: telegramMessageSchema.optional(),
  edited_message: telegramMessageSchema.optional(),
})

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>
export type TelegramMessage = z.infer<typeof telegramMessageSchema>
export type TelegramPhotoSize = z.infer<typeof telegramPhotoSizeSchema>

/** Clé d'idempotence déterministe d'un message Telegram. */
export function buildMessageKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`
}

/** Telegram trie les tailles par ordre croissant — on prend la plus grande. */
export function pickLargestPhoto(photos: TelegramPhotoSize[]): TelegramPhotoSize | null {
  if (photos.length === 0) return null
  return photos.reduce((best, p) => ((p.file_size ?? 0) >= (best.file_size ?? 0) ? p : best))
}

// ── 2. Sortie brute de l'IA (avant nettoyage) ────────────────────────────────

export const aiExtractionRawSchema = z.object({
  product_name: z.string(),
  category: z.string(),
  subcategory: z.string(),
  description: z.string(),
  // Prix TEL QU'ÉCRIT (devise locale du fournisseur, pas MAD). Nombre, chaîne ou null.
  price: z.union([z.number(), z.string(), z.null()]),
  // Stock et délai (jours). Optionnels/nullable côté schéma (défensif) — l'outil
  // les force en sortie, mais on tolère leur absence sans casser le parse.
  stock_quantity: z.union([z.number(), z.string(), z.null()]).optional(),
  lead_time_days: z.union([z.number(), z.string(), z.null()]).optional(),
  // Unité de vente devinée par l'IA (texte libre FR/AR/darija) — normalisée plus
  // bas via normalizeSaleUnit (P1). Optionnel/nullable : absence = pièce par défaut.
  unit: z.union([z.string(), z.null()]).optional(),
  // Conditionnement DESCRIPTIF (P3) : taille + nom de l'unité de cond.
  // (« carton de 50 boîtes » → pack_size 50, pack_unit « boîte »). Absent → null.
  pack_size: z.union([z.number(), z.string(), z.null()]).optional(),
  pack_unit: z.union([z.string(), z.null()]).optional(),
})

export type AiExtractionRaw = z.infer<typeof aiExtractionRawSchema>

// ── 3. Sanitizers purs ───────────────────────────────────────────────────────

/**
 * @finance — montant SOURCE (devise du fournisseur) extrait d'un texte libre.
 * NB : ce N'EST PAS du MAD — la conversion en MAD se fait à l'ingestion via le
 * taux admin. Les bornes ci-dessous sont des garde-fous de plausibilité sur la
 * valeur source (devises MAD/AED/USD d'ordres de grandeur proches).
 * Garanties : nombre fini, dans [MIN, MAX], arrondi à 2 décimales. Tout cas
 * AMBIGU (séparateurs incohérents, tiret intercalé) → null : on n'invente ni ne
 * tronque JAMAIS un prix. Suggestion en pending_review, jamais le ledger.
 */
const MAX_REASONABLE_PRICE_SOURCE = 1_000_000
// Plancher anti-absurde. Valeur par défaut, ajustable.
const MIN_REASONABLE_PRICE_SOURCE = 1

export function sanitizeExtractedPrice(raw: unknown): number | null {
  let n: number | null
  if (typeof raw === 'number') {
    n = raw
  } else if (typeof raw === 'string') {
    n = parsePriceString(raw)
  } else {
    return null
  }
  if (n === null || !Number.isFinite(n)) return null
  if (n < MIN_REASONABLE_PRICE_SOURCE) return null // inclut négatif et zéro
  if (n > MAX_REASONABLE_PRICE_SOURCE) return null
  return Math.round(n * 100) / 100
}

// Plafonds anti-absurde pour stock (unités) et délai (jours, ~10 ans).
const MAX_STOCK_QUANTITY = 10_000_000
const MAX_LEAD_TIME_DAYS = 3650

/**
 * Entier ≥ 0 extrait d'un texte libre (« stock 50 », « délai 20j », « مخزون 50 »).
 * Garanties : entier, ≥ 0, plafonné. Tout cas douteux (négatif, décimal, NaN,
 * non numérique) → null (on n'invente jamais). Sans impact argent/ledger.
 *
 * NB : contrairement au prix, on NE désambiguïse PAS les séparateurs de milliers
 * (« 1.000 » → 1, pas 1000). Choix assumé : sous-estimation prudente, sans enjeu
 * monétaire, et la fiche reste en pending_review (l'admin corrige si besoin).
 */
export function sanitizeNonNegativeInt(raw: unknown, max: number): number | null {
  let n: number
  if (typeof raw === 'number') {
    n = raw
  } else if (typeof raw === 'string') {
    const cleaned = raw.replace(/\s/g, '').replace(/[^\d.-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
    n = Number(cleaned)
  } else {
    return null
  }
  if (!Number.isFinite(n)) return null
  if (!Number.isInteger(n)) return null // décimal → douteux → null
  if (n < 0) return null
  if (n > max) return null
  return n
}

/** Retire un séparateur de milliers : groupes de 3 chiffres obligatoires. */
function stripThousands(s: string, sep: string): string | null {
  const parts = s.split(sep)
  if (!/^\d{1,3}$/.test(parts[0])) return null
  for (let i = 1; i < parts.length; i++) {
    if (!/^\d{3}$/.test(parts[i])) return null
  }
  return parts.join('')
}

/**
 * Parse une chaîne libre (« 120 dh », « 1.234,56 », « 120,50 ») en nombre.
 * Stratégie : retirer le bruit, isoler un éventuel signe en tête (un seul),
 * désambiguïser séparateur décimal vs milliers. En cas de doute → null.
 */
function parsePriceString(raw: string): number | null {
  let s = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (s === '') return null

  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1)
  }
  if (s.includes('-')) return null // tiret intercalé → ambigu
  if (s === '') return null

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  let normalized: string | null

  if (hasDot && hasComma) {
    // Les deux présents : le DERNIER rencontré est le décimal, l'autre = milliers.
    const decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const thousandSep = decimalSep === '.' ? ',' : '.'
    const lastDec = s.lastIndexOf(decimalSep)
    const intPart = s.slice(0, lastDec)
    const fracPart = s.slice(lastDec + 1)
    // La partie entière ne doit porter QUE des groupes de milliers valides ;
    // la décimale, que des chiffres. Tout reste ambigu → null (jamais tronquer).
    const intGroups = stripThousands(intPart, thousandSep)
    normalized = intGroups !== null && /^\d+$/.test(fracPart) ? `${intGroups}.${fracPart}` : null
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ','
    const parts = s.split(sep)
    if (parts.length === 2) {
      // Un seul séparateur : 3 chiffres après ⇒ milliers ; 1-2 ⇒ décimale.
      normalized = parts[1].length === 3 ? parts[0] + parts[1] : parts[0] + '.' + parts[1]
    } else {
      // Plusieurs occurrences ⇒ milliers, groupes de 3 stricts (sinon null).
      normalized = stripThousands(s, sep)
    }
  } else {
    normalized = s
  }

  if (normalized === null) return null
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const val = parseFloat(normalized)
  return Number.isFinite(val) ? sign * val : null
}

/**
 * Catégorie → toujours une valeur de la taxonomie. Inconnue/vide → 'Autres'.
 * Empêche toute écriture d'une catégorie hors taxonomie.
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return 'Autres'
  const trimmed = raw.trim().toLowerCase()
  const match = PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === trimmed)
  return match ?? 'Autres'
}

/**
 * Sous-catégorie → doit appartenir à la catégorie. Inconnue/vide → ''.
 */
export function normalizeSubcategory(category: string, raw: string | null | undefined): string {
  if (!raw) return ''
  const subs = getSubcategories(category)
  const trimmed = raw.trim().toLowerCase()
  const match = subs.find((s) => s.toLowerCase() === trimmed)
  return match ?? ''
}

// ── 4. Fiche produit nettoyée (prête pour supplier_products) ──────────────────

export type CleanExtraction = {
  product_name: string
  category: string
  subcategory: string
  description: string | null
  /** Prix dans la devise du fournisseur (PAS MAD) — converti plus tard à l'ingestion. */
  price_source: number | null
  stock_quantity: number | null
  lead_time_days: number | null
  /** Unité de VENTE normalisée (enum). Toujours une valeur — 'piece' par défaut. */
  unit: SaleUnit
  /** Conditionnement DESCRIPTIF (P3). null si non détecté ou incomplet. */
  pack_size: number | null
  pack_unit: string | null
}

// Plafond anti-absurde du conditionnement (nb d'unités par lot).
const MAX_PACK_SIZE = 1_000_000

export function buildCleanExtraction(raw: AiExtractionRaw): CleanExtraction {
  const category = normalizeCategory(raw.category)
  return {
    product_name: raw.product_name.trim().slice(0, 200),
    category,
    subcategory: normalizeSubcategory(category, raw.subcategory),
    description: raw.description?.trim() ? raw.description.trim().slice(0, 2000) : null,
    price_source: sanitizeExtractedPrice(raw.price),
    stock_quantity: sanitizeNonNegativeInt(raw.stock_quantity, MAX_STOCK_QUANTITY),
    lead_time_days: sanitizeNonNegativeInt(raw.lead_time_days, MAX_LEAD_TIME_DAYS),
    // Réutilise le helper P1 (FR/AR/darija → enum, inconnu/null → 'piece', jamais d'erreur).
    unit: normalizeSaleUnit(raw.unit),
    ...normalizePack(raw.pack_size, raw.pack_unit),
  }
}

/**
 * Conditionnement DESCRIPTIF (P3) : exige les DEUX (taille ≥ 2 ET nom non vide),
 * sinon { null, null } → aucun conditionnement affiché. Jamais d'erreur.
 */
function normalizePack(
  rawSize: unknown,
  rawUnit: unknown,
): { pack_size: number | null; pack_unit: string | null } {
  const size = sanitizeNonNegativeInt(rawSize, MAX_PACK_SIZE)
  const unit = typeof rawUnit === 'string' && rawUnit.trim() ? rawUnit.trim().slice(0, 40) : null
  // pack_size doit être ≥ 2 (un « lot de 1 » n'a aucun sens) ET avoir un nom d'unité.
  if (size == null || size < 2 || unit == null) return { pack_size: null, pack_unit: null }
  return { pack_size: size, pack_unit: unit }
}

// ── 5. Liaison Telegram — code à usage unique ────────────────────────────────

/** Durée de validité d'un code de liaison généré côté web (minutes). */
export const LINK_CODE_TTL_MINUTES = 30

/** Format attendu d'un code de liaison : 8 caractères base32 (sans 0/1/O/I). */
export const LINK_CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/

export function isValidLinkCodeFormat(code: string): boolean {
  return LINK_CODE_REGEX.test(code.trim().toUpperCase())
}
