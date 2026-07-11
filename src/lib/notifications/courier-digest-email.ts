// ─── Rendu HTML du récap quotidien livreurs (module Livreurs, Lot E) ─────────
//
// Transforme les données de `getCourierDailyDigest()` en email HTML sobre. Zéro
// donnée sensible (aucune marge/coût/prix d'achat) — uniquement des soldes livreur
// (encours, créances, retours en attente) déjà visibles côté admin. Montants en MAD.

import type { CourierDailyDigest } from '@/app/actions/courier-digest'

function fmtMad(n: number): string {
  return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' MAD'
}

// @security P2-1 : échappe le HTML des valeurs texte libre (noms de livreurs) avant
// interpolation dans l'email — un nom contenant « <…> » ne peut pas injecter.
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function section(title: string, body: string): string {
  return `<h2 style="font-size:15px;margin:20px 0 8px;color:#111">${title}</h2>${body}`
}

function empty(msg: string): string {
  return `<p style="color:#888;font-size:13px;margin:4px 0">${msg}</p>`
}

/** Rend le corps HTML du récap. `dateLabel` = date du jour (fournie par l'appelant). */
export function renderCourierDigestEmail(digest: CourierDailyDigest, dateLabel: string): string {
  const returnsPending = digest.returnsPending.length
    ? `<ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#333">${digest.returnsPending
        .map(
          (r) =>
            `<li>Réf <b>${r.orderId.slice(0, 8).toUpperCase()}</b> · ${esc(r.courierName)} · déclaré il y a <b>${r.ageDays} j</b></li>`,
        )
        .join('')}</ul>`
    : empty('Aucun retour en attente de confirmation.')

  const overCap = digest.couriersOverCap.length
    ? `<ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#b00">${digest.couriersOverCap
        .map((c) => `<li><b>${esc(c.name)}</b> : ${fmtMad(c.totalBalanceMad)} / plafond ${fmtMad(c.capMad)}</li>`)
        .join('')}</ul>`
    : empty('Aucun livreur au-dessus du plafond.')

  const nearCap = digest.couriersNearCap.length
    ? `<ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#a60">${digest.couriersNearCap
        .map((c) => `<li>${esc(c.name)} : ${fmtMad(c.totalBalanceMad)} / plafond ${fmtMad(c.capMad)}</li>`)
        .join('')}</ul>`
    : empty('Aucun livreur proche du plafond.')

  const loss = digest.lossDebtsToday.length
    ? `<ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#b00">${digest.lossDebtsToday
        .map((d) => `<li><b>${esc(d.courierName)}</b> : ${fmtMad(d.amountMad)}</li>`)
        .join('')}</ul>`
    : empty('Aucune créance perte aujourd’hui.')

  const pickedUp = digest.pickedUpNotResolved?.[0]?.count ?? 0

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111">
    <h1 style="font-size:18px;margin:0 0 4px">Récap livreurs · ${dateLabel}</h1>
    <p style="color:#888;font-size:12px;margin:0 0 12px">Mozouna — chaîne de garde</p>
    ${section('📦 Retours en attente de confirmation', returnsPending)}
    ${section('🚨 Livreurs au-dessus du plafond', overCap)}
    ${section('⚠️ Livreurs proches du plafond', nearCap)}
    ${section('💸 Créances perte du jour', loss)}
    ${section('🚚 Colis ramassés non encore livrés ni retournés', `<p style="font-size:13px;color:#333;margin:4px 0"><b>${pickedUp}</b> colis en cours.</p>`)}
    ${section('💰 Encours total', `<p style="font-size:15px;font-weight:bold;margin:4px 0">${fmtMad(digest.totalOutstandingMad)}</p>`)}
  </div>`
}
