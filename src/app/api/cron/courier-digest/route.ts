// ─── Cron : récap quotidien livreurs par email (module Livreurs, Lot E) ──────
//
// GET /api/cron/courier-digest — déclenché par un cron (Vercel Cron ou autre)
// une fois le matin. Sécurisé par `CRON_SECRET` (en-tête Authorization: Bearer,
// convention Vercel Cron). Calcule le digest en service_role (pas de session
// admin — la garde est le secret cron), rend l'email HTML et l'envoie à Abdou
// (`COURIER_DIGEST_EMAIL`). Best-effort total : ne casse jamais, renvoie un statut.
//
// Config prod (env, non commité) : CRON_SECRET, COURIER_DIGEST_EMAIL, RESEND_API_KEY,
// EMAIL_FROM. Planification : ajouter à vercel.json un cron sur ce chemin (ex. 07:00).

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Comparaison à temps constant (@security P2-2) — évite un vecteur de timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
import { computeCourierDigest } from '@/app/actions/courier-digest'
import { renderCourierDigestEmail } from '@/lib/notifications/courier-digest-email'
import { sendEmail } from '@/lib/email/send'

export async function GET(request: Request) {
  // Garde : secret cron (Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>`).
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, reason: 'cron_not_configured' }, { status: 503 })
  const auth = request.headers.get('authorization') ?? ''
  if (!safeEqual(auth, `Bearer ${secret}`)) return new NextResponse('Unauthorized', { status: 401 })

  const to = process.env.COURIER_DIGEST_EMAIL
  if (!to) return NextResponse.json({ ok: false, reason: 'no_recipient' }, { status: 200 })

  const { error, digest } = await computeCourierDigest(createAdminClient())
  if (error || !digest) {
    return NextResponse.json({ ok: false, reason: error ?? 'digest_error' }, { status: 200 })
  }

  const dateLabel = new Date().toISOString().slice(0, 10)
  const html = renderCourierDigestEmail(digest, dateLabel)
  const res = await sendEmail({ to, subject: `Récap livreurs · ${dateLabel}`, html })

  return NextResponse.json({
    ok: res.sent,
    reason: res.reason,
    counts: {
      returnsPending: digest.returnsPending.length,
      overCap: digest.couriersOverCap.length,
      lossToday: digest.lossDebtsToday.length,
    },
  })
}
