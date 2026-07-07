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

  it('P1 WinAnsi : montant B2B ≥ 1000 MAD + U+202F littéral ne plantent PAS', async () => {
    // Régression du finding @security : Intl.NumberFormat('fr-MA') peut insérer
    // U+202F (narrow no-break space) comme séparateur de milliers → hors WinAnsi
    // → throw. On force AUSSI un U+202F littéral dans un champ texte (indépendant
    // de l'ICU de l'environnement) pour prouver que l'assainisseur le neutralise.
    const bytes = await buildInvoicePdf({
      ...baseInput,
      totalAmountMad: 128450.75,
      buyer: { ...baseInput.buyer, companyName: 'Société Test SARL' },
      lines: [
        { label: 'Lot gros', detail: 'Palier · 1000 × 128,45 MAD', quantity: 1000, unitPriceMad: 128.45, totalMad: 128450.75 },
      ],
    })
    expect(bytes.byteLength).toBeGreaterThan(500)
  })

  it('P1 WinAnsi : raison sociale/adresse en arabe + apostrophe typographique ne plantent PAS', async () => {
    const bytes = await buildInvoicePdf({
      ...baseInput,
      buyer: {
        fullName: 'محمد العلمي',
        companyName: 'شركة الأغذية العامة ش.م.م',
        ice: '001234567000089',
        registreCommerce: 'RC 45231',
        billingAddress: 'شارع الحرية 12، الدار البيضاء — bureau n°3 « l’angle »',
      },
    })
    expect(bytes.byteLength).toBeGreaterThan(500)
  })

  it('réconciliation P1 : lignes qui ne totalisent pas le TTC → PDF valide (ligne Ajustement)', async () => {
    // total facturé 1000, mais lignes = 900 (remise non détaillée) → +100 ajusté.
    const under = await buildInvoicePdf({
      ...baseInput,
      totalAmountMad: 1000,
      lines: [{ label: 'Produit', quantity: 10, unitPriceMad: 90, totalMad: 900 }],
    })
    expect(under.byteLength).toBeGreaterThan(500)
    // Cas inverse : lignes 1100 > total 1000 → ajustement négatif (remise).
    const over = await buildInvoicePdf({
      ...baseInput,
      totalAmountMad: 1000,
      lines: [{ label: 'Produit', quantity: 10, unitPriceMad: 110, totalMad: 1100 }],
    })
    expect(over.byteLength).toBeGreaterThan(500)
  })
})
