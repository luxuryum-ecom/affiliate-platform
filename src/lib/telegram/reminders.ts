// ─── BRIQUE 3 — Relance UNIQUE (~1h) des produits en attente d'info ───────────
// Le bot est webhook-driven : il n'agit qu'à réception d'un message. Une relance
// « après 1h sans réponse » a donc besoin d'un déclencheur externe (Vercel Cron
// horaire → /api/telegram/reminders). Ici : la logique pure de balayage + envoi,
// one-shot (reminded_at) → jamais de spam.

import type { createAdminClient } from '@/lib/supabase/admin'
import { telegramSendMessage } from './client'
import { getDueReminders, markReminded } from './pending-store'
import { msgReminderPrice, msgReminderTiers } from './messages'
import { REMINDER_AFTER_MS } from './conversation'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Envoie la relance UNIQUE à toutes les attentes DUES (question > 1h, jamais
 * relancée). Chaque relance est faite dans la langue snapshotée du fournisseur,
 * puis `reminded_at` est posé (anti-spam). `nowMs` injecté pour la testabilité.
 * Best-effort : une erreur d'envoi n'interrompt pas le balayage.
 */
export async function sendDueReminders(
  admin: Admin,
  nowMs: number,
): Promise<{ scanned: number; sent: number }> {
  const beforeIso = new Date(nowMs - REMINDER_AFTER_MS).toISOString()
  const due = await getDueReminders(admin, beforeIso)
  let sent = 0
  for (const row of due) {
    try {
      const { data } = await admin
        .from('supplier_products')
        .select('product_name')
        .eq('id', row.supplier_product_id)
        .maybeSingle()
      const name = (data as { product_name: string } | null)?.product_name ?? ''
      const text =
        row.awaiting === 'price'
          ? msgReminderPrice(row.telegram_lang, { name })
          : msgReminderTiers(row.telegram_lang, { name })
      await telegramSendMessage(row.telegram_chat_id, text)
      await markReminded(admin, row.supplier_product_id)
      sent++
    } catch (e) {
      console.error('[telegram reminders]', row.supplier_product_id, e instanceof Error ? e.message : e)
    }
  }
  return { scanned: due.length, sent }
}
