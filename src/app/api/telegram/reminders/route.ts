// ─── Cron — relance des produits Telegram en attente d'info (BRIQUE 3) ────────
// Déclenché par un planificateur (Vercel Cron horaire). Protégé par un secret
// partagé (`CRON_SECRET`) : comparaison en temps constant. Aucune donnée exposée.

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDueReminders } from '@/lib/telegram/reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false }, { status: 500 })

  // Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> ».
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await sendDueReminders(admin, Date.now())
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[telegram reminders route]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
