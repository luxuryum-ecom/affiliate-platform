/**
 * Lot B — Preuves RUNTIME : scan livraison livreur + durcissement access_code.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT (assertLocalSupabase).
 * Prouve :
 *  1. Durcissement (mig 127) : access_code_hash + TTL ; resolve_courier_by_access_code
 *     renvoie le bon livreur pour le bon code, NULL pour un mauvais code, NULL si expiré.
 *  2. Rate-limit : > 10 tentatives rapides même IP → exception.
 *  3. record_delivery_scan 'delivered_collected' → order 'delivered', courier_id posé,
 *     LEDGER cod_collected posté (trigger 122), commission 'pending' créée. Rescan = pas
 *     de double-poste (idempotent).
 *  4. 'delivery_refused' → order 'returned', contre-passation ledger, scan_events tracé.
 *
 * RÈGLES ABSOLUES : jamais la prod ; clés via getLocalSupabaseEnv() ; aucun secret en dur.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const testTag = `lotb-scan-${Date.now()}`
const CODE_OK = `LOTBCODE${testTag.slice(-8).toUpperCase()}` // ≥ 8 chars
const CODE_BAD = 'WRONGCODE00000000'

let sb: SupabaseClient
let affiliateId: string
let productId: string
let courierId: string
let courierExpiredId: string
let orderCollectId: string
let orderRefuseId: string

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

async function seedOrder(total: number): Promise<string> {
  const { data, error } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: `Client LotB ${testTag}`,
      customer_phone: '0600000000',
      customer_city: 'Casablanca',
      customer_address: 'a',
      quantity: 1,
      total_amount: total,
      commission_amount: 50,
      affiliate_commission_mad_snapshot: 50,
      status: 'confirmed',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed order: ${error?.message}`)
  return data.id as string
}

describe('Lot B — scan livraison + durcissement access_code (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-b-setup')
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: aff } = await sb.auth.admin.createUser({
      email: `taff-${testTag}@test.local`,
      password: 'TestLotB2026!X',
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${testTag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await sb.from('products').insert({ name: `Prod LotB ${testTag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    // Livreur actif avec code hashé + TTL futur
    const { data: cr } = await sb
      .from('couriers')
      .insert({ name: `Livreur LotB ${testTag}`, courier_type: 'personal', status: 'active',
        access_code_hash: sha256Hex(CODE_OK), access_code_expires_at: new Date(Date.now() + 864e5).toISOString() })
      .select('id').single()
    courierId = cr!.id

    // Livreur avec code EXPIRÉ
    const { data: cx } = await sb
      .from('couriers')
      .insert({ name: `Livreur EXP ${testTag}`, courier_type: 'personal', status: 'active',
        access_code_hash: sha256Hex(`EXPIRED${testTag.slice(-8).toUpperCase()}`), access_code_expires_at: new Date(Date.now() - 864e5).toISOString() })
      .select('id').single()
    courierExpiredId = cx!.id

    orderCollectId = await seedOrder(30000)
    orderRefuseId = await seedOrder(20000)
  }, 60000)

  it('1. resolve renvoie le bon livreur pour le bon code, NULL pour un mauvais', async () => {
    const { data: ok } = await sb.rpc('resolve_courier_by_access_code', { p_code: CODE_OK, p_ip: '10.0.0.1' })
    expect(ok).toBe(courierId)
    const { data: bad } = await sb.rpc('resolve_courier_by_access_code', { p_code: CODE_BAD, p_ip: '10.0.0.2' })
    expect(bad).toBeNull()
  })

  it('2. code EXPIRÉ → resolve NULL', async () => {
    const { data } = await sb.rpc('resolve_courier_by_access_code', {
      p_code: `EXPIRED${testTag.slice(-8).toUpperCase()}`, p_ip: '10.0.0.3',
    })
    expect(data).toBeNull()
  })

  it('3. rate-limit : > 10 tentatives rapides même IP → exception', async () => {
    const ip = '10.9.9.9'
    let raised = false
    for (let i = 0; i < 15; i++) {
      const { error } = await sb.rpc('resolve_courier_by_access_code', { p_code: CODE_BAD, p_ip: ip })
      if (error) { raised = true; break }
    }
    expect(raised).toBe(true)
  })

  it('4. delivered_collected → delivered + courier_id + ledger cod_collected + commission pending', async () => {
    const { error } = await sb.rpc('record_delivery_scan', {
      p_order_id: orderCollectId, p_courier_id: courierId, p_outcome: 'delivered_collected', p_tracking_ref: null,
    })
    expect(error).toBeNull()

    const { data: o } = await sb.from('orders').select('status, courier_id').eq('id', orderCollectId).single()
    expect(o!.status).toBe('delivered')
    expect(o!.courier_id).toBe(courierId)

    // Ledger cod_collected posté par le trigger 122 (pas dupliqué par le scan).
    const { data: txn } = await sb.from('ledger_transactions').select('id')
      .eq('idempotency_key', `cod_collected:${orderCollectId}`).maybeSingle()
    expect(txn).not.toBeNull()

    // Commission 'pending' créée.
    const { data: com } = await sb.from('commissions').select('status').eq('order_id', orderCollectId).maybeSingle()
    expect(com?.status).toBe('pending')

    // scan_events tracé.
    const { data: se } = await sb.from('scan_events').select('id').eq('scan_type', 'delivered_collected').eq('order_id', orderCollectId)
    expect((se?.length ?? 0)).toBeGreaterThan(0)
  })

  it('5. rescan delivered_collected = idempotent (pas de 2e txn cod_collected)', async () => {
    await sb.rpc('record_delivery_scan', { p_order_id: orderCollectId, p_courier_id: courierId, p_outcome: 'delivered_collected', p_tracking_ref: null })
    const { data: txns } = await sb.from('ledger_transactions').select('id').eq('idempotency_key', `cod_collected:${orderCollectId}`)
    expect(txns?.length).toBe(1)
  })

  it('6. delivery_refused → returned + contre-passation', async () => {
    // d\'abord livrer, puis refuser (retour après livraison) pour déclencher la contre-passation.
    await sb.rpc('record_delivery_scan', { p_order_id: orderRefuseId, p_courier_id: courierId, p_outcome: 'delivered_collected', p_tracking_ref: null })
    const { error } = await sb.rpc('record_delivery_scan', { p_order_id: orderRefuseId, p_courier_id: courierId, p_outcome: 'delivery_refused', p_tracking_ref: null })
    expect(error).toBeNull()
    const { data: o } = await sb.from('orders').select('status').eq('id', orderRefuseId).single()
    expect(o!.status).toBe('returned')
    const { data: rev } = await sb.from('ledger_transactions').select('id').eq('idempotency_key', `cod_reversal:${orderRefuseId}`).maybeSingle()
    expect(rev).not.toBeNull()
  })

  afterAll(async () => {
    if (!sb) return
    try {
      await sb.from('scan_events').delete().in('order_id', [orderCollectId, orderRefuseId])
    } catch { /* append-only : toléré */ }
    try {
      await sb.from('orders').update({ courier_id: null }).in('id', [orderCollectId, orderRefuseId])
      await sb.from('couriers').delete().in('id', [courierId, courierExpiredId])
      await sb.from('courier_access_attempts').delete().eq('ip', '10.9.9.9')
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch { /* toléré en local */ }
  })
})
