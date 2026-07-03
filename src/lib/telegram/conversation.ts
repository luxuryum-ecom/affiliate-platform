// ─── BRIQUE 3 — Machine à états conversationnelle du bot fournisseur (PURE) ───
// Décide, à partir d'une extraction, CE QUI MANQUE d'important et qu'il faut
// DEMANDER (une question à la fois). Décide aussi comment router une réponse
// texte (prix / paliers / « non »). 100% pur & testable — aucune I/O, aucune DB.
// Réutilise les types d'extraction existants (schema.ts). Le câblage DB + envoi
// des messages est fait par ingest.ts ; ce module ne fait que RAISONNER.

import type { CleanExtraction, SanitizedMoqTier } from './schema'

// Ce que le bot peut attendre d'un fournisseur pour un produit donné.
export type Awaiting = 'price' | 'tiers'

// Délai avant la relance UNIQUE (~1h). Anti-spam : une seule relance.
export const REMINDER_AFTER_MS = 60 * 60 * 1000
// Nombre maximum de « je redemande » sur une réponse inexploitable (1 seule fois).
export const MAX_REASK = 1

/**
 * Décide ce qui manque d'IMPORTANT et qu'il faut demander, à partir d'une
 * extraction (photo+légende OU réponse). L'ordre reflète la priorité métier :
 *  1) le PRIX unitaire (impossible à deviner, critique) ;
 *  2) sinon les PALIERS de gros (si prix connu mais aucun palier).
 * Tout le reste (catégorie, description, unité…) est DEVINÉ par l'IA → jamais
 * demandé. Renvoie null quand le produit est « complet » (prix + au moins l'info
 * paliers tranchée).
 */
export function decideAwaiting(clean: Pick<CleanExtraction, 'price_source' | 'moq_tiers'>): Awaiting | null {
  if (clean.price_source == null) return 'price'
  if (!clean.moq_tiers || clean.moq_tiers.length === 0) return 'tiers'
  return null
}

/**
 * Détecte une réponse NÉGATIVE (« pas de prix de gros ») dans les 4 langues.
 * Utilisé quand on attend les paliers : le fournisseur peut répondre « non ».
 * Tolérant à la ponctuation / casse / diacritiques arabes courants.
 */
export function isNegativeReply(text: string | null | undefined): boolean {
  const t = (text ?? '')
    .trim()
    .toLowerCase()
    // retire ponctuation et diacritiques arabes pour matcher « لا. » etc.
    .replace(/[.!،؛?…]/g, ' ')
    .replace(/[ً-ْ]/g, '')
    .trim()
  if (!t) return false
  // Mots négatifs entiers (évite de matcher « nonante » ou un nom de produit).
  const NEG = new Set([
    // FR
    'non', 'aucun', 'aucune', 'pas', 'rien',
    // EN
    'no', 'none', 'nope', 'nothing',
    // AR fus'ha / darija (translittéré + arabe)
    'la', 'walo', 'makayn', 'makaynch', 'mamkanch',
    'لا', 'كلا', 'والو', 'ماكاين', 'ماكاينش', 'لاشكرا',
  ])
  // Match si le message EST un mot négatif, ou COMMENCE par un (« non merci »,
  // « la choukran », « ماكاين والو »).
  const tokens = t.split(/\s+/)
  return NEG.has(t) || (tokens.length > 0 && NEG.has(tokens[0]))
}

// Résultat de l'interprétation d'une réponse quand on ATTEND le prix.
export type PriceReplyOutcome =
  | { kind: 'got_price'; price: number; tiers: SanitizedMoqTier[] } // prix (± paliers) trouvés
  | { kind: 'unusable' } // rien d'exploitable

/**
 * Interprète l'extraction d'une réponse texte alors qu'on ATTEND le prix.
 * Un prix peut arriver seul (« 250 dh ») ou avec des paliers (« 250, 50=220 »).
 */
export function interpretPriceReply(
  clean: Pick<CleanExtraction, 'price_source' | 'moq_tiers'>,
): PriceReplyOutcome {
  if (clean.price_source != null) {
    return { kind: 'got_price', price: clean.price_source, tiers: clean.moq_tiers ?? [] }
  }
  // Cas « le 1er palier porte le prix » : certains fournisseurs répondent
  // directement « 50 = 220 » → on prend le prix du 1er palier comme prix unitaire.
  const tiers = clean.moq_tiers ?? []
  if (tiers.length > 0 && tiers[0].unit_price != null) {
    return { kind: 'got_price', price: tiers[0].unit_price, tiers }
  }
  return { kind: 'unusable' }
}

// Résultat de l'interprétation d'une réponse quand on ATTEND les paliers.
export type TiersReplyOutcome =
  | { kind: 'declined' } // « non » → pas de paliers, produit finalisé
  | { kind: 'got_tiers'; tiers: SanitizedMoqTier[] } // paliers fournis
  | { kind: 'unusable' } // ni « non » ni paliers exploitables

/**
 * Interprète une réponse alors qu'on ATTEND les paliers de gros.
 * Priorité au « non » explicite ; sinon on prend les paliers extraits ; sinon
 * inexploitable.
 */
export function interpretTiersReply(
  text: string | null | undefined,
  clean: Pick<CleanExtraction, 'moq_tiers'>,
): TiersReplyOutcome {
  if (isNegativeReply(text)) return { kind: 'declined' }
  const tiers = clean.moq_tiers ?? []
  if (tiers.length > 0) return { kind: 'got_tiers', tiers }
  return { kind: 'unusable' }
}

/**
 * Décide, après une réponse INEXPLOITABLE, s'il faut redemander (1 seule fois)
 * ou abandonner (on laisse le produit tel quel en modération, on arrête de
 * solliciter le fournisseur). `currentReask` = valeur AVANT cette réponse.
 */
export function shouldReask(currentReask: number): boolean {
  return currentReask < MAX_REASK
}

/**
 * Une attente est-elle DUE pour la relance unique ? (cron)
 * Vraie si jamais relancée ET la question date de plus de REMINDER_AFTER_MS.
 */
export function isReminderDue(
  row: { reminded_at: string | null; asked_at: string },
  nowMs: number,
): boolean {
  if (row.reminded_at != null) return false
  return nowMs - new Date(row.asked_at).getTime() >= REMINDER_AFTER_MS
}
