// ─── Helpers TAUX (FX) & POURCENTAGE — validation décimale stricte ───────────
//
// Séparés de `money.ts` à dessein : un MONTANT vaut ≤ 2 décimales et un champ
// absent vaut '0' ; un TAUX veut la précision DB native (numeric(18,8) → 8 déc)
// et n'a JAMAIS de défaut implicite (> 0 strict) ; une MARGE % est bornée 0–100.
// Mélanger ces contrats dans money.ts brouillerait l'audit money.
//
// Comme money.ts : on ne fait JAMAIS `parseFloat` sur la valeur ; la CHAÎNE
// validée est renvoyée verbatim pour être passée au paramètre `numeric` Postgres.
// Pour un CALCUL, le site dérive `Number(value)` — identique à l'ancien parseFloat
// pour toute chaîne admise (décimale canonique, sans signe/exposant/garbage).

/** Taux de change : décimal strict, 1 à 8 décimales (précision native numeric(18,8)). */
export const RATE_REGEX = /^\d+(\.\d{1,8})?$/

/** Pourcentage : décimal strict, 0 à 2 décimales (la borne 0–100 est vérifiée à part). */
export const PERCENT_REGEX = /^\d+(\.\d{1,2})?$/

export type RateParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

export type PercentParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/**
 * Normalise un TAUX de change saisi.
 * - Vide → `{ ok: false }` (un taux n'a jamais de défaut implicite ; le repli
 *   « taux central » est géré en amont par l'appelant, pas ici).
 * - Sinon : décimal strict ≤ 8 déc ET > 0, renvoyé verbatim (zéro `parseFloat`).
 */
export function parseRateInput(
  raw: FormDataEntryValue | null | undefined,
): RateParseResult {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (s === '') return { ok: false, error: 'errors.invalid_rate' }
  if (!RATE_REGEX.test(s)) return { ok: false, error: 'errors.invalid_rate' }
  if (Number(s) <= 0) return { ok: false, error: 'errors.invalid_rate' }
  return { ok: true, value: s }
}

/**
 * Normalise un POURCENTAGE (marge / commission) saisi.
 * - Vide → `{ ok: false }` (le défaut éventuel est géré par l'appelant).
 * - Sinon : décimal strict ≤ 2 déc, borné 0 ≤ x ≤ 100, renvoyé verbatim.
 *   (Le mode `fixed` — où la valeur est un MONTANT — passe par `parseMoneyInput`.)
 */
export function parsePercentInput(
  raw: FormDataEntryValue | null | undefined,
): PercentParseResult {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (s === '') return { ok: false, error: 'errors.invalid_percent' }
  if (!PERCENT_REGEX.test(s)) return { ok: false, error: 'errors.invalid_percent' }
  const n = Number(s)
  if (n < 0 || n > 100) return { ok: false, error: 'errors.invalid_percent' }
  return { ok: true, value: s }
}
