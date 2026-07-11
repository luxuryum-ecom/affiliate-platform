// ─── Relevé de paiement affilié — PDF figé (module Livreurs, Lot F) ──────────
//
// Rend le PDF À LA VOLÉE depuis le SNAPSHOT FIGÉ (payout_statements.snapshot, mig
// 130). AUCUN calcul ici : on ne fait qu'afficher des champs déjà gelés au moment
// du paiement (montants issus du grand livre). i18n FR/AR/EN + RTL arabe.

import { PDFDocument } from 'pdf-lib'
import { getSellerIdentity } from '@/lib/invoice/config'
import { embedStatementFonts } from './pdf-fonts'
import {
  normalizeStatementLocale,
  isRtl,
  payoutLabels,
  fmtMad,
  fmtDate,
  type StatementLocale,
} from './pdf-i18n'
import {
  newCtx,
  drawHeader,
  rowLabelValue,
  drawStart,
  drawLeft,
  drawRight,
  hline,
  move,
  ensureSpace,
  clip,
  saveWithMeta,
  MARGIN,
  A4,
  MUTED,
  INK,
  GOLD,
  LINE,
  SOFT,
  type StatementCtx,
} from './pdf-core'

export interface PayoutStatementLine {
  ref: string
  date: string | null
  orderAmount: number
  commission: number
}

export interface PayoutStatementSnapshot {
  affiliateName: string
  paidAt: string | null
  reference: string | null
  paymentMethod: string | null
  notes: string | null
  period: { start: string | null; end: string | null }
  lines: PayoutStatementLine[]
  count: number
  total: number
}

// Colonnes du tableau, en fractions de la largeur de contenu (ordre LOGIQUE :
// [réf, date, montant commande, commission]). Mirroré pour le RTL au rendu.
const COLS = [0.3, 0.22, 0.26, 0.22]

function colBounds(ctx: StatementCtx): { start: number; width: number }[] {
  const w = ctx.rightX - ctx.leftX
  const out: { start: number; width: number }[] = []
  let acc = 0
  for (const frac of COLS) {
    const cw = w * frac
    const logicalStart = acc
    // En RTL, la 1ʳᵉ colonne logique est à droite.
    const x = ctx.rtl ? ctx.rightX - logicalStart - cw : ctx.leftX + logicalStart
    out.push({ start: x, width: cw })
    acc += cw
  }
  return out
}

/** Dessine une cellule : texte aligné au début de lecture dans [start, start+width]. */
function cell(ctx: StatementCtx, s: string, col: { start: number; width: number }, opts: { bold?: boolean; color?: import('pdf-lib').RGB; size?: number } = {}) {
  const pad = 4
  if (ctx.rtl) drawRight(ctx, s, col.start + col.width - pad, opts)
  else drawLeft(ctx, s, col.start + pad, opts)
}

export async function buildPayoutStatementPdf(
  snapshot: PayoutStatementSnapshot,
  localeInput?: string,
): Promise<Uint8Array> {
  const locale: StatementLocale = normalizeStatementLocale(localeInput)
  const rtl = isRtl(locale)
  const L = payoutLabels(locale)
  const seller = getSellerIdentity()

  const doc = await PDFDocument.create()
  const fonts = await embedStatementFonts(doc, locale)
  const ctx = newCtx(doc, fonts, rtl)

  drawHeader(ctx, seller.name, L.docTitle)

  // Bloc identité / méta.
  rowLabelValue(ctx, L.affiliate, snapshot.affiliateName || '—'); move(ctx, 15)
  const period = `${fmtDate(snapshot.period.start)} — ${fmtDate(snapshot.period.end)}`
  rowLabelValue(ctx, L.period, period); move(ctx, 15)
  rowLabelValue(ctx, L.paidAt, fmtDate(snapshot.paidAt)); move(ctx, 15)
  const methodLabel = snapshot.paymentMethod ? (L.methods[snapshot.paymentMethod] ?? snapshot.paymentMethod) : '—'
  rowLabelValue(ctx, L.method, methodLabel); move(ctx, 15)
  if (snapshot.reference) { rowLabelValue(ctx, L.reference, snapshot.reference); move(ctx, 15) }
  move(ctx, 10)

  // En-tête de tableau.
  const cols = colBounds(ctx)
  ctx.page.drawRectangle({ x: ctx.leftX, y: ctx.y - 5, width: ctx.rightX - ctx.leftX, height: 18, color: SOFT })
  cell(ctx, L.colRef, cols[0], { bold: true, size: 8, color: MUTED })
  cell(ctx, L.colDate, cols[1], { bold: true, size: 8, color: MUTED })
  cell(ctx, L.colOrder, cols[2], { bold: true, size: 8, color: MUTED })
  cell(ctx, L.colCommission, cols[3], { bold: true, size: 8, color: MUTED })
  move(ctx, 20)
  hline(ctx, LINE)
  move(ctx, 14)

  if (snapshot.lines.length === 0) {
    drawStart(ctx, L.emptyLines, { size: 9, color: MUTED }); move(ctx, 16)
  }
  for (const ln of snapshot.lines) {
    ensureSpace(ctx, 80)
    const c = colBounds(ctx)
    cell(ctx, clip(ln.ref, 16), c[0], { size: 9 })
    cell(ctx, fmtDate(ln.date), c[1], { size: 9 })
    cell(ctx, fmtMad(ln.orderAmount), c[2], { size: 9 })
    cell(ctx, fmtMad(ln.commission), c[3], { size: 9, bold: true })
    move(ctx, 13)
    hline(ctx, rgbLight()); move(ctx, 13)
  }

  // Total.
  move(ctx, 4)
  rowLabelValue(ctx, L.total, fmtMad(snapshot.total), { labelColor: INK, valueBold: true, size: 11 })
  move(ctx, 2)
  hline(ctx, GOLD)

  // Pied de page.
  drawFooter(ctx, L.footer)

  return saveWithMeta(doc, L.docTitle)
}

function rgbLight() {
  return LINE
}

function drawFooter(ctx: StatementCtx, footer: string) {
  ctx.y = MARGIN + 20
  hline(ctx, LINE)
  move(ctx, 12)
  if (ctx.rtl) drawRight(ctx, footer, ctx.rightX, { size: 7, color: MUTED })
  else drawLeft(ctx, footer, ctx.leftX, { size: 7, color: MUTED })
  void A4
}
