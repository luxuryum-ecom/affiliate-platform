'use server'

import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'

/**
 * LOT 1A — Lecture des notifications in-app (cloche 🔔).
 *
 * SÉCURITÉ : utilise le client RLS-scoped (`@/lib/supabase/server`), JAMAIS le
 * client service_role. L'isolation par destinataire est garantie par la policy
 * RLS « read own » (mig 076) → chaque utilisateur ne voit QUE ses notifications,
 * aucun filtre de rôle à coder ici.
 *
 * RÈGLE #2 : les libellés i18n (FR/AR/EN) et la date sont résolus CÔTÉ SERVEUR.
 * On ne renvoie au client que des strings sérialisables (aucune fonction/objet).
 */

export interface NotificationView {
  id: string
  title: string
  body: string
  dateLabel: string
  isRead: boolean
  href: string | null
}

export interface NotificationsResult {
  items: NotificationView[]
  unreadCount: number
}

interface NotifRow {
  id: string
  event: string
  order_id: string | null
  cod_order_id: string | null
  courier_id: string | null
  payload: {
    ref?: string
    city?: string | null
    // V5 — price_drop
    supplier_product_id?: string
    product_name?: string
    old_price?: number
    new_price?: number
    // Lot E — events courier_*
    courierName?: string
    reference?: string
    amountMad?: number
  } | null
  read_at: string | null
  created_at: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function getNotifications(
  opts?: { unreadOnly?: boolean; limit?: number }
): Promise<NotificationsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { items: [], unreadCount: 0 }

  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const locale = await getLocale()

  // Rôle de l'utilisateur (lecture RLS-scoped) — sert UNIQUEMENT à router le lien
  // de la notification vers une page sûre selon l'espace.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null }
  const role = profile?.role ?? null

  let query = supabase
    .from('notifications')
    .select('id, event, order_id, cod_order_id, courier_id, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.unreadOnly) query = query.is('read_at', null)

  const { data: rows } = (await query) as { data: NotifRow[] | null }

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  // Traducteurs + formateur de date résolus une fois (pas par ligne).
  const tAssigned = await getTranslations('notifications.order_assigned')
  const tCodCreated = await getTranslations('notifications.cod_order_created')
  const tCodConfirmed = await getTranslations('notifications.cod_order_confirmed')
  const tTgLinked = await getTranslations('notifications.supplier_telegram_linked')
  const tPriceDrop = await getTranslations('notifications.price_drop')
  const tCourier = await getTranslations('notifications.courier')

  // Lot E — event courier_* → clé de titre i18n.
  const COURIER_TITLE_KEY: Record<string, string> = {
    courier_pickup: 'titlePickup',
    courier_delivered: 'titleDelivered',
    courier_return_declared: 'titleReturnDeclared',
    courier_return_confirmed: 'titleReturnConfirmed',
    courier_return_lost: 'titleReturnLost',
    courier_over_cap: 'titleOverCap',
    courier_remittance: 'titleRemittance',
  }
  const numLocale =
    locale.split('-')[0] === 'ar'
      ? 'ar-MA-u-nu-latn' // numéraux latins en arabe (règle CLAUDE)
      : locale.split('-')[0] === 'en'
        ? 'en-GB'
        : 'fr-MA'
  const dateFmt = new Intl.DateTimeFormat(numLocale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  // Formateur MAD (numéraux latins) pour le corps de l'alerte de prix.
  const madFmt = (n: number) =>
    `${new Intl.NumberFormat(numLocale, { maximumFractionDigits: 2 }).format(n)} MAD`

  const items: NotificationView[] = (rows ?? []).map((r) => {
    const p = r.payload ?? {}
    let title = r.event
    let body = ''
    let href: string | null = null

    if (r.event === 'order_assigned') {
      title = tAssigned('title')
      body = tAssigned('body', { ref: p.ref ?? '—', city: p.city ?? '—' })
      // Lien sûr : seul l'admin a une page commande grossiste dédiée. Les autres
      // espaces (fournisseur/agent/affilié) seront câblés dans leurs lots.
      if (role === 'admin' && r.order_id) href = `/admin/wholesale-orders/${r.order_id}`
    } else if (r.event === 'cod_order_created' || r.event === 'cod_order_confirmed') {
      const tc = r.event === 'cod_order_confirmed' ? tCodConfirmed : tCodCreated
      title = tc('title')
      body = tc('body', { ref: p.ref ?? '—', city: p.city ?? '—' })
      // Lien sûr et scopé par rôle : l'admin vers la fiche COD admin, l'affilié vers
      // sa liste de commandes. Aucune autre cible (pas de fuite inter-espaces).
      if (role === 'admin' && r.cod_order_id) href = `/admin/orders/${r.cod_order_id}`
      else if (role === 'affiliate') href = '/affiliate/orders'
    } else if (r.event === 'supplier_telegram_linked') {
      title = tTgLinked('title')
      body = tTgLinked('body')
      if (role === 'supplier') href = '/supplier/dashboard'
    } else if (r.event === 'price_drop') {
      title = tPriceDrop('title')
      body = tPriceDrop('body', {
        name: p.product_name ?? '—',
        oldPrice: p.old_price != null ? madFmt(p.old_price) : '—',
        newPrice: p.new_price != null ? madFmt(p.new_price) : '—',
      })
      // Lien vers la fiche produit suivie — gaté par rôle (cohérence défensive
      // avec les autres branches ; seul un grossiste reçoit ce type de notif).
      if (role === 'wholesaler' && p.supplier_product_id) {
        href = `/wholesale/marketplace/${p.supplier_product_id}`
      }
    } else if (COURIER_TITLE_KEY[r.event]) {
      // Lot E — events livreurs (module Livreurs). Payload non sensible.
      title = tCourier(COURIER_TITLE_KEY[r.event])
      body = tCourier('body', {
        name: p.courierName ?? '—',
        ref: p.reference ?? '—',
        amount: p.amountMad != null ? madFmt(p.amountMad) : '—',
      })
      if (role === 'admin' && r.courier_id) href = `/admin/couriers/${r.courier_id}`
    }

    return {
      id: r.id,
      title,
      body,
      dateLabel: dateFmt.format(new Date(r.created_at)),
      isRead: r.read_at != null,
      href,
    }
  })

  return { items, unreadCount: count ?? 0 }
}

/** Marque UNE notification comme lue (RLS : own only ; colonne read_at seule). */
export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  return { ok: !error }
}

/** Marque TOUTES les notifications non lues de l'utilisateur comme lues. */
export async function markAllRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)

  return { ok: !error }
}
