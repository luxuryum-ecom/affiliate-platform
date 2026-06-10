// ─── Webhook Telegram — point d'entrée HTTP ──────────────────────────────────
// Sécurité : secret partagé vérifié en temps constant (header Telegram).
// Toute charge utile est validée par zod avant traitement. Aucune écriture
// directe : tout passe par handleTelegramUpdate (service_role, serveur).

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { telegramUpdateSchema } from '@/lib/telegram/schema'
import { handleTelegramUpdate } from '@/lib/telegram/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) {
    // Mauvaise configuration serveur — ne pas exposer de détail.
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    // Corps illisible : on acquitte pour éviter les retries Telegram.
    return NextResponse.json({ ok: true })
  }

  const parsed = telegramUpdateSchema.safeParse(body)
  if (!parsed.success) {
    // Update non reconnu (édition de statut, etc.) : acquitter sans traiter.
    return NextResponse.json({ ok: true })
  }

  try {
    await handleTelegramUpdate(parsed.data)
  } catch (e) {
    // On acquitte toujours 200 : l'échec est journalisé en staging (telegram_inbound),
    // pas de tempête de retries côté Telegram.
    console.error('[telegram webhook]', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}
