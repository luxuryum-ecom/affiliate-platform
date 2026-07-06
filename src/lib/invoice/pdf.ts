// ─── Générateur de facture PDF conforme Maroc ────────────────────────────────
//
// Rend une facture A4 mono-page à partir des données de commande. Utilise
// `pdf-lib` (pur JS, sûr en serverless Vercel — aucune dépendance native). Le
// contenu de la facture est en FRANÇAIS : c'est le standard fiscal marocain
// (les mentions légales ICE/RC/IF sont attendues en français). Le déclencheur
// de téléchargement côté UI reste, lui, i18n FR/AR/EN.
//
// Police : Helvetica standard (encodage WinAnsi) → gère les accents français.
// On n'imprime JAMAIS d'isolat bidi (U+2068/2069) ni de caractère hors WinAnsi
// dans le PDF (ils feraient planter l'encodeur) → formateur monétaire dédié
// `fmtMad` SANS isolat.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  toCentimes,
  fromCentimes,
  deriveTotals,
  buildInvoiceNumber,
  type InvoiceLineCentimes,
} from './compute'
import { getSellerIdentity, getVatRatePercent, type SellerIdentity } from './config'

// ── Entrées ──────────────────────────────────────────────────────────────────

export interface InvoiceBuyer {
  fullName: string | null
  companyName: string | null
  ice: string | null
  registreCommerce: string | null
  billingAddress: string | null
}

export interface InvoiceLineInput {
  label: string
  detail?: string
  quantity: number | null
  unitPriceMad: number | null
  totalMad: number
}

export interface InvoiceInput {
  orderId: string
  orderedAtIso: string
  /** Montant TTC réellement facturé (source de vérité). */
  totalAmountMad: number
  buyer: InvoiceBuyer
  lines: InvoiceLineInput[]
}

// ── Formateurs (SANS isolat bidi — sûrs pour WinAnsi) ────────────────────────

function fmtMad(centimes: number): string {
  const n = new Intl.NumberFormat('fr-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCentimes(centimes))
  return `${n} MAD`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// ── Mise en page ─────────────────────────────────────────────────────────────

const A4 = { width: 595.28, height: 841.89 } // points (72 dpi)
const MARGIN = 48
const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.42, 0.42, 0.46)
const LINE = rgb(0.85, 0.85, 0.87)
const GOLD = rgb(0.72, 0.55, 0.13)

/** Coupe un texte à `maxChars` avec « … » — évite tout débordement de colonne. */
function clip(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(0, maxChars - 1)) + '…'
}

interface Ctx {
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
}

function text(
  ctx: Ctx,
  s: string,
  x: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
) {
  const size = opts.size ?? 9
  ctx.page.drawText(s, {
    x,
    y: ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? INK,
  })
}

function textRight(
  ctx: Ctx,
  s: string,
  rightX: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
) {
  const size = opts.size ?? 9
  const font = opts.bold ? ctx.bold : ctx.font
  const w = font.widthOfTextAtSize(s, size)
  text(ctx, s, rightX - w, opts)
}

function hline(ctx: Ctx, x1: number, x2: number, color = LINE) {
  ctx.page.drawLine({
    start: { x: x1, y: ctx.y },
    end: { x: x2, y: ctx.y },
    thickness: 0.7,
    color,
  })
}

/**
 * Construit les octets PDF de la facture.
 *
 * Invariant financier (revu @finance) : le total TTC imprimé est
 * `deriveTotals(toCentimes(totalAmountMad), taux)` → strictement égal au montant
 * facturé. Les lignes sont imprimées telles quelles (TTC) ; le total n'est PAS
 * la somme des lignes mais bien `totalAmountMad`.
 */
