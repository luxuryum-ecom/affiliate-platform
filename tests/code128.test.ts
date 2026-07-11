import { describe, it, expect } from 'vitest'
import { code128Widths, code128TableIsValid } from '@/lib/courier/code128'
import { buildDeliveryLabelsPdf } from '@/lib/courier/labels-pdf'

describe('Code128B encoder (étiquettes livraison Lot B)', () => {
  it('la table canonique est intègre (chaque motif = 11 modules)', () => {
    expect(code128TableIsValid()).toBe(true)
  })

  it('structure : start + data + checksum + stop + terminaison', () => {
    // 'A' = 1 caractère → 4 symboles (Start B, A, checksum, Stop) × 6 largeurs + 2 (terminaison) = 26.
    const w = code128Widths('A')
    expect(w.length).toBe(4 * 6 + 1)
    expect(w.every((x) => x >= 1 && x <= 4)).toBe(true)
  })

  it('longueur cohérente pour un UUID (36 caractères)', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000'
    const w = code128Widths(uuid)
    // (Start + 36 data + checksum + Stop) = 39 symboles × 6 + 2 (terminaison).
    expect(w.length).toBe(39 * 6 + 1)
  })

  it('refuse un caractère hors jeu B', () => {
    expect(() => code128Widths('é')).toThrow()
  })

  it('checksum déterministe (même entrée → même sortie)', () => {
    expect(code128Widths('ORDER-42')).toEqual(code128Widths('ORDER-42'))
  })

  it('la planche d\'étiquettes produit un PDF valide (%PDF)', async () => {
    const bytes = await buildDeliveryLabelsPdf([
      { orderId: '123e4567-e89b-12d3-a456-426614174000', reference: 'ABC12345', city: 'Casablanca', amountMad: 250 },
      { orderId: '223e4567-e89b-12d3-a456-426614174001', reference: 'DEF67890', city: 'Rabat', amountMad: 380.5 },
    ])
    expect(bytes.length).toBeGreaterThan(500)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })
})
