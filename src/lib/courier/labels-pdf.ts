// ─── Étiquettes de livraison PDF (Lot B module Livreurs) ─────────────────────
//
// Génère une planche A4 d'étiquettes imprimables (2 colonnes) à partir des
// commandes à livrer. Chaque étiquette porte : référence lisible, ville, montant
// COD à encaisser, et un code-barres Code 128 encodant l'ID de la commande (lu
// par le portail /courier/scan). pdf-lib pur JS (sûr serverless Vercel, aucune
// dépendance native). Contenu neutre (pas d'isolat bidi, police WinAnsi).

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import { code128Widths } from './code128'

export interface DeliveryLabel {
  /** ID commande — encodé dans le code-barres (lu au scan). */
  orderId: string
  /** Référence lisible courte (affichée). */
  reference: string
  city: string
  /** Montant COD à encaisser, en MAD (numeric, jamais float recalculé). */
  amountMad: number
}

// Mise en page (points, 1pt = 1/72"). A4 = 595×842.
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 28
const COLS = 2
const ROWS = 5
const LABEL_W = (PAGE_W - 2 * MARGIN) / COLS
const LABEL_H = (PAGE_H - 2 * MARGIN) / ROWS
const MODULE = 0.9 // largeur d'un module du code-barres (pt)
const BARCODE_H = 34

function fmtMad(n: number): string {
  return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' MAD'
}

function drawBarcode(page: PDFPage, data: string, x: number, y: number, maxWidth: number) {
  let widths: number[]
  try {
    widths = code128Widths(data)
  } catch {
    return // donnée non encodable → étiquette sans code-barres (référence lisible reste)
  }
  const totalModules = widths.reduce((s, w) => s + w, 0)
  const mod = Math.min(MODULE, maxWidth / totalModules)
  let cursor = x
  let isBar = true // commence par une barre
  for (const w of widths) {
    const width = w * mod
    if (isBar) {
      page.drawRectangle({ x: cursor, y, width, height: BARCODE_H, color: rgb(0, 0, 0) })
    }
    cursor += width
    isBar = !isBar
  }
}

function drawLabel(page: PDFPage, font: PDFFont, bold: PDFFont, label: DeliveryLabel, col: number, row: number) {
  const x = MARGIN + col * LABEL_W
  const y = PAGE_H - MARGIN - (row + 1) * LABEL_H
  const pad = 10

  // Cadre.
  page.drawRectangle({
    x: x + 3, y: y + 3, width: LABEL_W - 6, height: LABEL_H - 6,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.7,
  })

  // Référence (gras).
  page.drawText(label.reference, { x: x + pad, y: y + LABEL_H - pad - 12, size: 13, font: bold, color: rgb(0, 0, 0) })
  // Ville.
  page.drawText(label.city || '—', { x: x + pad, y: y + LABEL_H - pad - 30, size: 10, font, color: rgb(0.25, 0.25, 0.25) })
  // Montant COD (gras).
  page.drawText(`COD : ${fmtMad(label.amountMad)}`, { x: x + pad, y: y + LABEL_H - pad - 48, size: 12, font: bold, color: rgb(0, 0, 0) })

  // Code-barres Code 128 (ID commande) + texte sous le code.
  drawBarcode(page, label.orderId, x + pad, y + pad + 12, LABEL_W - 2 * pad)
  page.drawText(label.orderId.slice(0, 18), { x: x + pad, y: y + pad, size: 6, font, color: rgb(0.4, 0.4, 0.4) })
}

/** Génère la planche d'étiquettes et retourne les octets PDF. */
export async function buildDeliveryLabelsPdf(labels: DeliveryLabel[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const perPage = COLS * ROWS
  if (labels.length === 0) {
    pdf.addPage([PAGE_W, PAGE_H])
  }
  for (let i = 0; i < labels.length; i++) {
    const idxOnPage = i % perPage
    if (idxOnPage === 0) pdf.addPage([PAGE_W, PAGE_H])
    const page = pdf.getPage(pdf.getPageCount() - 1)
    const col = idxOnPage % COLS
    const row = Math.floor(idxOnPage / COLS)
    drawLabel(page, font, bold, labels[i], col, row)
  }
  return pdf.save()
}
