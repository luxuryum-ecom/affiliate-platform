// ─── Helper monétaire — validation décimale stricte (LOT 4.2-B) ──────────────
//
// RÈGLE ARGENT (CLAUDE.md n°4 + condition @finance C-Z1/C4) :
//   On ne fait JAMAIS `parseFloat` sur un montant. Un montant saisi est validé
//   en tant que CHAÎNE décimale stricte, puis transmis TEL QUEL au paramètre
//   `numeric` Postgres (via supabase-js → PostgREST), qui le parse en décimal
//   exact — aucune erreur d'arrondi flottant ne peut s'introduire.
//
//   C'est l'inverse exact de la dette `orders.ts` (parseFloat sur 3 colonnes
//   coût) qu'on ne reproduit PAS ici.
//
// Format accepté : 1+ chiffres, partie décimale optionnelle de 1 à 2 décimales.
//   ✓ "0", "200", "12.5", "12.50", "07"   ✗ "", "-5", "1.", ".5", "1.234", "1,5", "1e3"

import { z } from 'zod'

/** Décimal strict : chiffres entiers + 0 à 2 décimales. Pas de signe ni de séparateur. */
export const MONEY_REGEX = /^\d+(\.\d{1,2})?$/

/**
 * Schéma zod d'un montant MAD exprimé en CHAÎNE décimale exacte.
 * Le message d'erreur est une clé i18n (`errors.invalid_amount`) résolue côté UI.
 */
export const moneyStringSchema = z
  .string()
  .trim()
  .regex(MONEY_REGEX, { message: 'errors.invalid_amount' })

/** Résultat d'une normalisation monétaire : la valeur validée ou une clé d'erreur i18n. */
export type MoneyParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Normalise une saisie monétaire optionnelle issue d'un `FormData`.
 *
 * - Champ absent / vide → `'0'` (un coût non encore saisi vaut zéro).
 * - Sinon : validation décimale stricte ; la CHAÎNE validée est renvoyée
 *   verbatim (zéro `parseFloat`) pour être passée à un paramètre `numeric`.
 *
 * @returns `{ ok: true, value }` avec la chaîne exacte, ou `{ ok: false, error }`
 *          où `error` est une clé i18n (`errors.invalid_amount`).
 */
export function parseMoneyInput(
  raw: FormDataEntryValue | null | undefined,
): MoneyParseResult {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (s === '') return { ok: true, value: '0' }

  const parsed = moneyStringSchema.safeParse(s)
  if (!parsed.success) return { ok: false, error: 'errors.invalid_amount' }

  return { ok: true, value: parsed.data }
}
