/**
 * Migration 118 — V5 : trigger d'alerte baisse de prix (watchlist).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status`.
 *
 * Couverture (via service_role pour piloter les UPDATE de prix) :
 *  - BAISSE de prix sur produit approuvé + suivi → notification 'price_drop' créée
 *    pour le watcher, payload = { supplier_product_id, product_name, old/new price }.
 *  - HAUSSE de prix → AUCUNE notification.
 *  - Produit NON suivi → AUCUNE notification (le trigger ne cible que les watchers).
 *  - Le payload ne contient QUE le prix public (pas de marge/coût).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const testTag = `pw118-${Date.now()}`
let sb: SupabaseClient // service_role

let buyerId = ''
let watcherId = ''
let productId = ''
const createdUsers: string[] = []

async function mkUser(suffix: string, role: string): Promise<string> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: 'PriceWatch118-2026!X',
    email_confirm: true,
    user_metadata: { role, full_name: suffix },
  })
  if (error || !data.user) throw new Error(`mkUser(${suffix}): ${error?.message}`)
  createdUsers.push(data.user.id)
  await sb.from('profiles').update({ role, status: 'approved' }).eq('id', data.user.id)
  return data.user.id
}

async function priceDropNotifs(recipientId: string) {
  const { data } = await sb
    .from('notifications')
    .select('id, event, payload')
    .eq('recipient_id', recipientId)
    .eq('event', 'price_drop')
  return (data ?? []) as { id: string; event: string; payload: Record<string, unknown> }[]
}

describe('Migration 118 — trigger alerte baisse de prix', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'price-watch-118-setup')
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    buyerId = await mkUser('pwbuyer', 'wholesaler')
    watcherId = await mkUser('pwwatcher', 'wholesaler')

    const { data: sp, error } = await sb
      .from('supplier_products')
      .insert({
        supplier_id: buyerId, // peu importe le fournisseur pour ce test
        product_name: `[${testTag}] Produit prix`,
        category: 'test',
        unit: 'pcs',
        supplier_type: 'morocco',
        availability_type: 'local_stock',
        source_currency: 'MAD',
        min_quantity: 10,
        approval_status: 'approved',
        // Contrainte sp_mad_identity : pour source MAD, fx=1 et suggested === price_source.
        fx_rate_source_to_mad: 1,
        price_source: 100,
        suggested_wholesale_price_mad: 100,
      })
      .select('id')
      .single()
    if (error || !sp) throw new Error(`supplier_products: ${error?.message}`)
    productId = sp.id

    // Le watcher suit le produit ; buyer ne le suit PAS.
    const { error: wErr } = await sb
      .from('product_watches')
      .insert({ buyer_id: watcherId, supplier_product_id: productId })
    if (wErr) throw new Error(`product_watches: ${wErr.message}`)
  }, 120_000)

  afterAll(async () => {
    if (!sb) return
    await sb.from('product_watches').delete().eq('supplier_product_id', productId)
    await sb.from('supplier_products').delete().eq('id', productId)
    for (const uid of createdUsers) {
      await sb.from('notifications').delete().eq('recipient_id', uid)
      await sb.auth.admin.deleteUser(uid).catch(() => {})
    }
  }, 60_000)

  it('BAISSE de prix → notification price_drop pour le watcher (payload = prix public)', async () => {
    // 100 → 80
    const { error } = await sb
      .from('supplier_products')
      .update({ suggested_wholesale_price_mad: 80, price_source: 80 })
      .eq('id', productId)
    expect(error).toBeNull()

    const notifs = await priceDropNotifs(watcherId)
    expect(notifs).toHaveLength(1)
    const p = notifs[0].payload
    expect(p.supplier_product_id).toBe(productId)
    expect(Number(p.old_price)).toBe(100)
    expect(Number(p.new_price)).toBe(80)
    // aucune fuite : payload = prix public + nom uniquement
    expect(Object.keys(p).sort()).toEqual(
      ['new_price', 'old_price', 'product_name', 'supplier_product_id'].sort(),
    )
  })

  it('produit NON suivi → aucune notification pour le buyer', async () => {
    const notifs = await priceDropNotifs(buyerId)
    expect(notifs).toHaveLength(0)
  })

  it('HAUSSE de prix → AUCUNE nouvelle notification', async () => {
    const before = (await priceDropNotifs(watcherId)).length
    // 80 → 95 (hausse)
    const { error } = await sb
      .from('supplier_products')
      .update({ suggested_wholesale_price_mad: 95, price_source: 95 })
      .eq('id', productId)
    expect(error).toBeNull()

    const after = (await priceDropNotifs(watcherId)).length
    expect(after).toBe(before)
  })

  it('nouvelle BAISSE → nouvelle notification (chaque vraie baisse alerte)', async () => {
    const before = (await priceDropNotifs(watcherId)).length
    // 95 → 70
    await sb.from('supplier_products').update({ suggested_wholesale_price_mad: 70, price_source: 70 }).eq('id', productId)
    const after = (await priceDropNotifs(watcherId)).length
    expect(after).toBe(before + 1)
  })
})
