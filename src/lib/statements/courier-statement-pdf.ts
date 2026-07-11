// ─── Relevé livreur signable — PDF figé (module Livreurs, Lot F) ─────────────
//
// Preuve papier anti-litige. Rendu À LA VOLÉE depuis le SNAPSHOT FIGÉ
// (courier_statements.snapshot + colonnes soldes, mig 130). Le SOLDE FINAL vient
// du GRAND LIVRE (v_courier_balances) gelé au moment du snapshot — aucun calcul
// ici. Zone de DOUBLE SIGNATURE (livreur + Mozouna). i18n FR/AR/EN + RTL arabe.

import { PDFDocument } from 'pdf-lib'
import { getSellerIdentity } from '@/lib/invoice/config'
import { embedStatementFonts } from './pdf-fonts'
import {
  normalizeStatementLocale,
  isRtl,
  courierLabels,
  fmtMad,
  fmtDate,
  fmtInt,
  type StatementLocale,
} from './pdf-i18n'
import {
  newCtx,
  drawHeader,
  drawStart,
  drawLeft,
  drawRight,
  rowLabelValue,
  sectionTitle,
  hline,
  move,
  saveWithMeta,
  MARGIN,
  MUTED,
  INK,
  GOLD,
  LINE,
  type StatementCtx,
} from './pdf-core'

export interface CourierStatementSnapshot {
  courierName: string
  courierType: string
  companyName: string | null
  period: { start: string; end: string }
  activity: {
    pickups: number
    deliveries: { count: number; cashCollected: number }
    returnsDepot: number
    returnsCompany: number
    losses: { count: number; amount: number }
    cashRemitted: number
  }
  balance: { cashOwed: number; productDebt: number; final: number }
}

export interface CourierStatementMeta {
  generatedAt: string | null
}

export async function buildCourierStatementPdf(
  snapshot: CourierStatementSnapshot,
  meta: CourierStatementMeta,
  localeInput?: string,
): Promise<Uint8Array> {
  const locale: StatementLocale = normalizeStatementLocale(localeInput)
  const rtl = isRtl(locale)
  const L = courierLabels(locale)
  const seller = getSellerIdentity()

  const doc = await PDFDocument.create()
  const fonts = await embedStatementFonts(doc, locale)
  const ctx = newCtx(doc, fonts, rtl)

  drawHeader(ctx, seller.name, L.docTitle)

  // Sous-titre.
  drawStart(ctx, L.subtitle, { size: 8.5, color: MUTED }); move(ctx, 18)

  // Identité livreur + période. On évite de MÊLER arabe et latin dans une même
  // chaîne (la police arabe embarquée n'a pas de glyphes latins) : nom seul en
  // valeur (script dominant), type sur sa propre ligne.
  const courierLine = snapshot.companyName
    ? `${snapshot.courierName} — ${snapshot.companyName}`
    : snapshot.courierName
  rowLabelValue(ctx, L.courier, courierLine); move(ctx, 15)
  rowLabelValue(ctx, L.kind, L.type[snapshot.courierType] ?? snapshot.courierType); move(ctx, 15)
  rowLabelValue(ctx, L.period, `${fmtDate(snapshot.period.start)} — ${fmtDate(snapshot.period.end)}`); move(ctx, 15)
  rowLabelValue(ctx, L.generatedAt, fmtDate(meta.generatedAt)); move(ctx, 18)

  // Section activité.
  sectionTitle(ctx, L.activityTitle)
  const a = snapshot.activity
  rowLabelValue(ctx, L.pickups, fmtInt(a.pickups)); move(ctx, 15)
  rowLabelValue(ctx, L.deliveries, fmtInt(a.deliveries.count)); move(ctx, 15)
  rowLabelValue(ctx, L.cashCollected, fmtMad(a.deliveries.cashCollected)); move(ctx, 15)
  rowLabelValue(ctx, L.returnsDepot, fmtInt(a.returnsDepot)); move(ctx, 15)
  rowLabelValue(ctx, L.returnsCompany, fmtInt(a.returnsCompany)); move(ctx, 15)
  rowLabelValue(ctx, L.losses, `${fmtMad(a.losses.amount)} (${fmtInt(a.losses.count)})`); move(ctx, 15)
  rowLabelValue(ctx, L.cashRemitted, fmtMad(a.cashRemitted)); move(ctx, 20)

  // Section solde (grand livre).
  sectionTitle(ctx, L.balanceTitle)
  const b = snapshot.balance
  rowLabelValue(ctx, L.cashOwed, fmtMad(b.cashOwed)); move(ctx, 15)
  rowLabelValue(ctx, L.productDebt, fmtMad(b.productDebt)); move(ctx, 16)
  hline(ctx, LINE); move(ctx, 16)
  rowLabelValue(ctx, L.finalBalance, fmtMad(b.final), { labelColor: INK, valueBold: true, size: 13 })
  move(ctx, 4)
  hline(ctx, GOLD); move(ctx, 12)
  drawStart(ctx, L.finalHint, { size: 7.5, color: MUTED })

  // Zone de double signature (ancrée au bas de page).
  drawSignatureZone(ctx, L.sigCourier, L.sigCompany, L.sigLine, L.footer)

  return saveWithMeta(doc, L.docTitle)
}

function drawSignatureZone(
  ctx: StatementCtx,
  sigCourier: string,
  sigCompany: string,
  sigLine: string,
  footer: string,
) {
  const midGap = 24
  const half = (ctx.rightX - ctx.leftX - midGap) / 2
  const leftBox = { x: ctx.leftX, w: half }
  const rightBox = { x: ctx.leftX + half + midGap, w: half }

  ctx.y = MARGIN + 96
  // Titres des deux zones (début de lecture de chaque boîte).
  drawLeft(ctx, ctx.rtl ? '' : sigCourier, leftBox.x, { size: 9, bold: true })
  drawLeft(ctx, ctx.rtl ? '' : sigCompany, rightBox.x, { size: 9, bold: true })
  if (ctx.rtl) {
    // En RTL, le livreur (partie « principale ») à droite.
    drawRight(ctx, sigCourier, ctx.rightX, { size: 9, bold: true })
    drawRight(ctx, sigCompany, leftBox.x + leftBox.w, { size: 9, bold: true })
  }
  move(ctx, 42)
  // Lignes de signature.
  ctx.page.drawLine({ start: { x: leftBox.x, y: ctx.y }, end: { x: leftBox.x + leftBox.w, y: ctx.y }, thickness: 0.7, color: INK })
  ctx.page.drawLine({ start: { x: rightBox.x, y: ctx.y }, end: { x: rightBox.x + rightBox.w, y: ctx.y }, thickness: 0.7, color: INK })
  move(ctx, 12)
  if (ctx.rtl) {
    drawRight(ctx, sigLine, ctx.rightX, { size: 7, color: MUTED })
    drawRight(ctx, sigLine, leftBox.x + leftBox.w, { size: 7, color: MUTED })
  } else {
    drawLeft(ctx, sigLine, leftBox.x, { size: 7, color: MUTED })
    drawLeft(ctx, sigLine, rightBox.x, { size: 7, color: MUTED })
  }

  // Pied de page légal.
  ctx.y = MARGIN + 20
  hline(ctx, LINE); move(ctx, 12)
  if (ctx.rtl) drawRight(ctx, footer, ctx.rightX, { size: 7, color: MUTED })
  else drawLeft(ctx, footer, ctx.leftX, { size: 7, color: MUTED })
}
