import { describe, it, expect } from 'vitest'
import { MONEY_REGEX, moneyStringSchema, parseMoneyInput } from '@/lib/money'

// ─── Helper monétaire (LOT 4.2-B) — validation décimale stricte ──────────────
// Garantie clé (condition @finance C-Z1/C4) : aucune valeur ne passe par un
// flottant. La chaîne validée est renvoyée VERBATIM (exactitude décimale).

describe('MONEY_REGEX', () => {
  it('accepte entiers et décimales 1-2 chiffres', () => {
    for (const ok of ['0', '200', '12.5', '12.50', '07', '1000000', '0.01']) {
      expect(MONEY_REGEX.test(ok)).toBe(true)
    }
  })

  it('rejette vide, signe, séparateurs, >2 décimales, notation sci', () => {
    for (const bad of ['', '-5', '1.', '.5', '1.234', '1,5', '1e3', ' 5', '5 ', 'abc', '+5', 'NaN', 'Infinity']) {
      expect(MONEY_REGEX.test(bad)).toBe(false)
    }
  })
})

describe('parseMoneyInput', () => {
  it('champ absent / vide / null / undefined → "0"', () => {
    expect(parseMoneyInput(undefined)).toEqual({ ok: true, value: '0' })
    expect(parseMoneyInput(null)).toEqual({ ok: true, value: '0' })
    expect(parseMoneyInput('')).toEqual({ ok: true, value: '0' })
    expect(parseMoneyInput('   ')).toEqual({ ok: true, value: '0' })
  })

  it('trim puis renvoie la chaîne validée VERBATIM (zéro parseFloat)', () => {
    expect(parseMoneyInput('  200  ')).toEqual({ ok: true, value: '200' })
    // Pas de normalisation flottante : "12.50" reste "12.50", pas 12.5.
    expect(parseMoneyInput('12.50')).toEqual({ ok: true, value: '12.50' })
    expect(parseMoneyInput('0.01')).toEqual({ ok: true, value: '0.01' })
  })

  it('montant invalide → clé i18n errors.invalid_amount', () => {
    for (const bad of ['-5', '1.234', '1,5', 'abc', '1e3', '1.']) {
      expect(parseMoneyInput(bad)).toEqual({ ok: false, error: 'errors.invalid_amount' })
    }
  })

  it('valeur non-string (File) → traitée comme vide → "0"', () => {
    // FormData.get peut renvoyer un File ; le helper ne doit pas planter.
    const file = new File(['x'], 'x.txt')
    expect(parseMoneyInput(file)).toEqual({ ok: true, value: '0' })
  })
})

describe('moneyStringSchema', () => {
  it('safeParse échoue avec le message clé i18n', () => {
    const r = moneyStringSchema.safeParse('1.234')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('errors.invalid_amount')
  })
})
