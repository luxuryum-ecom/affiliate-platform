/**
 * Lot F — Rendu des relevés PDF (affilié + livreur), FR & AR (RTL).
 *
 * Test de RENDU pur (aucune base) : construit les PDF depuis des snapshots figés
 * représentatifs et vérifie qu'ils sont des PDF valides non vides. Écrit aussi les
 * fichiers .pdf dans le dossier de captures pour l'inspection visuelle (FR/AR).
 *
 * Ne touche NI la base NI la prod — purement local, déterministe.
 */
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildPayoutStatementPdf, type PayoutStatementSnapshot } from '@/lib/statements/payout-statement-pdf'
import { buildCourierStatementPdf, type CourierStatementSnapshot } from '@/lib/statements/courier-statement-pdf'

const OUT = join(homedir(), 'Desktop', 'p0-ecrans', 'livreurs-lot-f')

const payoutSnap: PayoutStatementSnapshot = {
  affiliateName: 'Youssef Bennani',
  paidAt: '2026-07-11T10:00:00.000Z',
  reference: 'VIR-2026-0042',
  paymentMethod: 'virement',
  notes: null,
  period: { start: '2026-06-01', end: '2026-06-30' },
  lines: [
    { ref: '2C917AE4', date: '2026-06-03T09:00:00Z', orderAmount: 300, commission: 45 },
    { ref: '9B12FE07', date: '2026-06-12T14:20:00Z', orderAmount: 500, commission: 80 },
    { ref: 'A4E5C1D9', date: '2026-06-25T11:00:00Z', orderAmount: 1250, commission: 175 },
  ],
  count: 3,
  total: 300,
}
// total cohérent avec la somme des commissions (45+80+175 = 300)

const courierSnap: CourierStatementSnapshot = {
  courierName: 'Ahmed El Idrissi',
  courierType: 'personal',
  companyName: null,
  period: { start: '2026-06-01', end: '2026-06-30' },
  activity: {
    pickups: 42,
    deliveries: { count: 38, cashCollected: 15230.5 },
    returnsDepot: 3,
    returnsCompany: 1,
    losses: { count: 1, amount: 120 },
    cashRemitted: 14800,
  },
  balance: { cashOwed: 430.5, productDebt: 120, final: 550.5 },
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF
}

describe('Lot F — rendu relevés PDF', () => {
  mkdirSync(OUT, { recursive: true })

  it('relevé affilié FR + AR (RTL) — PDF valides', async () => {
    for (const loc of ['fr', 'ar', 'en'] as const) {
      const bytes = await buildPayoutStatementPdf(payoutSnap, loc)
      expect(isPdf(bytes)).toBe(true)
      expect(bytes.length).toBeGreaterThan(1000)
      writeFileSync(join(OUT, `releve-affilie-${loc}.pdf`), bytes)
    }
  })

  it('relevé livreur signable FR + AR (RTL) — PDF valides', async () => {
    for (const loc of ['fr', 'ar', 'en'] as const) {
      const bytes = await buildCourierStatementPdf(courierSnap, { generatedAt: '2026-07-11T10:00:00Z' }, loc)
      expect(isPdf(bytes)).toBe(true)
      expect(bytes.length).toBeGreaterThan(1000)
      writeFileSync(join(OUT, `releve-livreur-${loc}.pdf`), bytes)
    }
  })
})
