// ─── BRIQUE 3 — Machine à états conversationnelle du bot fournisseur (PURE) ───
// Décide, à partir d'une extraction, CE QUI MANQUE d'important et qu'il faut
// DEMANDER (une question à la fois). Décide aussi comment router une réponse
// texte (prix / paliers / « non »). 100% pur & testable — aucune I/O, aucune DB.
// Réutilise les types d'extraction existants (schema.ts). Le câblage DB + envoi
// des messages est fait par ingest.ts ; ce module ne fait que RAISONNER.

import type { CleanExtraction, SanitizedMoqTier } from './schema'
import { matchKnownSaleUnit } from '@/lib/units'

// Ce que le bot peut attendre d'un fournisseur pour un produit donné.
// 'unit' (C1a) = confirmation de l'unité de vente détectée par l'IA.
export type Awaiting = 'price' | 'tiers' | 'unit'

// Délai avant la relance UNIQUE (~1h). Anti-spam : une seule relance.
export const REMINDER_AFTER_MS = 60 * 60 * 1000
// Nombre maximum de « je redemande » sur une réponse inexploitable (1 seule fois).
export const MAX_REASK = 1

/**
 * Décide ce qui manque d'IMPORTANT et qu'il faut demander depuis une extraction
 * photo. SEUL le PRIX est obligatoire (impossible à deviner). Les paliers sont
 * FACULTATIFS : on ne les demande PLUS en relance — le fournisseur les donne (ou
 * non) dans sa réponse, tout d'un coup (fini le ping-pong). Prix présent → produit
 * complet (avec ou sans paliers). Tout le reste (catégorie, description, unité) est
 * deviné par l'IA. NB : `moq_tiers` gardé dans la signature pour compat d'appel.
 */
export function decideAwaiting(clean: Pick<CleanExtraction, 'price_source' | 'moq_tiers'>): Awaiting | null {
  if (clean.price_source == null) return 'price'
  return null
}

/**
 * Détecte une réponse de CONFUSION (« je ne comprends pas », « ? », « kifach »…)
 * dans les 4 langues → on ré-explique simplement. Distinct de « je ne sais pas »
 * (le fournisseur ignore le prix), qui reste une réponse inexploitable ordinaire.
 */
