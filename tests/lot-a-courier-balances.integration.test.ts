/**
 * Module Livreurs (Lot A) — Preuve RUNTIME : le solde livreur CALCULÉ
 * (`v_courier_balances`, mig 126) reflète correctement le cash détenu (commandes
 * livrées non réconciliées) + les créances produit (`courier_product_debts`).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Prouve, de bout en bout :
 *  1. Un livreur créé apparaît dans v_courier_balances avec des soldes à 0.
 *  2. 2 commandes livrées assignées (courier_id) → cash_owed_mad = Σ total_amount.
 *  3. Réconcilier une des 2 commandes (reconcile_courier_remittance, mig 122 —
 *     inchangée, réutilisée telle quelle) → elle sort du cash_owed (diminue).
 *  4. Une créance produit (courier_product_debts) → product_debt_mad la reflète,
 *     total_balance_mad = cash + créance.
 *  5. over_cap : plafond bas → true ; plafond haut → false.
 *  6. Immutabilité : UPDATE/DELETE sur courier_product_debts échoue (append-only).
 *
 * DÉCISION D'ARCHI (verrouillée) : le solde livreur est une VUE dérivée — ce
 * test ne touche/modifie AUCUN trigger/RPC du grand livre existant (121-125).
 *
 * RÈGLES ABSOLUES (CLAUDE.md) : jamais la prod ; clés via getLocalSupabaseEnv() ;
 * aucun secret en dur ; argent en numeric MAD (pas de float manuel).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const TEST_PASSWORD = 'TestLotACourier2026!X'
const testTag = `lota-courier-${Date.now()}`

let sb: SupabaseClient // service_role (seed + assertions + RPC)

let affiliateId: string
let productId: string
let courierId: string
let order1Id: string // reste dans le cash_owed (jamais réconciliée)
let order2Id: string // réconciliée → sort du cash_owed

const TOTAL_1 = 10000 // 100.00 MAD
const TOTAL_2 = 15000 // 150.00 MAD
const PRODUCT_DEBT = 3000 // 30.00 MAD

async function balanceRow(id: string) {
  const { data } = await sb
    .from('v_courier_balances')
    .select('id, cash_owed_mad, product_debt_mad, total_balance_mad, over_cap, balance_cap_mad')
    .eq('id', id)
    .maybeSingle()
  return data as {
    id: string
    cash_owed_mad: number
    product_debt_mad: number
    total_balance_mad: number
    over_cap: boolean
    balance_cap_mad: number
  } | null
}

describe('Lot A — Registre livreurs : v_courier_balances (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-a-courier-balances-setup')

    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userErr } = await sb.auth.admin.createUser({
      email: `taff-${testTag}@test.local`,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `TestAff ${testTag}` },
    })
    if (userErr || !userData.user) throw new Error(`mkUser: ${userErr?.message ?? 'user null'}`)
    affiliateId = userData.user.id
    await sb
      .from('profiles')
      .update({ role: 'affiliate', status: 'approved', full_name: `TestAff ${testTag}` })
      .eq('id', affiliateId)

    const { data: prod, error: prodErr } = await sb
      .from('products')
      .insert({ name: `Produit LotA ${testTag}`, sell_price: TOTAL_1 })
      .select('id')
      .single()
    if (prodErr || !prod) throw new Error(`products: ${prodErr?.message}`)
    productId = prod.id
  }, 60000)

  it('1. un livreur créé apparaît dans v_courier_balances avec des soldes à 0', async () => {
    const { data: courier, error: courierErr } = await sb
      .from('couriers')
      .insert({
        name: `Livreur ${testTag}`,
        courier_type: 'personal',
        balance_cap_mad: 0,
        access_code: `TEST${testTag.slice(-8).toUpperCase()}`,
      })
      .select('id')
      .single()
    if (courierErr || !courier) throw new Error(`couriers: ${courierErr?.message}`)
    courierId = courier.id as string

    const row = await balanceRow(courierId)
    expect(row).not.toBeNull()
    expect(Number(row?.cash_owed_mad)).toBe(0)
    expect(Number(row?.product_debt_mad)).toBe(0)
    expect(Number(row?.total_balance_mad)).toBe(0)
    expect(row?.over_cap).toBe(false)
  })

  it('2. 2 commandes livrées assignées → cash_owed_mad = Σ total_amount', async () => {
    async function seedDeliveredOrder(total: number): Promise<string> {
      const { data: ord, error: ordErr } = await sb
        .from('orders')
        .insert({
          affiliate_id: affiliateId,
          product_id: productId,
          courier_id: courierId,
          customer_name: `Client LotA ${testTag}`,
          customer_phone: '0699999999',
          customer_city: 'Casablanca',
          customer_address: '42 Rue LotA Test',
          quantity: 1,
          total_amount: total,
          commission_amount: 0,
          affiliate_commission_mad_snapshot: 0,
          status: 'confirmed',
        })
        .select('id')
        .single()
      if (ordErr || !ord) throw new Error(`seed order: ${ordErr?.message}`)
      const orderId = ord.id as string

      const { error: updErr } = await sb
        .from('orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', orderId)
      if (updErr) throw new Error(`deliver order: ${updErr.message}`)
      return orderId
    }

    order1Id = await seedDeliveredOrder(TOTAL_1)
    order2Id = await seedDeliveredOrder(TOTAL_2)

    const row = await balanceRow(courierId)
    expect(Number(row?.cash_owed_mad)).toBe(TOTAL_1 + TOTAL_2)
    expect(Number(row?.total_balance_mad)).toBe(TOTAL_1 + TOTAL_2)
  })

  it('3. réconcilier une commande (RPC existante, mig 122) → elle sort du cash_owed', async () => {
    const { error: rpcErr } = await sb.rpc('reconcile_courier_remittance', {
      p_courier_name: `Livreur ${testTag}`,
      p_received_amount: TOTAL_2,
      p_order_ids: [order2Id],
      p_idempotency_key: `test-lota-remit-${testTag}`,
      p_reference: 'BORD-LOTA',
      p_notes: null,
      p_courier_id: courierId,
    })
    expect(rpcErr).toBeNull()

    const row = await balanceRow(courierId)
    // order2 (réconciliée) sort du cash_owed ; seule order1 reste.
    expect(Number(row?.cash_owed_mad)).toBe(TOTAL_1)
    expect(Number(row?.total_balance_mad)).toBe(TOTAL_1)
  })

  let debtId: string

  it('4. une créance produit → product_debt_mad la reflète, total = cash + créance', async () => {
    const { data: debt, error: debtErr } = await sb
      .from('courier_product_debts')
      .insert({
        courier_id: courierId,
        order_id: order1Id,
        quantity: 1,
        amount_mad: PRODUCT_DEBT,
        reason: 'Retour manquant (test LotA)',
      })
      .select('id')
      .single()
    if (debtErr || !debt) throw new Error(`courier_product_debts: ${debtErr?.message}`)
    debtId = debt.id as string

    const row = await balanceRow(courierId)
    expect(Number(row?.product_debt_mad)).toBe(PRODUCT_DEBT)
    expect(Number(row?.cash_owed_mad)).toBe(TOTAL_1)
    expect(Number(row?.total_balance_mad)).toBe(TOTAL_1 + PRODUCT_DEBT)
  })

  it('5. over_cap : plafond bas → true ; plafond haut → false', async () => {
    const total = TOTAL_1 + PRODUCT_DEBT

    await sb.from('couriers').update({ balance_cap_mad: total - 1 }).eq('id', courierId)
    let row = await balanceRow(courierId)
    expect(row?.over_cap).toBe(true)

    await sb.from('couriers').update({ balance_cap_mad: total + 1000 }).eq('id', courierId)
    row = await balanceRow(courierId)
    expect(row?.over_cap).toBe(false)

    // Remise à 0 = pas de plafond → jamais over_cap.
    await sb.from('couriers').update({ balance_cap_mad: 0 }).eq('id', courierId)
    row = await balanceRow(courierId)
    expect(row?.over_cap).toBe(false)
  })

  it('6. immutabilité : UPDATE/DELETE sur courier_product_debts échoue', async () => {
    const { error: updErr } = await sb
      .from('courier_product_debts')
      .update({ amount_mad: 1 })
      .eq('id', debtId)
    expect(updErr).not.toBeNull()

    const { error: delErr } = await sb.from('courier_product_debts').delete().eq('id', debtId)
    expect(delErr).not.toBeNull()

    // La ligne originale est intacte (aucune écriture n'est passée).
    const { data: intact } = await sb
      .from('courier_product_debts')
      .select('amount_mad')
      .eq('id', debtId)
      .maybeSingle()
    expect(Number(intact?.amount_mad)).toBe(PRODUCT_DEBT)
  })

  afterAll(async () => {
    if (!sb) return
    try {
      await sb.from('courier_remittance_orders').delete().in('order_id', [order1Id, order2Id])
      await sb.from('courier_remittances').delete().eq('idempotency_key', `test-lota-remit-${testTag}`)
      await sb.from('commissions').delete().in('order_id', [order1Id, order2Id])
      await sb.from('orders').delete().in('id', [order1Id, order2Id])
      // Détacher toute commande résiduelle pointant sur ce livreur (FK courier_id) avant
      // suppression du livreur (sinon la FK bloque). On NE supprime pas ces commandes (ledger).
      await sb.from('orders').update({ courier_id: null }).eq('courier_id', courierId)
      // Retirer la créance produit AVANT le livreur : bloquée par l'immutabilité append-only
      // (trigger, y compris service_role) → le livreur porteur d'une créance n'est PAS supprimable
      // via REST (invariant PROD correct : on n'efface pas une créance). En LOCAL, la purge se
      // fait par la voie maintenance (ALTER TABLE ... DISABLE TRIGGER + delete), hors REST.
      await sb.from('courier_product_debts').delete().eq('courier_id', courierId)
      await sb.from('couriers').delete().eq('id', courierId)
      await sb.from('products').delete().eq('id', productId)
    } catch {
      /* FK/immutabilité créance : toléré en local (purge maintenance si besoin) */
    }
    try {
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch {
      /* toléré */
    }
  })
})
