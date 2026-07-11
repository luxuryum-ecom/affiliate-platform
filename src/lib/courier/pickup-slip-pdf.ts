// ─── Bordereau de ramassage PDF (Lot D module Livreurs) ──────────────────────
//
// Preuve papier du transfert de garde dépôt → livreur (chaîne de garde). Liste
// des colis remis à un livreur pour une tournée : référence, ville, montant COD,
// valeur COD totale, + zones de signature (salarié dépôt ET livreur = double
// confirmation). pdf-lib pur JS (sûr serverless, aucune dépendance native),
// encodage WinAnsi (aucun isolat bidi), contenu FR (standard opérationnel).

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'

export interface PickupSlipItem {
  reference: string
  city: string
  amountMad: number
}

export interface PickupSlipData {
  courierName: string
  courierType: string
  tourDate: string // YYYY-MM-DD
  items: PickupSlipItem[]
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 40

function fmtMad(n: number): string {
  return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' MAD'
}

function line(page: PDFPage, x1: number, y: number, x2: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) })
}

export async function buildPickupSlipPdf(data: PickupSlipData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  const totalCod = data.items.reduce((s, it) => s + it.amountMad, 0)

  // En-tête.
  page.drawText('Bordereau de ramassage', { x: MARGIN, y: y - 4, size: 18, font: bold, color: rgb(0, 0, 0) })
  y -= 30
  page.drawText(`Livreur : ${data.courierName} (${data.courierType})`, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) })
  y -= 16
  page.drawText(`Date de tournée : ${data.tourDate}`, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) })
  y -= 16
  page.drawText(`Colis : ${data.items.length}   ·   Valeur COD totale : ${fmtMad(totalCod)}`, {
    x: MARGIN, y, size: 11, font: bold, color: rgb(0, 0, 0),
  })
  y -= 22
  line(page, MARGIN, y, PAGE_W - MARGIN)
  y -= 6

  // En-têtes colonnes.
  const cRef = MARGIN, cCity = MARGIN + 150, cCod = PAGE_W - MARGIN - 120
  page.drawText('Référence', { x: cRef, y: y - 10, size: 9, font: bold })
  page.drawText('Ville', { x: cCity, y: y - 10, size: 9, font: bold })
  page.drawText('COD à encaisser', { x: cCod, y: y - 10, size: 9, font: bold })
  y -= 18
  line(page, MARGIN, y, PAGE_W - MARGIN)
  y -= 4

  for (const it of data.items) {
    if (y < 130) {
      page = pdf.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    page.drawText(it.reference, { x: cRef, y: y - 12, size: 9, font })
    page.drawText(it.city || '—', { x: cCity, y: y - 12, size: 9, font })
    page.drawText(fmtMad(it.amountMad), { x: cCod, y: y - 12, size: 9, font })
    y -= 18
    line(page, MARGIN, y, PAGE_W - MARGIN)
  }

  // Zones de signature (double confirmation).
  y = Math.max(y, 120)
  y -= 30
  page.drawText('Salarié dépôt (remise)', { x: MARGIN, y, size: 9, font: bold })
  page.drawText('Livreur (réception)', { x: PAGE_W / 2 + 10, y, size: 9, font: bold })
  y -= 40
  line(page, MARGIN, y, MARGIN + 200)
  line(page, PAGE_W / 2 + 10, y, PAGE_W / 2 + 210)
  y -= 12
  page.drawText('Nom + signature', { x: MARGIN, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) })
  page.drawText('Nom + signature', { x: PAGE_W / 2 + 10, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) })

  return pdf.save()
}
