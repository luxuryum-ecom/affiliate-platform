import { describe, it, expect } from 'vitest'
import { buildInvoicePdf, type InvoiceInput } from '@/lib/invoice/pdf'
import { PDFDocument } from 'pdf-lib'

const baseInput: InvoiceInput = {
  orderId: 'a43491d0-1234-5678-9abc-def012345678',
  orderedAtIso: '2026-07-06T10:00:00Z',
  totalAmountMad: 1250.5,
  buyer: {
    fullName: 'Aïcha Benkirane',
    companyName: 'Société Épicerie Générale SARL',
    ice: '001234567000089',
    registreCommerce: 'RC 45231',
    billingAddress: '12 rue de la Liberté, Casablanca',
  },
  lines: [
    {
      label: 'Café moulu premium — sac 1kg',
      detail: 'Palier grossiste · 50 × 22,00 MAD',
      quantity: 50,
      unitPriceMad: 22.0,
      totalMad: 1100.0,
    },
    {
      label: 'Sucre blanc raffiné',
      detail: 'Palier grossiste · 20 × 5,00 MAD',
      quantity: 20,
      unitPriceMad: 5.0,
      totalMad: 100.0,
    },
    {
      label: 'Livraison',
      quantity: null,
      unitPriceMad: null,
      totalMad: 50.5,
    },
  ],
}

describe('buildInvoicePdf', () => {
  it('produit un PDF valide (en-tête %PDF, parsable)', async () => {
    const bytes = await buildInvoicePdf(baseInput)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    // Signature PDF « %PDF »
    expect(bytes[0]).toBe(0x25)
    expect(bytes[1]).toBe(0x50)
    expect(bytes[2]).toBe(0x44)
    expect(bytes[3]).toBe(0x46)
    // Re-parsable par pdf-lib → structure cohérente, 1 page
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toContain('FAC-2026-A43491D0')
  })

  it('ne plante pas sur les accents français et champs acheteur vides', async () => {
    const bytes = await buildInvoicePdf({
      ...baseInput,
      buyer: {
        fullName: null,
        companyName: null,
        ice: null,
        registreCommerce: null,
        billingAddress: null,
      },
    })
    expect(bytes.byteLength).toBeGreaterThan(500)
  })

  it('gère un total à 0 sans plantage', async () => {
    const bytes = await buildInvoicePdf({
      ...baseInput,
      totalAmountMad: 0,
      lines: [{ label: 'Échantillon offert', quantity: 1, unitPriceMad: 0, totalMad: 0 }],
    })
    expect(bytes.byteLength).toBeGreaterThan(500)
  })
})