export async function buildInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const seller = getSellerIdentity()
  const vatRate = getVatRatePercent()

  const totalTtc = toCentimes(input.totalAmountMad)
  const totals = deriveTotals(totalTtc, vatRate)
  const invoiceNumber = buildInvoiceNumber(input.orderId, input.orderedAtIso)

  const lines: InvoiceLineCentimes[] = input.lines.map((l) => ({
    label: l.label,
    detail: l.detail,
    quantity: l.quantity,
    unitPriceCentimes: l.unitPriceMad != null ? toCentimes(l.unitPriceMad) : null,
    totalCentimes: toCentimes(l.totalMad),
  }))

  const doc = await PDFDocument.create()
  doc.setTitle(`Facture ${invoiceNumber}`)
  doc.setProducer('Mozouna Group')
  const page = doc.addPage([A4.width, A4.height])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { page, font, bold, y: A4.height - MARGIN }

  const rightX = A4.width - MARGIN

  // ── En-tête : vendeur (gauche) + titre FACTURE (droite) ──
  text(ctx, seller.name, MARGIN, { size: 16, bold: true, color: GOLD })
  textRight(ctx, 'FACTURE', rightX, { size: 20, bold: true })
  ctx.y -= 16
  textRight(ctx, `N° ${invoiceNumber}`, rightX, { size: 9, color: MUTED })

  // Lignes légales vendeur (omises si absentes)
  const sellerLines = sellerLegalLines(seller)
  for (const sl of sellerLines) {
    text(ctx, sl, MARGIN, { size: 8, color: MUTED })
    ctx.y -= 11
  }

  // Aligner sous le bloc le plus bas
  ctx.y = Math.min(ctx.y, A4.height - MARGIN - 16 - 12)
  ctx.y -= 6
  textRight(ctx, `Date : ${fmtDate(input.orderedAtIso)}`, rightX, { size: 9, color: MUTED })
  ctx.y -= 14

  hline(ctx, MARGIN, rightX)
  ctx.y -= 22

  // ── Bloc « Facturé à » ──
  text(ctx, 'FACTURÉ À', MARGIN, { size: 8, bold: true, color: MUTED })
  ctx.y -= 14
  const b = input.buyer
  const buyerName = b.companyName || b.fullName || '—'
  text(ctx, clip(buyerName, 60), MARGIN, { size: 11, bold: true })
  ctx.y -= 13
  const buyerLines: string[] = []
  if (b.ice) buyerLines.push(`ICE : ${b.ice}`)
  if (b.registreCommerce) buyerLines.push(`RC : ${b.registreCommerce}`)
  if (b.billingAddress) buyerLines.push(b.billingAddress)
  for (const bl of buyerLines) {
    text(ctx, clip(bl, 90), MARGIN, { size: 9, color: MUTED })
    ctx.y -= 12
  }
  ctx.y -= 12

  // ── Tableau des lignes ──
  // Colonnes : Désignation | Qté | PU TTC | Total TTC
  const colQtyR = rightX - 210
  const colPuR = rightX - 100
  const colTotR = rightX

  // En-tête de tableau
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 4,
    width: rightX - MARGIN,
    height: 18,
    color: rgb(0.97, 0.96, 0.93),
  })
  const headBaseline = ctx.y
  text({ ...ctx, y: headBaseline }, 'Désignation', MARGIN + 6, { size: 8, bold: true, color: MUTED })
  textRight({ ...ctx, y: headBaseline }, 'Qté', colQtyR, { size: 8, bold: true, color: MUTED })
  textRight({ ...ctx, y: headBaseline }, 'P.U. TTC', colPuR, { size: 8, bold: true, color: MUTED })
  textRight({ ...ctx, y: headBaseline }, 'Total TTC', colTotR - 6, { size: 8, bold: true, color: MUTED })
  ctx.y -= 22

  for (const l of lines) {
    text(ctx, clip(l.label, 46), MARGIN + 6, { size: 9 })
    if (l.quantity != null) {
      textRight(ctx, new Intl.NumberFormat('fr-MA').format(l.quantity), colQtyR, { size: 9 })
    }
    if (l.unitPriceCentimes != null) {
      textRight(ctx, fmtMad(l.unitPriceCentimes), colPuR, { size: 9 })
    }
    textRight(ctx, fmtMad(l.totalCentimes), colTotR - 6, { size: 9, bold: true })
    ctx.y -= 12
    if (l.detail) {
      text(ctx, clip(l.detail, 60), MARGIN + 6, { size: 7.5, color: MUTED })
      ctx.y -= 12
    } else {
      ctx.y -= 3
    }
    hline(ctx, MARGIN, rightX, rgb(0.93, 0.93, 0.94))
    ctx.y -= 14
  }

  ctx.y -= 6

  // ── Bloc totaux (aligné à droite) ──
  const totLabelR = colPuR
  const totValR = colTotR - 6

  const drawTotalRow = (label: string, valueCentimes: number, strong = false) => {
    textRight(ctx, label, totLabelR, { size: strong ? 10 : 9, bold: strong, color: strong ? INK : MUTED })
    textRight(ctx, fmtMad(valueCentimes), totValR, { size: strong ? 11 : 9, bold: strong })
    ctx.y -= strong ? 18 : 14
  }

  if (totals.vatRatePercent > 0) {
    drawTotalRow('Total HT', totals.totalHtCentimes)
    drawTotalRow(`TVA ${totals.vatRatePercent} %`, totals.vatCentimes)
    ctx.y -= 2
    hline(ctx, totLabelR - 60, totValR)
    ctx.y -= 14
    drawTotalRow('Total TTC', totals.totalTtcCentimes, true)
  } else {
    // TVA non applicable : total = HT = TTC. On l'affiche comme « Total ».
    drawTotalRow('Total', totals.totalTtcCentimes, true)
    ctx.y -= 2
    text(ctx, 'TVA non applicable.', totLabelR - 60, { size: 7.5, color: MUTED })
    ctx.y -= 14
  }

  // ── Pied de page légal ──
  const footerY = MARGIN + 26
  ctx.y = footerY
  hline(ctx, MARGIN, rightX)
  ctx.y -= 12
  text(
    ctx,
    'Facture émise par voie électronique — Mozouna Group. Conforme à la réglementation fiscale marocaine.',
    MARGIN,
    { size: 7, color: MUTED },
  )
  ctx.y -= 10
  text(ctx, `Référence commande : ${input.orderId.slice(0, 8).toUpperCase()}`, MARGIN, {
    size: 7,
    color: MUTED,
  })

  return doc.save()
}

/** Lignes légales du vendeur, dans l'ordre, en omettant celles absentes. */
function sellerLegalLines(seller: SellerIdentity): string[] {
  const out: string[] = []
  if (seller.legalForm) out.push(seller.legalForm)
  const addr = [seller.address, seller.city].filter(Boolean).join(' — ')
  if (addr) out.push(addr)
  const ids: string[] = []
  if (seller.ice) ids.push(`ICE : ${seller.ice}`)
  if (seller.rc) ids.push(`RC : ${seller.rc}`)
  if (seller.taxId) ids.push(`IF : ${seller.taxId}`)
  if (seller.patente) ids.push(`Patente : ${seller.patente}`)
  if (ids.length) out.push(ids.join('   '))
  const contact = [seller.phone, seller.email].filter(Boolean).join('   ')
  if (contact) out.push(contact)
  return out
}
