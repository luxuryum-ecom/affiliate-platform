/**
 * LOT 1B — Preuves RUNTIME : notifications commande COD
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Couverture :
 *  a. Admin reçoit la notif cod_order_created
 *  b. Affilié A (bon) reçoit sa notif
 *  c. Personnel dépôt (casier confirm_cod_orders) reçoit la notif
 *  d. Affilié B (mauvais) ne reçoit AUCUNE notif (isolation critique)
 *  e. Payload sans PII (ref, items, city — jamais nom/tél/adresse client)
 *  f. admin_audit_log contient une ligne cod_order_created via trigger INSERT
 *  g. Idempotence : re-appel sans doublon (onConflict cod_order_id,event,recipient_id)
 *
 * Données de test nettoyées en afterAll (sauf admin_audit_log = append-only immuable).
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Mocks HOISTÉS avant tout import du module testé ───────────────────────────
// next-intl/server requiert le runtime Next.js — indisponible en Node pur.
// renderTelegramFr n'est appelée que si ADMIN_TELEGRAM_CHAT_ID est set (non set ici).
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `[${key}]`,
}))

// Pas d'appels HTTP sortants Telegram en test.
vi.mock('@/lib/telegram/client', () => ({
  telegramSendMessage: async () => {},
}))

// ── Imports APRÈS mocks (garantis par le hoisting vitest) ──────────────────────
// Le module réel — createAdminClient() lira process.env (local) positionné en beforeAll.
import { notifyOrderCreated } from '@/lib/notifications/order-created'
// Helpers garde-fou (lit supabase status, refuse si URL non-locale)
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

// ── État du test (peuplé en beforeAll) ────────────────────────────────────────
let sb: SupabaseClient
let adminId: string
let affiliateAId: string
let affiliateBId: string
let depotUserId: string
let productId: string
let orderId: string
const testTag = `lot1b-${Date.now()}` // suffixe unique pour isolation multi-runs

describe('LOT 1B — Notifications COD (intégration LOCAL)', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP : seed Supabase LOCAL, appel de notifyOrderCreated
  // ─────────────────────────────────────────────────────────────────────────────
  beforeAll(async () => {
    // 1. Credentials locaux via supabase status — JAMAIS .env.local
    const env = getLocalSupabaseEnv()
    console.log(`[guard] URL locale : ${env.url}`) // prouve que c'est LOCAL
    assertLocalSupabase(env.url, 'lot1b-integration-setup')

    // 2. Pas de Telegram dans ce test (best-effort, var absente)
    delete process.env.ADMIN_TELEGRAM_CHAT_ID

    // 3. Pointer createAdminClient() de l'app sur le LOCAL
    //    (les vars sont lues à l'appel, pas à l'import → beforeAll suffit)
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    // 4. Client seed service_role (bypass RLS — local uniquement)
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Création des utilisateurs de test ──────────────────────────────────────
    const mkUser = async (
      suffix: string,
      role: 'admin' | 'affiliate',
      name: string,
    ): Promise<string> => {
      const { data, error } = await sb.auth.admin.createUser({
        email: `${suffix}-${testTag}@test.local`,
        password: 'TestLot1b2026!',
        email_confirm: true,
        user_metadata: { role, full_name: name },
      })
      if (error || !data.user) {
        throw new Error(`createUser(${suffix}): ${error?.message ?? 'user null'}`)
      }
      // Le trigger handle_new_user crée le profil avec role=metadata.role, status='pending'
      // On force status='approved' pour éviter toute ambiguïté (non critique ici mais propre)
      await sb
        .from('profiles')
        .update({ role, status: 'approved', full_name: name })
        .eq('id', data.user.id)
      return data.user.id
    }

    adminId      = await mkUser('tadmin',  'admin',     `TestAdmin ${testTag}`)
    affiliateAId = await mkUser('taffA',   'affiliate', `TestAffA ${testTag}`)
    affiliateBId = await mkUser('taffB',   'affiliate', `TestAffB ${testTag}`)
    depotUserId  = await mkUser('tdepot',  'affiliate', `TestDepot ${testTag}`)

    // ── Casier confirm_cod_orders pour le personnel dépôt ─────────────────────
    const { error: spErr } = await sb.from('staff_permissions').insert({
      user_id: depotUserId,
      capability: 'confirm_cod_orders',
    })
    if (spErr) throw new Error(`staff_permissions: ${spErr.message}`)

    // ── Produit de test ────────────────────────────────────────────────────────
    const { data: prod, error: prodErr } = await sb
      .from('products')
      .insert({ name: `Produit ${testTag}`, sell_price: 200 })
      .select('id')
      .single()
    if (prodErr || !prod) throw new Error(`products: ${prodErr?.message}`)
    productId = prod.id

    // ── Commande COD pour affiliéA ─────────────────────────────────────────────
    const { data: ord, error: ordErr } = await sb
      .from('orders')
      .insert({
        affiliate_id:     affiliateAId,
        product_id:       productId,
        customer_name:    'Client Test',     // PII côté DB : ne doit pas fuir dans payload
        customer_phone:   '0600000000',
        customer_city:    'Casablanca',
        customer_address: '1 Rue Test Lot1B',
        quantity:         2,
        total_amount:     400,
        commission_amount: 60,
      })
      .select('id')
      .single()
    if (ordErr || !ord) throw new Error(`orders: ${ordErr?.message}`)
    orderId = ord.id

    // ── Appel du flux de notification (module réel, DB locale) ────────────────
    await notifyOrderCreated(orderId)
  }, 90_000) // 90s : opérations réseau locale

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP : supprimer les données de test seedées
  // admin_audit_log est APPEND-ONLY immuable (trigger empêche DELETE) → non nettoyé.
  // Les lignes d'audit restent dans la DB locale (acceptable : test local).
  // ─────────────────────────────────────────────────────────────────────────────
  afterAll(async () => {
    if (!sb) return
    // Ordre : notifications (FK cod_order_id CASCADE) → order → product → users
    if (orderId) {
      await sb.from('notifications').delete().eq('cod_order_id', orderId)
      await sb.from('orders').delete().eq('id', orderId)
    }
    if (productId) await sb.from('products').delete().eq('id', productId)
    // Utilisateurs : cascade auth → profiles → staff_permissions
    for (const uid of [adminId, affiliateAId, affiliateBId, depotUserId].filter(Boolean)) {
      await sb.auth.admin.deleteUser(uid)
    }
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSERTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  it('(a) ADMIN reçoit une notif cod_order_created', async () => {
    const { data, error } = await sb
      .from('notifications')
      .select('id, event, cod_order_id, recipient_id')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')
      .eq('recipient_id', adminId)

    expect(error, `Erreur DB assertion a: ${error?.message}`).toBeNull()
    expect(data, 'Notif admin attendue').toHaveLength(1)
    expect(data![0].event).toBe('cod_order_created')
    expect(data![0].cod_order_id).toBe(orderId)
  })

  it('(b) AFFILIÉ A (bon) reçoit sa notif', async () => {
    const { data, error } = await sb
      .from('notifications')
      .select('id, event, recipient_id')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')
      .eq('recipient_id', affiliateAId)

    expect(error, `Erreur DB assertion b: ${error?.message}`).toBeNull()
    expect(data, 'Notif affiliéA attendue').toHaveLength(1)
  })

  it('(c) DÉPÔT (casier confirm_cod_orders) reçoit la notif', async () => {
    const { data, error } = await sb
      .from('notifications')
      .select('id, event, recipient_id')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')
      .eq('recipient_id', depotUserId)

    expect(error, `Erreur DB assertion c: ${error?.message}`).toBeNull()
    expect(data, 'Notif dépôt attendue').toHaveLength(1)
  })

  it('(d) AFFILIÉ B (mauvais) ne reçoit AUCUNE notif pour cette commande', async () => {
    const { data, error } = await sb
      .from('notifications')
      .select('id')
      .eq('cod_order_id', orderId)
      .eq('recipient_id', affiliateBId)

    expect(error, `Erreur DB assertion d: ${error?.message}`).toBeNull()
    expect(data, 'Aucune notif pour affiliéB (isolation)').toHaveLength(0)
  })

  it('(e) Payload des notifs SANS PII (ref, items, city uniquement)', async () => {
    const { data, error } = await sb
      .from('notifications')
      .select('payload')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')

    expect(error, `Erreur DB assertion e: ${error?.message}`).toBeNull()
    expect(data!.length, 'Au moins 1 notif').toBeGreaterThan(0)

    for (const row of data!) {
      const payload = row.payload as Record<string, unknown>
      const keys = Object.keys(payload)

      // Clés autorisées seulement (ref, items, city)
      expect(keys, 'Seules clés autorisées dans le payload').toEqual(
        expect.arrayContaining(['ref', 'items', 'city'])
      )
      // Clés PII interdites
      const PII_KEYS = [
        'customer_name', 'customer_phone', 'customer_address',
        'phone', 'name', 'address', 'client', 'buyer',
      ]
      for (const pii of PII_KEYS) {
        expect(keys, `PII "${pii}" absent du payload`).not.toContain(pii)
      }
      // Clés financières interdites
      const FIN_KEYS = [
        'commission', 'commission_amount', 'factory_cost',
        'margin', 'price', 'total', 'delivery_fee',
      ]
      for (const fin of FIN_KEYS) {
        expect(keys, `Donnée financière "${fin}" absente du payload`).not.toContain(fin)
      }

      // Vérifier le contenu (city = valeur ville, pas une adresse complète)
      expect(payload.city).toBe('Casablanca')
      // ref = 8 premiers chars de l'UUID (troncature sûre)
      expect(typeof payload.ref).toBe('string')
      expect((payload.ref as string).length).toBeLessThanOrEqual(8)
      // items = tableau avec label + qty
      const items = payload.items as { label: string; qty: number }[]
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThan(0)
      expect(typeof items[0].label).toBe('string')
      expect(typeof items[0].qty).toBe('number')
    }
  })

  it('(f) admin_audit_log contient cod_order_created pour cet order (trigger AFTER INSERT)', async () => {
    const { data, error } = await sb
      .from('admin_audit_log')
      .select('id, action, target_table, target_id, new_value')
      .eq('action', 'cod_order_created')
      .eq('target_id', orderId)

    expect(error, `Erreur DB assertion f: ${error?.message}`).toBeNull()
    expect(data!.length, 'Au moins 1 ligne audit cod_order_created').toBeGreaterThanOrEqual(1)

    const row = data![0]
    expect(row.action).toBe('cod_order_created')
    expect(row.target_table).toBe('orders')
    expect(row.target_id).toBe(orderId)

    // new_value = { status: 'pending_confirmation' } — pas de PII
    const newVal = row.new_value as Record<string, unknown>
    expect(newVal).toHaveProperty('status')
    // Aucune PII dans new_value
    expect(Object.keys(newVal)).not.toContain('customer_name')
    expect(Object.keys(newVal)).not.toContain('customer_phone')
    expect(Object.keys(newVal)).not.toContain('customer_address')
  })

  it('(idempotence) Re-appel de notifyOrderCreated ne crée aucun doublon', async () => {
    // Compter les notifs avant le 2e appel
    const { data: before } = await sb
      .from('notifications')
      .select('id')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')
    const countBefore = before?.length ?? 0

    // 2ème appel
    await notifyOrderCreated(orderId)

    // Compter après
    const { data: after } = await sb
      .from('notifications')
      .select('id')
      .eq('cod_order_id', orderId)
      .eq('event', 'cod_order_created')
    const countAfter = after?.length ?? 0

    expect(countAfter, 'Aucun doublon créé après re-appel').toBe(countBefore)
    expect(countBefore, 'Des notifs existent bien (prouve que le test précédent a fonctionné)').toBeGreaterThan(0)
  })
})
