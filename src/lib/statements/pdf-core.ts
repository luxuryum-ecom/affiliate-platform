// ─── Primitives PDF communes aux relevés (module Livreurs, Lot F) ────────────
//
// Contexte de dessin conscient de la DIRECTION (LTR pour FR/EN, RTL pour AR). Les
// libellés se posent au « début de lecture » (gauche en LTR, droite en RTL) et les
// valeurs à la « fin de lecture ». Thème 🔒 encre & or (calque invoice/pdf.ts).
// Aucune chaîne n'est dessinée sans passer par fonts.prep() (WinAnsi ou façonnage AR).

import { PDFDocument, rgb, type PDFPage, type RGB } from 'pdf-lib'
import { type StatementFonts } from './pdf-fonts'

export const A4 = { width: 595.28, height: 841.89 }
export const MARGIN = 48

export const INK: RGB = rgb(0.09, 0.09, 0.11)
export const MUTED: RGB = rgb(0.42, 0.42, 0.46)
export const LINE: RGB = rgb(0.85, 0.85, 0.87)
export const GOLD: RGB = rgb(0.72, 0.55, 0.13)
export const SOFT: RGB = rgb(0.97, 0.96, 0.93)

export interface StatementCtx {
  doc: PDFDocument
  page: PDFPage
  fonts: StatementFonts
  rtl: boolean
  y: number
  leftX: number
  rightX: number
}

export function newCtx(
  doc: PDFDocument,
  fonts: StatementFonts,
  rtl: boolean,
): StatementCtx {
  const page = doc.addPage([A4.width, A4.height])
  return { doc, page, fonts, rtl, y: A4.height - MARGIN, leftX: MARGIN, rightX: A4.width - MARGIN }
}

interface TextOpts {
  size?: number
  bold?: boolean
  color?: RGB
}

/** Largeur mesurée sur la chaîne PRÉPARÉE avec la police RÉELLEMENT utilisée. */
export function widthOf(ctx: StatementCtx, s: string, opts: TextOpts = {}): number {
  const { font, text } = ctx.fonts.pick(s, opts.bold)
  return font.widthOfTextAtSize(text, opts.size ?? 9)
}

/** Dessine `s` avec son bord GAUCHE à `x`, à la ligne courante (ctx.y). */
export function drawLeft(ctx: StatementCtx, s: string, x: number, opts: TextOpts = {}) {
  const { font, text } = ctx.fonts.pick(s, opts.bold)
  ctx.page.drawText(text, {
    x,
    y: ctx.y,
    size: opts.size ?? 9,
    font,
    color: opts.color ?? INK,
  })
}

/** Dessine `s` avec son bord DROIT à `rightX`, à la ligne courante. */
export function drawRight(ctx: StatementCtx, s: string, rightX: number, opts: TextOpts = {}) {
  drawLeft(ctx, s, rightX - widthOf(ctx, s, opts), opts)
}

/** Pose `s` au DÉBUT de lecture (gauche en LTR, droite en RTL). */
export function drawStart(ctx: StatementCtx, s: string, opts: TextOpts = {}) {
  if (ctx.rtl) drawRight(ctx, s, ctx.rightX, opts)
  else drawLeft(ctx, s, ctx.leftX, opts)
}

/** Pose `s` à la FIN de lecture (droite en LTR, gauche en RTL). */
export function drawEnd(ctx: StatementCtx, s: string, opts: TextOpts = {}) {
  if (ctx.rtl) drawLeft(ctx, s, ctx.leftX, opts)
  else drawRight(ctx, s, ctx.rightX, opts)
}

/** Ligne « libellé … valeur » : libellé au début de lecture, valeur à la fin. */
export function rowLabelValue(
  ctx: StatementCtx,
  label: string,
  value: string,
  opts: { labelColor?: RGB; valueBold?: boolean; size?: number } = {},
) {
  drawStart(ctx, label, { size: opts.size ?? 9, color: opts.labelColor ?? MUTED })
  drawEnd(ctx, value, { size: opts.size ?? 9, bold: opts.valueBold ?? true })
}

export function hline(ctx: StatementCtx, color: RGB = LINE, x1 = ctx.leftX, x2 = ctx.rightX) {
  ctx.page.drawLine({ start: { x: x1, y: ctx.y }, end: { x: x2, y: ctx.y }, thickness: 0.7, color })
}

export function move(ctx: StatementCtx, dy: number) {
  ctx.y -= dy
}

/** Nouvelle page si la place restante est insuffisante (< min). */
export function ensureSpace(ctx: StatementCtx, min: number) {
  if (ctx.y < MARGIN + min) {
    ctx.page = ctx.doc.addPage([A4.width, A4.height])
    ctx.y = A4.height - MARGIN
  }
}

/** Coupe un texte à `maxChars` avec « … ». */
export function clip(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(0, maxChars - 1)) + '…'
}

/**
 * En-tête commun : nom émetteur (or) au début de lecture + titre du document à la
 * fin de lecture. Renvoie après avoir tracé un filet séparateur.
 */
export function drawHeader(ctx: StatementCtx, sellerName: string, docTitle: string) {
  drawStart(ctx, sellerName, { size: 16, bold: true, color: GOLD })
  drawEnd(ctx, docTitle, { size: 16, bold: true, color: INK })
  move(ctx, 18)
  hline(ctx)
  move(ctx, 20)
}

/** Bandeau de section (fond doux + titre). */
export function sectionTitle(ctx: StatementCtx, title: string) {
  ctx.page.drawRectangle({
    x: ctx.leftX,
    y: ctx.y - 5,
    width: ctx.rightX - ctx.leftX,
    height: 18,
    color: SOFT,
  })
  const pad = 6
  if (ctx.rtl) drawRight(ctx, title, ctx.rightX - pad, { size: 9, bold: true, color: INK })
  else drawLeft(ctx, title, ctx.leftX + pad, { size: 9, bold: true, color: INK })
  move(ctx, 26)
}

export async function saveWithMeta(doc: PDFDocument, title: string): Promise<Uint8Array> {
  doc.setTitle(title)
  doc.setProducer('Mozouna Group')
  return doc.save()
}
