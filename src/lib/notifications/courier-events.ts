import { createAdminClient } from '@/lib/supabase/admin'
import { telegramSendMessage } from '@/lib/telegram/client'

/**
 * Notifications LOT E — cœur notifications du module Livreurs.
 *
 * RÈGLE ABSOLUE (verrouillée, CLAUDE.md) : notifs NON BLOQUANTES, JAMAIS dans une
 * transaction financière. Émises depuis les server actions APRÈS le succès de la
 * RPC/écriture (jamais dans une RPC/trigger). BEST-EFFORT TOTAL — cette fonction
 * NE THROW JAMAIS : si Telegram ou l'insert notif tombe, l'écriture au grand livre
 * et la chaîne de garde fonctionnent quand même. Calque exact du patron
 * src/lib/notifications/order-created.ts.
 *
 * Destinataires : profiles role='admin' (Abdou/admins).
 * TODO(plus tard) : champ superviseur dédié — quand un rôle "superviseur livreurs"
 * existera, l'ajouter aux destinataires ici (en plus des admins, pas à leur place).
 *
 * PII / DONNÉES SENSIBLES : le payload ne contient QUE {courierName, reference,
 * city, amountMad} — JAMAIS de marge, coût d'achat, commission, ni donnée d'un
 * AUTRE livreur.
 *
 * Canaux : in_app toujours ; Telegram admin UNIQUEMENT pour les 3 events 🚨
 * critiques (courier_return_declared, courier_return_lost, courier_over_cap).
 */

export type CourierNotificationEvent =
  | 'courier_pickup'
  | 'courier_delivered'
  | 'courier_return_declared'
  | 'courier_return_confirmed'
  | 'courier_return_lost'
  | 'courier_over_cap'
  | 'courier_remittance'

export interface NotifyCourierEventInput {
  event: CourierNotificationEvent
  courierId?: string
  courierName?: string
  orderId?: string
  reference?: string
  city?: string
  amountMad?: number
}

// Events déclenchant un envoi Telegram admin best-effort (🚨 awareness immédiate).
const TELEGRAM_EVENTS: ReadonlySet<CourierNotificationEvent> = new Set([
  'courier_return_declared',
  'courier_return_lost',
  'courier_over_cap',
])

const TELEGRAM_LABELS: Record<string, string> = {
  courier_return_declared: 'Retour déclaré',
  courier_return_lost: 'Retour perdu',
  courier_over_cap: 'Plafond dépassé',
}

interface CourierNotifPayload {
  courierName?: string
  reference?: string
  city?: string
  amountMad?: number
}

/**
 * Émet une notif livreur best-effort (in-app systématique + Telegram admin pour
 * les 3 events critiques). Ne throw JAMAIS — toute erreur est avalée et loggée.
 * À appeler APRÈS le succès de la RPC/écriture, jamais avant, jamais dedans.
 */
export async function notifyCourierEvent(input: NotifyCourierEventInput): Promise<void> {
  try {
    const { event, courierId, courierName, orderId, reference, city, amountMad } = input
    const admin = createAdminClient()

    // 1) Destinataires = admins (superviseur livreurs : cf. TODO en tête de fichier).
    const { data: admins } = (await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')) as { data: { id: string }[] | null }
    const recipients = (admins ?? []).map((a) => a.id)
    if (recipients.length === 0) return

    // 2) Payload SANS donnée sensible (zéro marge/coût/prix d'achat/autre livreur).
    const payload: CourierNotifPayload = {}
    if (courierName) payload.courierName = courierName
    if (reference) payload.reference = reference
    if (city) payload.city = city
    if (amountMad != null) payload.amountMad = amountMad

    const channels = TELEGRAM_EVENTS.has(event) ? ['in_app', 'telegram'] : ['in_app']

    // 3) Insert in-app idempotent (1 ligne / admin). Dédup : cod_order_id si fourni,
    //    sinon courier_id (index uniq_notif_courier_event_recipient, mig 129).
    const rows = recipients.map((rid) => ({
      recipient_id: rid,
      event,
      cod_order_id: orderId ?? null,
      courier_id: courierId ?? null,
      payload,
      channels,
    }))

    const onConflict = orderId ? 'cod_order_id,event,recipient_id' : 'courier_id,event,recipient_id'
    await admin.from('notifications').upsert(rows, { onConflict, ignoreDuplicates: true })

    // 4) Telegram admin best-effort — UNIQUEMENT les 3 events 🚨 critiques.
    if (TELEGRAM_EVENTS.has(event)) {
      try {
        const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID
        if (adminChat) {
          const text = renderTelegramFr(event, payload)
          await telegramSendMessage(Number(adminChat), text)
        }
      } catch (e) {
        console.error('notifyCourierEvent/telegram', e)
      }
    }
  } catch (e) {
    // Best-effort TOTAL — l'action appelante ne doit JAMAIS échouer à cause de la notif.
    console.error('notifyCourierEvent', e)
  }
}

/** Rendu texte Telegram FR court (🚨 + libellé + nom + réf + montant). */
function renderTelegramFr(event: CourierNotificationEvent, payload: CourierNotifPayload): string {
  const label = TELEGRAM_LABELS[event] ?? event
  const parts = [`🚨 ${label}`]
  if (payload.courierName) parts.push(payload.courierName)
  if (payload.reference) parts.push(`réf ${payload.reference}`)
  if (payload.amountMad != null) parts.push(`${payload.amountMad} MAD`)
  if (event === 'courier_return_declared') parts.push('dette inchangée jusqu’à confirmation')
  return parts.join(' · ')
}
