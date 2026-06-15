import { describe, it, expect } from 'vitest'
import { RATE_REGEX, PERCENT_REGEX, parseRateInput, parsePercentInput } from '@/lib/rate'

// ─── Helpers TAUX (FX) & POURCENTAGE — validation décimale stricte ───────────
// Comme money.ts : aucune valeur ne passe par un flottant à l'écriture ; la
// chaîne validée est renvoyée VERBATIM. Taux ≤ 8 déc (numeric(18,8)), % borné 0–100.

describe('RATE_REGEX', () => {
  it('accepte entiers et décimales 1-8 chiffres', () => {
    for (const ok of ['1', '9.87', '10.84', '9.87654321', '0.00000001', '100000']) {
      expect(RATE_REGEX.test(ok)).toBe(true)
    }
  })
  it('rejette vide, signe, >8 décimales, séparateurs, sci', () => {
    for (const bad of ['', '-5', '9.876543219', '1,5', '1e3', '.5', '1.', ' 5', 'abc']) {
      expect(RATE_REGEX.test(bad)).toBe(false)
    }
  })
})

describe('parseRateInput', () => {
  it('vide / null / undefined → { ok:false } (un taux n’a jamais de défaut)', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(parseRateInput(v)).toEqual({ ok: false, error: 'errors.invalid_rate' })
    }
  })
  it('taux valide → chaîne VERBATIM (zéro parseFloat, précision 8 déc conservée)', () => {
    expect(parseRateInput('  9.87654321  ')).toEqual({ ok: true, value: '9.87654321' })
    expect(parseRateInput('10.84')).toEqual({ ok: true, value: '10.84' })
  })
  it('zéro / négatif / >8 déc / garbage → { ok:false }', () => {
    for (const bad of ['0', '0.0', '-1', '9.876543219', 'abc', '1e3']) {
      expect(parseRateInput(bad)).toEqual({ ok: false, error: 'errors.invalid_rate' })
    }
  })
})

describe('PERCENT_REGEX', () => {
  it('accepte entiers et décimales 1-2 chiffres', () => {
    for (const ok of ['0', '30', '12.5', '33.33', '100']) {
      expect(PERCENT_REGEX.test(ok)).toBe(true)
    }
  })
})

describe('parsePercentInput', () => {
  it('vide → { ok:false } (défaut géré par l’appelant)', () => {
    expect(parsePercentInput('')).toEqual({ ok: false, error: 'errors.invalid_percent' })
    expect(parsePercentInput(undefined)).toEqual({ ok: false, error: 'errors.invalid_percent' })
  })
  it('0 ≤ x ≤ 100, ≤2 déc → chaîne VERBATIM', () => {
    expect(parsePercentInput('30')).toEqual({ ok: true, value: '30' })
    expect(parsePercentInput('  12.50 ')).toEqual({ ok: true, value: '12.50' })
    expect(parsePercentInput('0')).toEqual({ ok: true, value: '0' })
    expect(parsePercentInput('100')).toEqual({ ok: true, value: '100' })
  })
  it('négatif / > 100 / >2 déc / garbage → { ok:false }', () => {
    for (const bad of ['-5', '100.01', '150', '12.345', 'abc']) {
      expect(parsePercentInput(bad)).toEqual({ ok: false, error: 'errors.invalid_percent' })
    }
  })
})