export function isConfusedReply(text: string | null | undefined): boolean {
  const t = (text ?? '').trim().toLowerCase().replace(/[ً-ْ]/g, '')
  if (!t) return false
  // Question nue (« ? » / « ؟ ») = confusion.
  if (/^[?؟]+$/.test(t)) return true
  const NEEDLES = [
    // FR
    'comprends pas', 'compris pas', 'comprend pas', 'pas compris', 'comment ça marche', 'comment ca marche', 'je comprends rien',
    // EN
    "don't understand", 'dont understand', "don't get", 'how does', 'how do i', 'what do you mean',
    // darija translittéré
    'mafhemtch', 'mafhamtch', 'ma fhemtch', 'kifach', 'kifash', 'chnahwa', 'chno',
    // arabe / darija
    'مافهمتش', 'ما فهمتش', 'ما فهمت', 'لم أفهم', 'كيفاش', 'كيفية', 'شنو', 'شنهي',
  ]
  return NEEDLES.some((n) => t.includes(n))
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
  | { kind: 'got_tiers'; tiers: SanitizedMoqTier[] } // paliers fournis (1 à 3)
  | { kind: 'bare_price'; price: number } // prix sans quantité (« 140 ») → demander la quantité
  | { kind: 'unusable' } // ni « non » ni prix/paliers exploitables

/**
 * Interprète une réponse alors qu'on ATTEND les paliers de gros.
 * Ordre : « non » explicite → paliers extraits (1 à 3, tous acceptés) → prix nu
 * sans quantité (on demandera la quantité) → inexploitable.
 */
export function interpretTiersReply(
  text: string | null | undefined,
  clean: Pick<CleanExtraction, 'price_source' | 'moq_tiers'>,
): TiersReplyOutcome {
  if (isNegativeReply(text)) return { kind: 'declined' }
  const tiers = clean.moq_tiers ?? []
  if (tiers.length > 0) return { kind: 'got_tiers', tiers }
  // Prix seul sans quantité rattachée (« 140 ») → il manque la quantité minimum.
  if (clean.price_source != null) return { kind: 'bare_price', price: clean.price_source }
  return { kind: 'unusable' }
}

/**
 * Détecte une réponse AFFIRMATIVE (« oui, c'est ça ») dans les 4 langues — utilisé
 * quand on demande de CONFIRMER l'unité détectée. Tolérant ponctuation/casse/diacritiques.
 */
export function isAffirmativeReply(text: string | null | undefined): boolean {
  const t = (text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.!،؛?…]/g, ' ')
    .replace(/[ً-ْ]/g, '')
    .trim()
  if (!t) return false
  const YES = new Set([
    // FR
    'oui', 'ouais', 'exact', 'exactement', 'voila', 'voilà', 'ok', 'okay', 'daccord', "d'accord", 'cest ca', "c'est ca", "c'est ça", 'cest ça',
    // EN
    'yes', 'yep', 'yeah', 'yup', 'correct', 'right',
    // AR fus'ha / darija (translittéré + arabe)
    'na3am', 'ah', 'aywa', 'wah', 'hakka', 'sahih', 'mzian', 'tamam',
    'نعم', 'اجل', 'أجل', 'ايه', 'أيوه', 'ايوا', 'واه', 'هاكا', 'هاكاك', 'بالضبط', 'صحيح', 'مزيان', 'تمام',
  ])
  const tokens = t.split(/\s+/)
  return YES.has(t) || (tokens.length > 0 && YES.has(tokens[0]))
}

// Résultat de l'interprétation d'une réponse quand on CONFIRME l'unité de vente.
export type UnitReplyOutcome =
  | { kind: 'confirmed' } // « oui » → on garde l'unité proposée
  | { kind: 'corrected'; unit: string } // le fournisseur écrit la bonne unité (texte libre)
  | { kind: 'confused' } // « je comprends pas » → ré-expliquer
  | { kind: 'unusable' } // ni « oui » ni unité exploitable → redemander

/**
 * Interprète une réponse alors qu'on demande de CONFIRMER l'unité de vente détectée.
 * Ordre : confusion → affirmation (« oui ») → unité écrite (connue → canonique ;
 * libre → verbatim « botte »). Une négation SEULE (« non ») sans unité, ou une phrase
 * trop verbeuse (> 2 mots sans unité connue) → inexploitable (on redemande d'écrire l'unité).
 * L'unité corrigée n'est JAMAIS écrasée vers 'piece' — le libre reste libre (C1a).
 */
export function interpretUnitReply(text: string | null | undefined): UnitReplyOutcome {
  if (isConfusedReply(text)) return { kind: 'confused' }
  if (isAffirmativeReply(text)) return { kind: 'confirmed' }
  const tokens = (text ?? '')
    .replace(/[.!؟?…،؛«»"']/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return { kind: 'unusable' }
  const last = tokens[tokens.length - 1].slice(0, 40)
  // Unité CONNUE (dernier mot, ou la phrase entière : « au kilo » → kg) → forme canonique.
  const known = matchKnownSaleUnit(last) ?? matchKnownSaleUnit(text)
  if (known) return { kind: 'corrected', unit: known }
  // « non » seul (sans unité reconnaissable) → on ne sait pas laquelle → redemander.
  if (isNegativeReply(text)) return { kind: 'unusable' }
  // Texte LIBRE inconnu (« botte », « sachet ») : accepté SEULEMENT si réponse courte
  // (≤ 2 mots). Au-delà = phrase ambiguë → on redemande (évite de stocker du bruit).
  if (tokens.length <= 2) return { kind: 'corrected', unit: last }
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
