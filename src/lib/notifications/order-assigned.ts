import { createAdminClient } from '@/lib/supabase/admin'
import { telegramSendMessage } from '@/lib/telegram/client'
import { getTranslations } from 'next-intl/server'

/**
 * Notification LOT 6 — émise quand une commande B2B est assignée à un fournisseur.
 * BEST-EFFORT TOTAL : ne renvoie jamais d'erreur, ne throw jamais → l'assignation
 * ne peut JAMAIS échouer à cause de la notif.
 *
 * Canaux : in-app (table notifications, garanti via service-role) + Telegram
 * (push best-effort : fournisseur lié + chat admin si ADMIN_TELEGRAM_CHAT_ID).
 *
 * PII : le payload ne contient QUE des champs sûrs (ref, items, city, dueAt).
 * Aucune donnée acheteur (buyer_id, nom, téléphone, adresse, buyer_notes).
 */
const EVENT = 'order_assigned'

interface NotifPayload {
  ref: string
  items: { label: string; qty: number }[]
  city: string | null
  dueAt: string | null
}

export async function notifyOrderAssigned(
  orderId: string,
  opts?: { notifyAgent?: boolean }
): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1) Commande — SELECT explicite de champs SÛRS uniquement (jamais de PII).
    const { data: order } = (await admin
      .from('wholesale_orders')
      .select('id, city, due_at, supplier_id, agent_id')
      .eq('id', orderId)
      .single()) as {
      data: {
        id: string
        city: string | null
        due_at: string | null
        supplier_id: string | null
        agent_id: string | null
      } | null
    }
    if (!order || !order.supplier_id) return

    // 2) Lignes de commande + nom produit (libellé catalogue, non sensible).
    const { data: items } = (await admin
      .from('wholesale_order_items')
      .select('quantity, products(name)')
      .eq('order_id', orderId)) as {
      data: { quantity: number; products: { name: string } | null }[] | null
    }

    const payload: NotifPayload = {
      ref: order.id.slice(0, 8),
      items: (items ?? []).map((it) => ({ label: it.products?.name ?? '—', qty: it.quantity })),
      city: order.city,
      dueAt: order.due_at,
    }

    // 3) Destinataires (dédupliqués) : toujours fournisseur + admin(s) ; agent si demandé.
    const recipients = new Set<string>()
    recipients.add(order.supplier_id)
    const { data: admins } = (await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')) as { data: { id: string }[] | null }
    ;(admins ?? []).forEach((a) => recipients.add(a.id))
    if (opts?.notifyAgent && order.agent_id) recipients.add(order.agent_id)

    // 4) Insert in-app idempotent (1 ligne par destinataire). Canal garanti.
    const rows = [...recipients].map((rid) => ({
      recipient_id: rid,
      event: EVENT,
      order_id: orderId,
      payload,
      channels: ['in_app'],
    }))
    if (rows.length > 0) {
      await admin
        .from('notifications')
        .upsert(rows, { onConflict: 'order_id,event,recipient_id', ignoreDuplicates: true })
    }

    // 5) Telegram best-effort (FR par défaut — pas de colonne locale sur profiles).
    try {
      const text = await renderTelegramFr(payload)

      // Fournisseur (s'il a lié son compte Telegram).
      const { data: link } = (await admin
        .from('telegram_supplier_links')
        .select('telegram_user_id')
        .eq('supplier_id', order.supplier_id)
        .maybeSingle()) as { data: { telegram_user_id: number | null } | null }
      if (link?.telegram_user_id) {
        await telegramSendMessage(Number(link.telegram_user_id), text)
      }

      // Admin (Abdou) via env — jamais NEXT_PUBLIC, reste serveur.
      const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID
      if (adminChat) {
        await telegramSendMessage(Number(adminChat), text)
      }
    } catch (e) {
      console.error('notifyOrderAssigned/telegram', e)
    }
  } catch (e) {
    // Best-effort TOTAL — l'assignation ne doit jamais échouer à cause de la notif.
    console.error('notifyOrderAssigned', e)
  }
}

/** Rendu texte Telegram en français (réutilise les clés i18n notifications). */
async function renderTelegramFr(payload: NotifPayload): Promise<string> {
  const t = await getTranslations({ locale: 'fr', namespace: 'notifications.order_assigned' })
  const lines = payload.items.map((it) => t('item', { label: it.label, qty: it.qty }))
  const parts = [t('title'), '', t('body', { ref: payload.ref, city: payload.city ?? '—' }), ...lines]
  if (payload.dueAt) parts.push(t('due', { date: payload.dueAt.slice(0, 10) }))
  return parts.join('\n')
}
