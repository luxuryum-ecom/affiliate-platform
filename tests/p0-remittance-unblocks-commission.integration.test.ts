/**
 * P0 — Preuve RUNTIME : la RÉCONCILIATION du versement livreur DÉBLOQUE la commission.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Prouve, de bout en bout, le cœur du lot P0 :
 *  1. Une commande COD LIVRÉE crée une commission 'pending' (trigger mig 122) et poste
 *     l'encaissement au grand livre (cash_in_transit_courier).
 *  2. AVANT réconciliation : approuver la commission (status→'approved') ÉCHOUE
 *     (garde N1, mig 123) — même en service_role (trigger SECURITY DEFINER, non contournable).
 *  3. reconcile_courier_remittance (mig 122, appelée par l'action reconcileRemittance)
 *     crée le bordereau, poste platform_cash ← cash_in_transit_courier, et
 *     AUTO-APPROUVE la commission couverte (mig 123). => la commission passe 'approved'.
 *  4. La commande n'apparaît plus dans v_courier_remittance_pending (mig 125).
 *  5. Le grand livre a une transaction kind='courier_remittance'.
 *  6. VERSEMENT PARTIEL (reçu < attendu) : la créance reste CHIFFRÉE dans
 *     cash_in_transit_courier (v_courier_cash_in_transit.balance_mad > 0).
 *
 * RÈGLES ABSOLUES (CLAUDE.md) : jamais la prod ; clés via getLocalSupabaseEnv() ;
 * aucun secret en dur ; argent en entiers (centimes MAD), aucun float.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const TEST_PASSWORD = 'TestP0Remit2026!X'
const testTag = `p0remit-${Date.now()}`

let LOCAL_URL: string
let LOCAL_SERVICE_KEY: string
let sb: SupabaseClient // service_role (seed + assertions + RPC admin-équivalent)

let affiliateId: string
let productId: string
let orderFullId: string // versement TOTAL
let orderPartialId: string // versement PARTIEL

const TOTAL_FULL = 30000 // 300.00 MAD
const COMMISSION_FULL = 5000 // 50.00 MAD
const TOTAL_PARTIAL = 20000 // 200.00 MAD
const COMMISSION_PARTIAL = 4000 // 40.00 MAD
const RECEIVED_PARTIAL = 12000 // 120.00 MAD reçu → créance 80.00 MAD

async function mkUser(suffix: string, role: 'admin' | 'affiliate', name: string): Promise<string> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: name },
  })
  if (error || !data.user) throw new Error(`mkUser(${suffix}): ${error?.message ?? 'user null'}`)
  await sb.from('profiles').update({ role, status: 'approved', full_name: name }).eq('id', data.user.id)
  return data.user.id
}

/** Seed une commande COD, la passe à 'delivered' (déclenche commission + ledger). */
async function seedDeliveredOrder(total: number, commission: number): Promise<string> {
  const { data: ord, error: ordErr } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: `Client P0 ${testTag}`,
      customer_phone: '0699999999',
      customer_city: 'Casablanca',
      customer_address: '42 Rue P0 Test',
      quantity: 1,
      total_amount: total,
      commission_amount: commission,
      affiliate_commission_mad_snapshot: commission,
      status: 'confirmed',
    })
    .select('id')
    .single()
  if (ordErr || !ord) throw new Error(`seed order: ${ordErr?.message}`)
  const orderId = ord.id as string

  // Passage à 'delivered' → trigger handle_order_delivered (mig 122) :
  // crée la commission 'pending' + poste l'encaissement COD au grand livre.
  const { error: updErr } = await sb
    .from('orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', orderId)
  if (updErr) throw new Error(`deliver order: ${updErr.message}`)
  return orderId
}

async function commissionStatus(orderId: string): Promise<string | null> {
  const { data } = await sb.from('commissions').select('status').eq('order_id', orderId).maybeSingle()
  return (data?.status as string) ?? null
}

