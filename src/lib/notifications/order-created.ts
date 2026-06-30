import { createAdminClient } from '@/lib/supabase/admin'
import { telegramSendMessage } from '@/lib/telegram/client'
import { getTranslations } from 'next-intl/server'

/**
 * Notifications LOT 1B — commande COD affilié créée / confirmée.
 * Calque exact du patron order-assigned.ts (B2B). BEST-EFFORT TOTAL : ne renvoie
 * jamais d'erreur, ne throw jamais → la prise de commande / la confirmation ne peut
 * JAMAIS échouer à cause de la notif. NE FAIT QUE LIRE — ne touche aucun montant,
 * aucune commission, aucun calcul.
 *
 * Canaux : in-app (table notifications, cloche 1A) + Telegram admin (best-effort).
 *
 * PII : le payload ne contient QUE des champs SÛRS (ref, libellé produit + quantité,
 * ville de livraison). JAMAIS de nom/téléphone/adresse client, JAMAIS de coût
 * fournisseur ni de commission/marge.
 *
 * Destinataires :
 *  - création : admin(s) + l'AFFILIÉ concerné (sa vente) + personnel dépôt ayant un
 *    casier de traitement COD (confirm_cod_orders / depot_supervision).
 *  - confirmation : admin(s) + l'affilié. PAS de grossiste externe (n'existe pas).
 */

const EVENT_CREATED = 'cod_order_created'
const EVENT_CONFIRMED = 'cod_order_confirmed'

// Casiers dont les porteurs sont notifiés d'une nouvelle commande COD à traiter.
const COD_DEPOT_CAPABILITIES = ['confirm_cod_orders', 'depot_supervision']

interface NotifPayload {
  ref: string
  items: { label: string; qty: number }[]
  city: string | null
}

async function buildAndNotify(codOrderId: string, event: string): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1) Commande — SELECT EXPLICITE de champs SÛRS uniquement. JAMAIS customer_name,
    //    customer_phone, customer_address, ni commission/coût.
    const { data: order } = (await admin
      .from('orders')
      .select('id, customer_city, affiliate_id, product_id, quantity')
      .eq('id', codOrderId)
      .single()) as {
      data: {
        id: string
        customer_city: string | null
        affiliate_id: string | null
        product_id: string | null
        quantity: number
      } | null
    }
    if (!order) return

    // 2) Libellé produit (catalogue, non sensible).
    const { data: product } = (await admin
      .from('products')
      .select('name')
      .eq('id', order.product_id)
      .maybeSingle()) as { data: { name: string } | null }

    const payload: NotifPayload = {
      ref: order.id.slice(0, 8),
      items: [{ label: product?.name ?? '—', qty: order.quantity }],
      city: order.customer_city,
    }

    // 3) Destinataires (dédupliqués).
    const recipients = new Set<string>()
    const { data: admins } = (await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')) as { data: { id: string }[] | null }
    ;(admins ?? []).forEach((a) => recipients.add(a.id))

    // L'affilié concerné reçoit SA vente (jamais un autre affilié).
    if (order.affiliate_id) recipients.add(order.affiliate_id)

    // Personnel dépôt avec casier COD — uniquement à la création (à traiter).
    if (event === EVENT_CREATED) {
      const { data: staff } = (await admin
        .from('staff_permissions')
        .select('user_id')
        .in('capability', COD_DEPOT_CAPABILITIES)) as { data: { user_id: string }[] | null }
      ;(staff ?? []).forEach((s) => recipients.add(s.user_id))
    }

    // 4) Insert in-app idempotent (1 ligne / destinataire). Canal garanti.
    const rows = [...recipients].map((rid) => ({
      recipient_id: rid,
      event,
      cod_order_id: codOrderId,
      payload,
      channels: ['in_app'],
    }))
    if (rows.length > 0) {
      await admin
        .from('notifications')
        .upsert(rows, { onConflict: 'cod_order_id,event,recipient_id', ignoreDuplicates: true })
    }

    // 5) Telegram best-effort — ADMIN uniquement (awareness). Jamais l'affilié/dépôt
    //    (pas de lien chat + on évite toute diffusion de données hors in-app RLS).
    try {
      const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID
      if (adminChat) {
        const text = await renderTelegramFr(payload, event)
        await telegramSendMessage(Number(adminChat), text)
      }
    } catch (e) {
      console.error('notifyOrderCreated/telegram', e)
    }
  } catch (e) {
    // Best-effort TOTAL — la commande ne doit jamais échouer à cause de la notif.
    console.error('order-created notif', e)
  }
}

/** Émise à la création d'une commande COD (placeOrder / createAffiliateOrder). */
export async function notifyOrderCreated(codOrderId: string): Promise<void> {
  return buildAndNotify(codOrderId, EVENT_CREATED)
}

/** Émise à la confirmation superviseur d'une commande COD. */
export async function notifyOrderConfirmed(codOrderId: string): Promise<void> {
  return buildAndNotify(codOrderId, EVENT_CONFIRMED)
}

/** Rendu texte Telegram FR (réutilise les clés i18n notifications.<event>). */
async function renderTelegramFr(payload: NotifPayload, event: string): Promise<string> {
  const ns = event === EVENT_CONFIRMED ? 'notifications.cod_order_confirmed' : 'notifications.cod_order_created'
  const t = await getTranslations({ locale: 'fr', namespace: ns })
  const lines = payload.items.map((it) => t('item', { label: it.label, qty: it.qty }))
  return [t('title'), '', t('body', { ref: payload.ref, city: payload.city ?? '—' }), ...lines].join('\n')
}
