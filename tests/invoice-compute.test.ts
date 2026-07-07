import { describe, it, expect } from 'vitest'
import {
  toCentimes,
  fromCentimes,
  deriveTotals,
  buildInvoiceNumber,
} from '@/lib/invoice/compute'

// ─── Cœur @finance — le total TTC de la facture DOIT toujours égaler le montant
//     réellement facturé, quel que soit le taux de TVA. HT + TVA = TTC, exact. ──

describe('toCentimes / fromCentimes', () => {
  it('convertit sans erreur de float', () => {
    expect(toCentimes(0)).toBe(0)
    expect(toCentimes(1)).toBe(100)
    expect(toCentimes(12.5)).toBe(1250)
    expect(toCentimes(12.55)).toBe(1255)
    expect(toCentimes(1999.99)).toBe(199999)
    // 0.1 + 0.2 piège classique du float : 30 centimes exacts attendus
    expect(toCentimes(0.3)).toBe(30)
  })

  it('round-trip centimes → mad → centimes', () => {
    for (const c of [0, 1, 99, 100, 1255, 199999, 7]) {
      expect(toCentimes(fromCentimes(c))).toBe(c)
    }
  })
})

describe('deriveTotals — invariant HT + TVA = TTC', () => {
  it('taux 20 % : HT + TVA = TTC exact', () => {
    const t = deriveTotals(120000, 20) // 1200,00 MAD TTC
    expect(t.totalTtcCentimes).toBe(120000)
    expect(t.totalHtCentimes).toBe(100000) // 1000,00
    expect(t.vatCentimes).toBe(20000) // 200,00
    expect(t.totalHtCentimes + t.vatCentimes).toBe(t.totalTtcCentimes)
  })

  it('taux 0 % : total = HT = TTC, TVA nulle', () => {
    const t = deriveTotals(45300, 0)
    expect(t.totalTtcCentimes).toBe(45300)
    expect(t.totalHtCentimes).toBe(45300)
    expect(t.vatCentimes).toBe(0)
    expect(t.vatRatePercent).toBe(0)
  })

  it('l’invariant tient sur des montants arbitraires (aucune dérive d’arrondi)', () => {
    const rates = [7, 10, 14, 20]
    const amounts = [1, 33, 99, 100, 101, 1234, 99999, 100000, 7777, 1] // centimes
    for (const rate of rates) {
      for (const ttc of amounts) {
        const t = deriveTotals(ttc, rate)
        // Le total TTC n'est JAMAIS altéré = montant facturé
        expect(t.totalTtcCentimes).toBe(ttc)
        // HT + TVA reconstitue EXACTEMENT le TTC
        expect(t.totalHtCentimes + t.vatCentimes).toBe(ttc)
        // HT et TVA restent ≥ 0
        expect(t.totalHtCentimes).toBeGreaterThanOrEqual(0)
        expect(t.vatCentimes).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('TTC = 0 → tout à zéro', () => {
    const t = deriveTotals(0, 20)
    expect(t.totalHtCentimes).toBe(0)
    expect(t.vatCentimes).toBe(0)
  })

  it('rejette les entrées invalides', () => {
    expect(() => deriveTotals(-1, 20)).toThrow()
    expect(() => deriveTotals(100.5, 20)).toThrow()
    expect(() => deriveTotals(100, -5)).toThrow()
    expect(() => deriveTotals(100, Number.NaN)).toThrow()
  })

  it('cas où l’arrondi HT force la TVA à absorber 1 centime', () => {
    // 100,01 MAD TTC à 20 % → HT = round(10001/1.2)=8334 ; TVA = 1667 ; somme = 10001
    const t = deriveTotals(10001, 20)
    expect(t.totalHtCentimes).toBe(8334)
    expect(t.vatCentimes).toBe(1667)
    expect(t.totalHtCentimes + t.vatCentimes).toBe(10001)
  })
})

describe('buildInvoiceNumber', () => {
  it('déterministe et lisible', () => {
    const n = buildInvoiceNumber('a43491d0-1234-5678-9abc-def012345678', '2026-07-06T10:00:00Z')
    expect(n).toBe('FAC-2026-A43491D0')
  })

  it('même commande → même numéro (idempotent)', () => {
    const a = buildInvoiceNumber('deadbeef-0000-1111-2222-333344445555', '2025-01-15T00:00:00Z')
    const b = buildInvoiceNumber('deadbeef-0000-1111-2222-333344445555', '2025-01-15T00:00:00Z')
    expect(a).toBe(b)
    expect(a).toBe('FAC-2025-DEADBEEF')
  })
})
