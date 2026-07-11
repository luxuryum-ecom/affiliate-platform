/**
 * Lot E — Preuves RUNTIME : cœur notifications du module Livreurs.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT (assertLocalSupabase).
 * Prouve :
 *  1. notifyCourierEvent insère une notif in-app pour l'admin (event correct,
 *     payload SANS PII/marge — clés autorisées uniquement). Rejeu même
 *     event/commande → PAS de doublon (dédup cod_order_id,event,recipient_id).
 *  2. over_cap : dédup via courier_id (2 appels directs → 1 seule notif,
 *     index uniq_notif_courier_event_recipient, mig 129).
 *  3. NON-BLOCKING : Telegram mocké pour ÉCHOUER systématiquement →
 *     declareCourierReturn (action réelle, événement 🚨) réussit quand même
 *     ET la notif in-app est bien créée malgré l'échec Telegram.
 *  4. getCourierDailyDigest retourne les bonnes sections (retours en attente,
 *     over-cap, pertes du jour, colis ramassés non résolus).
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

// ── Mocks HOISTÉS avant tout import du module testé ───────────────────────────
// Telegram mocké pour ÉCHOUER systématiquement (test 3, preuve non-blocking).
// Pas d'appel HTTP sortant réel en test, quel que soit le scénario.
vi.mock('@/lib/telegram/client', () => ({
  telegramSendMessage: vi.fn(async () => {
    throw new Error('telegram down (simulé, preuve non-blocking)')
  }),
}))

// requireAdmin mocké pour getCourierDailyDigest (requireAdmin() appelle
// createClient() de src/lib/supabase/server.ts, qui lit next/headers cookies() —
// indisponible hors requête Next. On substitue un guard qui retourne directement
// le client service_role de test (déjà positionné sur le LOCAL) + l'id admin
// seedé, SANS jamais toucher à la logique testée (getCourierDailyDigest lit les
// mêmes vues/tables, juste via le client injecté).
const guardState = vi.hoisted(() => ({ sb: undefined as unknown, adminId: '' }))
vi.mock('@/app/actions/_guards', () => ({
  requireAdmin: async () => ({ supabase: guardState.sb, error: null, userId: guardState.adminId }),
}))

// ── Imports APRÈS mocks (garantis par le hoisting vitest) ──────────────────────
import { notifyCourierEvent } from '@/lib/notifications/courier-events'
import { declareCourierReturn } from '@/app/actions/courier-scan'
import { getCourierDailyDigest } from '@/app/actions/courier-digest'

const testTag = `lote-${Date.now()}`
const CODE_OK = `LOTECODE${testTag.slice(-8).toUpperCase()}` // ≥ 8 chars
const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

let sb: SupabaseClient
let adminId: string
let affiliateId: string
let productId: string
let courierA: string // livreur "normal" (portail access_code), plafond illimité
let courierCap: string // livreur plafonné, over_cap déclenché en test 2

let orderPickup: string // test 1 (notif directe)
let orderDeclared: string // test 3 (declareCourierReturn via portail)
let orderPickedUpNotResolved: string // test 4 (scan pickup_dispatch, pas résolu)
let debtId: string // test 2 (créance produit, courierCap)
let scanEventId: string // test 4

async function seedOrder(courier: string | null, total: number): Promise<string> {
  const { data, error } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: `Client LotE ${testTag}`,
      customer_phone: '0600000000',
      customer_city: 'Casablanca',
      customer_address: 'a',
      quantity: 1,
      total_amount: total,
      commission_amount: 50,
      affiliate_commission_mad_snapshot: 50,
      status: 'confirmed',
      courier_id: courier,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed order: ${error?.message}`)
  return data.id as string
}

describe('Lot E — cœur notifications livreur (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-e-setup')
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    process.env.ADMIN_TELEGRAM_CHAT_ID = '123456789' // pour EXERCER le chemin Telegram (mocké KO, test 3)
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: admin } = await sb.auth.admin.createUser({
      email: `tadmin-${testTag}@test.local`,
      password: 'TestLotE2026!X',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: `Admin ${testTag}` },
    })
    adminId = admin!.user!.id
    await sb.from('profiles').update({ role: 'admin', status: 'approved' }).eq('id', adminId)
    guardState.sb = sb
    guardState.adminId = adminId

    const { data: aff } = await sb.auth.admin.createUser({
      email: `taff-${testTag}@test.local`,
      password: 'TestLotE2026!X',
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${testTag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await sb.from('products').insert({ name: `Prod LotE ${testTag}`, sell_price: 20000 }).select('id').single()
    productId = prod!.id

    const { data: crA } = await sb
      .from('couriers')
      .insert({
        name: `Livreur A LotE ${testTag}`,
        courier_type: 'personal',
        status: 'active',
        access_code_hash: sha256Hex(CODE_OK),
        access_code_expires_at: new Date(Date.now() + 864e5).toISOString(),
      })
      .select('id')
      .single()
    courierA = crA!.id

    const { data: crCap } = await sb
      .from('couriers')
      .insert({ name: `Livreur Cap LotE ${testTag}`, courier_type: 'personal', status: 'active', balance_cap_mad: 100 })
      .select('id')
      .single()
    courierCap = crCap!.id

    orderPickup = await seedOrder(null, 15000)
    orderDeclared = await seedOrder(courierA, 25000)
    orderPickedUpNotResolved = await seedOrder(courierA, 18000)
  }, 60000)

  afterAll(async () => {
    if (!sb) return
    const orderIds = [orderPickup, orderDeclared, orderPickedUpNotResolved].filter(Boolean)
    try {
      await sb.from('notifications').delete().in('cod_order_id', orderIds)
      await sb.from('notifications').delete().in('courier_id', [courierA, courierCap].filter(Boolean))
    } catch {
      /* toléré */
    }
    try {
      if (scanEventId) await sb.from('scan_events').delete().eq('id', scanEventId)
    } catch {
      /* append-only : toléré */
    }
    try {
      await sb.from('courier_returns').delete().in('order_id', orderIds)
      await sb.from('orders').delete().in('id', orderIds)
      // courier_product_debts est append-only immuable → non nettoyé (toléré en local, cf. lot-d).
      await sb.from('couriers').delete().in('id', [courierA, courierCap].filter(Boolean))
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
      if (adminId) await sb.auth.admin.deleteUser(adminId)
    } catch {
      /* toléré en local */
    }
  }, 30_000)

  // ───────────────────────────────────────────────────────────────────────────
  // 1. notifyCourierEvent : insert in-app admin + payload sans PII + idempotence
  // ───────────────────────────────────────────────────────────────────────────
  it('1a. notifyCourierEvent insère une notif in-app pour l\'admin (event + payload)', async () => {
    await notifyCourierEvent({
      event: 'courier_pickup',
      orderId: orderPickup,
      courierId: courierA,
      courierName: 'Livreur A',
      reference: orderPickup.slice(0, 8),
      city: 'Casablanca',
      amountMad: 150,
    })

    const { data, error } = await sb
      .from('notifications')
      .select('id, event, cod_order_id, courier_id, recipient_id, payload, channels')
      .eq('cod_order_id', orderPickup)
      .eq('event', 'courier_pickup')
      .eq('recipient_id', adminId)

    expect(error, `Erreur DB: ${error?.message}`).toBeNull()
    expect(data, 'Notif admin attendue').toHaveLength(1)
    expect(data![0].event).toBe('courier_pickup')
    expect(data![0].courier_id).toBe(courierA)
    expect(data![0].channels).toEqual(['in_app']) // pas 🚨 → pas de canal telegram

    const payload = data![0].payload as Record<string, unknown>
    const keys = Object.keys(payload)
    expect(keys.sort()).toEqual(['amountMad', 'city', 'courierName', 'reference'].sort())
    // Zéro donnée sensible : marge/coût/commission/autre livreur JAMAIS présents.
    for (const forbidden of ['margin', 'factory_cost', 'commission', 'price', 'delivery_fee', 'other_courier_id']) {
      expect(keys, `Donnée interdite "${forbidden}" absente`).not.toContain(forbidden)
    }
  })

  it('1b. Rejeu du même event/commande → AUCUN doublon (dédup cod_order_id,event,recipient_id)', async () => {
    await notifyCourierEvent({
      event: 'courier_pickup',
      orderId: orderPickup,
      courierId: courierA,
      courierName: 'Livreur A',
    })

    const { data, error } = await sb
      .from('notifications')
      .select('id')
      .eq('cod_order_id', orderPickup)
      .eq('event', 'courier_pickup')
      .eq('recipient_id', adminId)

    expect(error).toBeNull()
    expect(data, 'Toujours 1 seule notif après rejeu').toHaveLength(1)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. over_cap : dédup via courier_id (2 appels directs → 1 seule notif)
  // ───────────────────────────────────────────────────────────────────────────
  it('2. over_cap déclenché (créance produit > plafond) + dédup via courier_id (2 appels → 1 notif)', async () => {
    const { data: debt, error: debtErr } = await sb
      .from('courier_product_debts')
      .insert({ courier_id: courierCap, quantity: 1, amount_mad: 500, reason: `LotE over_cap ${testTag}` })
      .select('id')
      .single()
    expect(debtErr, `Erreur seed dette: ${debtErr?.message}`).toBeNull()
    debtId = debt!.id

    const { data: bal, error: balErr } = await sb
      .from('v_courier_balances')
      .select('over_cap, total_balance_mad, balance_cap_mad')
      .eq('id', courierCap)
      .single()
    expect(balErr).toBeNull()
    expect(bal!.over_cap, 'over_cap doit être déclenché (500 > plafond 100)').toBe(true)

    // 2 appels directs, aucune commande liée (courier_id uniquement) → dédup.
    await notifyCourierEvent({ event: 'courier_over_cap', courierId: courierCap, courierName: 'Livreur Cap' })
    await notifyCourierEvent({ event: 'courier_over_cap', courierId: courierCap, courierName: 'Livreur Cap' })

    const { data, error } = await sb
      .from('notifications')
      .select('id, channels')
      .eq('courier_id', courierCap)
      .eq('event', 'courier_over_cap')
      .eq('recipient_id', adminId)

    expect(error).toBeNull()
    expect(data, '1 seule notif over_cap malgré 2 appels').toHaveLength(1)
    expect(data![0].channels).toEqual(expect.arrayContaining(['in_app', 'telegram'])) // 🚨 → telegram inclus
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. NON-BLOCKING : Telegram KO (mocké) → l'action réussit quand même
  // ───────────────────────────────────────────────────────────────────────────
  it('3. declareCourierReturn réussit MÊME SI Telegram échoue (mocké KO) — notif in-app créée quand même', async () => {
    const res = await declareCourierReturn({ code: CODE_OK, orderId: orderDeclared })

    // L'ACTION ne doit JAMAIS échouer à cause d'un Telegram down (best-effort total).
    expect(res.error, `declareCourierReturn ne doit pas échouer: ${res.error}`).toBeNull()
    expect(res.state).toBe('declared')

    // La chaîne de garde a bien fonctionné (courier_returns).
    const { data: ret } = await sb.from('courier_returns').select('state').eq('order_id', orderDeclared).single()
    expect(ret!.state).toBe('declared')

    // La notif in-app 🚨 a bien été créée MALGRÉ l'échec Telegram (try/catch isolé).
    const { data: notif, error: notifErr } = await sb
      .from('notifications')
      .select('id, event, channels, recipient_id')
      .eq('cod_order_id', orderDeclared)
      .eq('event', 'courier_return_declared')
      .eq('recipient_id', adminId)
    expect(notifErr).toBeNull()
    expect(notif, 'Notif in-app créée malgré Telegram KO').toHaveLength(1)
    expect(notif![0].channels).toEqual(expect.arrayContaining(['in_app', 'telegram']))
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 4. getCourierDailyDigest — données agrégées
  // ───────────────────────────────────────────────────────────────────────────
  it('4. getCourierDailyDigest retourne les bonnes sections', async () => {
    // Colis ramassé non résolu : scan pickup_dispatch, commande toujours 'confirmed'.
    const { data: scan, error: scanErr } = await sb
      .from('scan_events')
      .insert({
        scan_type: 'pickup_dispatch',
        order_id: orderPickedUpNotResolved,
        order_type: 'affiliate',
        carrier_tracking_ref: orderPickedUpNotResolved,
        scanned_qty: 1,
      })
      .select('id')
      .single()
    expect(scanErr).toBeNull()
    scanEventId = scan!.id

    const res = await getCourierDailyDigest()
    expect(res.error, `Erreur digest: ${res.error}`).toBeNull()
    expect(res.digest).not.toBeNull()
    const d = res.digest!

    // returnsPending contient bien le retour déclaré en test 3.
    const pending = d.returnsPending.find((r) => r.orderId === orderDeclared)
    expect(pending, 'orderDeclared attendu dans returnsPending').toBeDefined()
    expect(pending!.courierName).toContain('Livreur A')
    expect(pending!.ageDays).toBeGreaterThanOrEqual(0)

    // couriersOverCap contient bien courierCap.
    const overCap = d.couriersOverCap.find((c) => c.name.includes('Livreur Cap'))
    expect(overCap, 'courierCap attendu dans couriersOverCap').toBeDefined()
    expect(overCap!.totalBalanceMad).toBeGreaterThanOrEqual(overCap!.capMad)

    // totalOutstandingMad inclut au moins la créance produit du test 2.
    expect(d.totalOutstandingMad).toBeGreaterThanOrEqual(500)

    // lossDebtsToday contient la créance créée aujourd'hui (test 2).
    const loss = d.lossDebtsToday.find((l) => l.courierName.includes('Livreur Cap'))
    expect(loss, 'Créance du jour attendue dans lossDebtsToday').toBeDefined()
    expect(loss!.amountMad).toBe(500)

    // pickedUpNotResolved : au moins 1 (orderPickedUpNotResolved).
    expect(d.pickedUpNotResolved).toHaveLength(1)
    expect(d.pickedUpNotResolved[0].count).toBeGreaterThanOrEqual(1)
  })
})
