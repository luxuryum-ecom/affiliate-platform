// ─── Telegram ingestion — zod schemas + pure sanitizers (testable, no I/O) ───
// Toute donnée entrante (webhook Telegram, sortie IA) est validée ici avant
// d'atteindre la base. Aucune écriture directe non validée (RÈGLE D'OR n°7).

import { z } from 'zod'
import { PRODUCT_CATEGORIES, getSubcategories } from '@/lib/taxonomy'

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

// ── 2. Sortie brute de l'IA (avant nettoyage) ────────────────────────────────

export const aiExtractionRawSchema = z.object({
  product_name: z.string(),
  category: z.string(),
  subcategory: z.string(),
  description: z.string(),
  // L'IA peut renvoyer un nombre, une chaîne (« 120 dh ») ou null.
  price_mad: z.union([z.number(), z.string(), z.null()]),
})

export type AiExtractionRaw = z.infer<typeof aiExtractionRawSchema>

// ── 3. Sanitizers purs ───────────────────────────────────────────────────────

/**
 * @finance — prix suggéré extrait d'un texte libre.
 * Garanties : nombre fini, strictement positif, plafonné, arrondi à 2 décimales
 * via les centimes (pas d'artefact flottant). Tout cas douteux → null (on
 * n'invente JAMAIS un prix). Ce prix n'est qu'une SUGGESTION en file
 * pending_review ; il ne touche aucune écriture du grand livre.
 */
const MAX_REASONABLE_PRICE_MAD = 1_000_000

export function sanitizeExtractedPrice(raw: unknown): number | null {
  let n: number
  if (typeof raw === 'number') {
    n = raw
  } else if (typeof raw === 'string') {
    // Garder chiffres, séparateurs ; virgule décimale → point ; retirer le reste.
    const cleaned = raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')
    if (cleaned === '' || cleaned === '.') return null
    n = parseFloat(cleaned)
  } else {
    return null
  }
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  if (n > MAX_REASONABLE_PRICE_MAD) return null
  // Arrondi monétaire via centimes entiers → numeric(10,2) exact.
  return Math.round(n * 100) / 100
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
  suggested_wholesale_price_mad: number | null
}

export function buildCleanExtraction(raw: AiExtractionRaw): CleanExtraction {
  const category = normalizeCategory(raw.category)
  return {
    product_name: raw.product_name.trim().slice(0, 200),
    category,
    subcategory: normalizeSubcategory(category, raw.subcategory),
    description: raw.description?.trim() ? raw.description.trim().slice(0, 2000) : null,
    suggested_wholesale_price_mad: sanitizeExtractedPrice(raw.price_mad),
  }
}

// ── 5. Liaison Telegram — code à usage unique ────────────────────────────────

/** Durée de validité d'un code de liaison généré côté web (minutes). */
export const LINK_CODE_TTL_MINUTES = 30

/** Format attendu d'un code de liaison : 8 caractères base32 (sans 0/1/O/I). */
export const LINK_CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/

export function isValidLinkCodeFormat(code: string): boolean {
  return LINK_CODE_REGEX.test(code.trim().toUpperCase())
}