describe('P0 — Réconciliation livreur débloque la commission (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'p0-remittance-setup')
    LOCAL_URL = env.url
    LOCAL_SERVICE_KEY = env.serviceKey
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    sb = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    affiliateId = await mkUser('taff', 'affiliate', `TestAff ${testTag}`)

    const { data: prod, error: prodErr } = await sb
      .from('products')
      .insert({ name: `Produit P0 ${testTag}`, sell_price: TOTAL_FULL })
      .select('id')
      .single()
    if (prodErr || !prod) throw new Error(`products: ${prodErr?.message}`)
    productId = prod.id

    orderFullId = await seedDeliveredOrder(TOTAL_FULL, COMMISSION_FULL)
    orderPartialId = await seedDeliveredOrder(TOTAL_PARTIAL, COMMISSION_PARTIAL)
  }, 60000)

  it('1. la livraison crée une commission pending', async () => {
    expect(await commissionStatus(orderFullId)).toBe('pending')
  })

  it('2. AVANT réconciliation : approuver la commission ÉCHOUE (garde N1)', async () => {
    const { error } = await sb
      .from('commissions')
      .update({ status: 'approved' })
      .eq('order_id', orderFullId)
    // La garde N1 (mig 123) lève une exception → supabase renvoie une erreur.
    expect(error).not.toBeNull()
    // La commission reste 'pending' (aucune écriture).
    expect(await commissionStatus(orderFullId)).toBe('pending')
  })

  it('3. la commande figure dans v_courier_remittance_pending AVANT réconciliation', async () => {
    const { data } = await sb
      .from('v_courier_remittance_pending')
      .select('order_id, expected_amount_mad')
      .eq('order_id', orderFullId)
      .maybeSingle()
    expect(data?.order_id).toBe(orderFullId)
    expect(Number(data?.expected_amount_mad)).toBe(TOTAL_FULL)
  })

  it('4. reconcile (montant TOTAL) → commission AUTO-APPROUVÉE + sortie du pending', async () => {
    const { error: rpcErr } = await sb.rpc('reconcile_courier_remittance', {
      p_courier_name: `Livreur ${testTag}`,
      p_received_amount: TOTAL_FULL,
      p_order_ids: [orderFullId],
      p_idempotency_key: `test-remit-full-${testTag}`,
      p_reference: 'BORD-FULL',
      p_notes: null,
      p_courier_id: null,
    })
    expect(rpcErr).toBeNull()

    // Auto-approbation (mig 123).
    expect(await commissionStatus(orderFullId)).toBe('approved')

    // Sortie du pending (mig 125).
    const { data: stillPending } = await sb
      .from('v_courier_remittance_pending')
      .select('order_id')
      .eq('order_id', orderFullId)
      .maybeSingle()
    expect(stillPending).toBeNull()

    // Grand livre : une transaction courier_remittance existe.
    const { data: txns } = await sb
      .from('ledger_transactions')
      .select('id, kind')
      .eq('kind', 'courier_remittance')
    expect((txns?.length ?? 0)).toBeGreaterThan(0)
  })

  it('5. idempotence : rejeu de la même réconciliation ne duplique pas', async () => {
    const before = await sb
      .from('courier_remittances')
      .select('id')
      .eq('idempotency_key', `test-remit-full-${testTag}`)
    const { error } = await sb.rpc('reconcile_courier_remittance', {
      p_courier_name: `Livreur ${testTag}`,
      p_received_amount: TOTAL_FULL,
      p_order_ids: [orderFullId],
      p_idempotency_key: `test-remit-full-${testTag}`,
      p_reference: 'BORD-FULL',
      p_notes: null,
      p_courier_id: null,
    })
    expect(error).toBeNull()
    const after = await sb
      .from('courier_remittances')
      .select('id')
      .eq('idempotency_key', `test-remit-full-${testTag}`)
    expect(after.data?.length).toBe(before.data?.length) // toujours 1
  })

  it('6. versement PARTIEL : la créance livreur reste chiffrée (cash_in_transit > 0)', async () => {
    const { error: rpcErr } = await sb.rpc('reconcile_courier_remittance', {
      p_courier_name: `LivreurPartiel ${testTag}`,
      p_received_amount: RECEIVED_PARTIAL,
      p_order_ids: [orderPartialId],
      p_idempotency_key: `test-remit-partial-${testTag}`,
      p_reference: 'BORD-PARTIAL',
      p_notes: null,
      p_courier_id: null,
    })
    expect(rpcErr).toBeNull()

    // La commission partielle est quand même approuvée (réconciliée).
    expect(await commissionStatus(orderPartialId)).toBe('approved')

    // Créance globale > 0 : il reste du cash encaissé non reversé (attendu − reçu).
    const { data: transit } = await sb
      .from('v_courier_cash_in_transit')
      .select('balance_mad')
      .maybeSingle()
    expect(Number(transit?.balance_mad)).toBeGreaterThan(0)
  })

  afterAll(async () => {
    if (!sb) return
    // Nettoyage best-effort (LOCAL). Les lignes ledger sont immuables (append-only) →
    // non supprimables par design ; on laisse. On retire ce qui est supprimable.
    try {
      await sb.from('courier_remittance_orders').delete().in('order_id', [orderFullId, orderPartialId])
      await sb
        .from('courier_remittances')
        .delete()
        .in('idempotency_key', [`test-remit-full-${testTag}`, `test-remit-partial-${testTag}`])
      await sb.from('commissions').delete().in('order_id', [orderFullId, orderPartialId])
    } catch {
      /* FK/immutabilité : toléré en local */
    }
    try {
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch {
      /* toléré */
    }
  })
})
