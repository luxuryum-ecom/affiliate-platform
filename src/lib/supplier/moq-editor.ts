// ─── LOT 4 — Éditeur MOQ + paliers dégressifs en modération admin ─────────────
// Logique PURE (sans DB, sans 'use server') du parsing et du JUGEMENT des paliers
// édités par l'admin à la modération. Extraite de supplier-products.ts pour être
// unit-testable ET relisible en isolation (@finance). Aucune écriture ici.
//
// RÈGLES GRAVÉES :
//  - Le SEUL juge de l'échelle des paliers (décroissance/doublon/MOQ) est
//    `sanitizeMoqTiers` (Lot 1). On NE réécrit AUCUNE validation d'échelle.
//  - RÈGLE ARGENT n°4 — le prix reste une CHAÎNE décimale (money.ts), passée
//    VERBATIM : zéro parseFloat, zéro reconversion pour la valeur stockée.
//  - Palier OPTIONNEL : set vide = vente au prix unitaire (pas d'erreur).

import { sanitizeMoqTiers, type SanitizedMoqTier } from '@/lib/telegram/schema'
import { parseMoneyInput } from '@/lib/money'

// Parité stricte avec le sanitizer (schema.ts MAX_MOQ_TIERS = 20).
export const MAX_MOQ_TIERS_FORM = 20

/** Palier édité : quantité seuil + prix VERBATIM (devise source du fournisseur). */
export type EditedTier = { min_quantity: number; unit_price_usd: string }

export type ParsedMoqEditor = {
  editorPresent: boolean
  editedMoq: number | null
  editedTiers: EditedTier[]
}

/**
 * Lit l'éditeur MOQ + paliers depuis le FormData de la modération.
 *
 * L'éditeur n'agit QUE si le drapeau caché `moq_editor_present === '1'` est posé :
 * un poster sans éditeur (test, autre appelant) → editorPresent=false, aucune
 * édition (le serveur ne déclenchera aucun delete → zéro wipe).
 *
 * Lit N paliers DYNAMIQUES via `moq_tier_count` puis `tier_{i}_qty` / `tier_{i}_price`
 * (contrairement à la boucle 1..4 du flux web qui tronque au-delà de 4).
 *  - ligne entièrement vide (qty ET prix vides) → slot ignoré ;
 *  - ligne partielle/invalide → ERREUR (on ne DROP jamais la saisie délibérée) ;
 *  - MOQ vide → null (inchangé) ; MOQ non entier ≥ 1 → erreur.
 */
export function parseMoqEditorForm(
  formData: FormData,
): { ok: true; value: ParsedMoqEditor } | { ok: false; error: string } {
  const editorPresent = formData.get('moq_editor_present') === '1'
  if (!editorPresent) {
    return { ok: true, value: { editorPresent: false, editedMoq: null, editedTiers: [] } }
  }

  const moqRaw = ((formData.get('min_quantity') as string) ?? '').trim()
  let editedMoq: number | null = null
  if (moqRaw !== '') {
    if (!/^\d+$/.test(moqRaw) || parseInt(moqRaw, 10) < 1) return { ok: false, error: 'moqInvalid' }
    editedMoq = parseInt(moqRaw, 10)
  }

  const countRaw = parseInt(formData.get('moq_tier_count') as string, 10)
  const count = Number.isFinite(countRaw)
    ? Math.min(Math.max(countRaw, 0), MAX_MOQ_TIERS_FORM)
    : 0
  const editedTiers: EditedTier[] = []
  for (let i = 0; i < count; i++) {
    const qtyRaw = ((formData.get(`tier_${i}_qty`) as string) ?? '').trim()
    const priceRaw = ((formData.get(`tier_${i}_price`) as string) ?? '').trim()
    if (qtyRaw === '' && priceRaw === '') continue // slot d'éditeur non rempli
    const priceR = parseMoneyInput(priceRaw)
    if (
      !/^\d+$/.test(qtyRaw) ||
      parseInt(qtyRaw, 10) <= 0 ||
      !priceR.ok ||
      /^0+(\.0+)?$/.test(priceR.value)
    ) {
      return { ok: false, error: 'moqRowInvalid' }
    }
    editedTiers.push({ min_quantity: parseInt(qtyRaw, 10), unit_price_usd: priceR.value })
  }

  return { ok: true, value: { editorPresent: true, editedMoq, editedTiers } }
}

export type JudgeInput = {
  editedMoq: number | null
  existingMoq: number
  editedTiers: EditedTier[]
  /** Prix de base en devise SOURCE (supplier_products.price_source) ou null. */
  basePriceSource: number | null
}

export type JudgeResult =
  | { ok: false; error: string }
  | {
      ok: true
      effectiveMoq: number
      /** Paliers VERBATIM prêts à insérer (vide = pas de palier, prix unitaire). */
      tiersToInsert: EditedTier[]
      /** Flag @finance INFORMATIF (non bloquant) : base < prix du 1er palier. */
      priceBaseBelowFirstTier: boolean
    }

/**
 * JUGE les paliers édités via `sanitizeMoqTiers` (le seul juge) et prépare le set à
 * insérer. AUCUNE écriture ici — l'appelant décide (rejet AVANT tout write).
 *
 *  - set vide → OK (palier optionnel : retour au prix unitaire) ;
 *  - échelle invalide (non décroissante, doublon, aberrante) OU une ligne écartée
 *    par une borne du juge → rejet EN BLOC (jamais de perte silencieuse) ;
 *  - 1er palier ≠ MOQ effectif (édité sinon existant) → rejet (règle métier Abdou) ;
 *  - flag informatif si base (devise source) < prix du 1er palier (décision #2).
 */
export function judgeEditedTiers(input: JudgeInput): JudgeResult {
  const effectiveMoq = input.editedMoq ?? input.existingMoq
  if (input.editedTiers.length === 0) {
    return { ok: true, effectiveMoq, tiersToInsert: [], priceBaseBelowFirstTier: false }
  }

  // basePrice = null : le cross-check « 1er palier == base » du sanitizer est
  // REMPLACÉ par le flag informatif @finance (décision #2). Le juge coerce les prix
  // VERBATIM en nombre uniquement pour vérifier l'échelle.
  const sanitized: SanitizedMoqTier[] = sanitizeMoqTiers(
    input.editedTiers.map((t) => ({ min_quantity: t.min_quantity, unit_price: t.unit_price_usd })),
    null,
  )
  if (sanitized.length === 0 || sanitized.length !== input.editedTiers.length) {
    return { ok: false, error: 'moqTiersRejected' }
  }
  if (sanitized[0].min_quantity !== effectiveMoq) {
    return { ok: false, error: 'moqFirstTierMismatch' }
  }

  // Ré-associe le prix VERBATIM (string) par min_quantity (unique : le juge rejette
  // les doublons) → INSERT verbatim, zéro parseFloat.
  const priceByQty = new Map(input.editedTiers.map((t) => [t.min_quantity, t.unit_price_usd]))
  const tiersToInsert: EditedTier[] = sanitized.map((s) => ({
    min_quantity: s.min_quantity,
    unit_price_usd: priceByQty.get(s.min_quantity) as string,
  }))

  const priceBaseBelowFirstTier =
    input.basePriceSource != null && input.basePriceSource < sanitized[0].unit_price

  return { ok: true, effectiveMoq, tiersToInsert, priceBaseBelowFirstTier }
}
