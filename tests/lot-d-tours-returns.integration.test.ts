/**
 * Lot D — Preuves RUNTIME : tournées + scan ramassage + retours 3 cas (chaîne de garde).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT (assertLocalSupabase).
 * Prouve :
 *  1. Pickup (record_pickup_scan) : orders.courier_id posé (transfert de garde),
 *     scan_events 'pickup_dispatch' tracé, ZÉRO écriture ledger, lien tournée OK
 *     (courier_tour_orders).
 *  2. CHAÎNE DE GARDE : declare_courier_return → courier_returns state='declared',
 *     orders.status INCHANGÉ, AUCUNE contre-passation ledger — la dette du livreur
 *     ne bouge PAS tant que non confirmé (RETOUR_DÉCLARÉ_NON_CONFIRMÉ, §🔒).
 *  3. CAS 1 confirm_return_depot : EXIGE une déclaration préalable (sans →
 *     RAISE) ; avec déclaration → state='confirmed_depot', orders.status='returned',
 *     scan_events 'return_received' tracé, contre-passation ledger présente
 *     (idempotency_key cod_reversal:<order_id>, trigger 122 réutilisé).
 *  4. CAS 3 mark_return_lost : state='lost' + ligne courier_product_debts
 *     (amount_mad > 0), reflétée dans v_courier_balances.product_debt_mad.
 *     Immuable : UPDATE/DELETE de la ligne échoue (trigger append-only mig 126).
 *  5. Cloisonnement : declare_courier_return sur une commande d'un AUTRE livreur
 *     → RAISE (le livreur ne déclare que ses propres colis).
 *
 * RÈGLES ABSOLUES : jamais la prod ; clés via getLocalSupabaseEnv() ; aucun secret en dur.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { recordDeliveryScan } from '@/app/actions/courier-scan'

const testTag = `lotd-${Date.now()}`

let sb: SupabaseClient
let affiliateId: string
let productId: string
let courierA: string
let courierB: string
let tourId: string
let orderPickup: string
let orderReturnDepot: string
let orderLost: string
let orderCloisonnement: string

async function seedOrder(courier: string | null, status: string, total: number): Promise<string> {
  const { data, error } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: `Client LotD ${testTag}`,
      customer_phone: '0600000000',
      customer_city: 'Casablanca',
      customer_address: 'a',
      quantity: 1,
      total_amount: total,
      commission_amount: 50,
      affiliate_commission_mad_snapshot: 50,
      status,
      courier_id: courier,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed order: ${error?.message}`)
  return data.id as string
}

describe('Lot D — tournées + scan ramassage + retours 3 cas (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-d-setup')
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: aff } = await sb.auth.admin.createUser({
      email: `taff-${testTag}@test.local`,
      password: 'TestLotD2026!X',
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${testTag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await sb.from('products').insert({ name: `Prod LotD ${testTag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    const { data: crA } = await sb
      .from('couriers')
      .insert({ name: `Livreur A LotD ${testTag}`, courier_type: 'personal', status: 'active' })
      .select('id')
      .single()
    courierA = crA!.id

    const { data: crB } = await sb
      .from('couriers')
      .insert({ name: `Livreur B LotD ${testTag}`, courier_type: 'personal', status: 'active' })
      .select('id')
      .single()
    courierB = crB!.id

    const { data: tour } = await sb
      .from('courier_tours')
      .insert({ courier_id: courierA, tour_date: new Date().toISOString().slice(0, 10) })
      .select('id')
      .single()
    tourId = tour!.id

    orderPickup = await seedOrder(null, 'confirmed', 25000)
    orderReturnDepot = await seedOrder(courierA, 'confirmed', 30000)
    orderLost = await seedOrder(courierA, 'confirmed', 15000)
    orderCloisonnement = await seedOrder(courierA, 'confirmed', 10000)
  }, 60000)

  it('1. record_pickup_scan → transfert de garde + scan pickup_dispatch + ZÉRO ledger + lien tournée', async () => {
    const { data, error } = await sb.rpc('record_pickup_scan', {
      p_order_id: orderPickup,
      p_courier_id: courierA,
      p_tour_id: tourId,
    })
    expect(error).toBeNull()
    expect((data as { order_id: string }).order_id).toBe(orderPickup)

    const { data: o } = await sb.from('orders').select('courier_id, status').eq('id', orderPickup).single()
    expect(o!.courier_id).toBe(courierA)
    expect(o!.status).toBe('confirmed') // pickup ne change JAMAIS le statut commande

    const { data: se } = await sb
      .from('scan_events')
      .select('id')
      .eq('scan_type', 'pickup_dispatch')
      .eq('order_id', orderPickup)
    expect((se?.length ?? 0)).toBeGreaterThan(0)

    // ZÉRO écriture ledger (le pickup est un mouvement de garde, pas financier).
    const { data: txns } = await sb.from('ledger_transactions').select('id').eq('order_id', orderPickup)
    expect(txns?.length ?? 0).toBe(0)

    const { data: link } = await sb
      .from('courier_tour_orders')
      .select('tour_id')
      .eq('order_id', orderPickup)
      .maybeSingle()
    expect(link?.tour_id).toBe(tourId)
  })

  it('2. CHAÎNE DE GARDE : declare_courier_return → declared, orders.status INCHANGÉ, ZÉRO contre-passation', async () => {
    // Livre d'abord la commande pour que la contre-passation soit observable
    // au CAS 1 (test 3) — l'encaissement COD (cod_collected) est posté par le
    // trigger 122, INCHANGÉ ici.
    const { error: scanErr } = await sb.rpc('record_delivery_scan', {
      p_order_id: orderReturnDepot,
      p_courier_id: courierA,
      p_outcome: 'delivered_collected',
      p_tracking_ref: null,
    })
    expect(scanErr).toBeNull()
    const { data: delivered } = await sb.from('orders').select('status').eq('id', orderReturnDepot).single()
    expect(delivered!.status).toBe('delivered')

    const { data, error } = await sb.rpc('declare_courier_return', {
      p_order_id: orderReturnDepot,
      p_courier_id: courierA,
    })
    expect(error).toBeNull()
    expect((data as { state: string }).state).toBe('declared')

    const { data: ret } = await sb
      .from('courier_returns')
      .select('state')
      .eq('order_id', orderReturnDepot)
      .single()
    expect(ret!.state).toBe('declared')

    // Statut commande INCHANGÉ (toujours 'delivered', pas 'returned').
    const { data: o } = await sb.from('orders').select('status').eq('id', orderReturnDepot).single()
    expect(o!.status).toBe('delivered')

    // AUCUNE contre-passation ledger tant que non confirmé — la dette reste inchangée.
    const { data: rev } = await sb
      .from('ledger_transactions')
      .select('id')
      .eq('idempotency_key', `cod_reversal:${orderReturnDepot}`)
      .maybeSingle()
    expect(rev).toBeNull()
  })

  it('3a. confirm_return_depot SANS déclaration préalable → RAISE', async () => {
    const noDecl = await seedOrder(courierA, 'confirmed', 5000)
    const { error } = await sb.rpc('confirm_return_depot', { p_order_id: noDecl })
    expect(error).not.toBeNull()
  })

  it('3b. CAS 1 confirm_return_depot AVEC déclaration → confirmed_depot + returned + contre-passation + scan_events', async () => {
    const { data, error } = await sb.rpc('confirm_return_depot', { p_order_id: orderReturnDepot })
    expect(error).toBeNull()
    expect((data as { state: string }).state).toBe('confirmed_depot')

    const { data: ret } = await sb
      .from('courier_returns')
      .select('state, confirmed_at')
      .eq('order_id', orderReturnDepot)
      .single()
    expect(ret!.state).toBe('confirmed_depot')
    expect(ret!.confirmed_at).not.toBeNull()

    const { data: o } = await sb.from('orders').select('status').eq('id', orderReturnDepot).single()
    expect(o!.status).toBe('returned')

    // Contre-passation ledger PRÉSENTE (trigger 122 réutilisé, zéro doublon codé ici).
    const { data: rev } = await sb
      .from('ledger_transactions')
      .select('id')
      .eq('idempotency_key', `cod_reversal:${orderReturnDepot}`)
      .maybeSingle()
    expect(rev).not.toBeNull()

    const { data: se } = await sb
      .from('scan_events')
      .select('id')
      .eq('scan_type', 'return_received')
      .eq('order_id', orderReturnDepot)
    expect((se?.length ?? 0)).toBeGreaterThan(0)
  })

  it('4. CAS 3 mark_return_lost → lost + créance PRODUIT + v_courier_balances + immuable', async () => {
    const { error: declErr } = await sb.rpc('declare_courier_return', {
      p_order_id: orderLost,
      p_courier_id: courierA,
    })
    expect(declErr).toBeNull()

    const { data, error } = await sb.rpc('mark_return_lost', {
      p_order_id: orderLost,
      p_amount_mad: 15000,
      p_quantity: 1,
    })
    expect(error).toBeNull()
    expect((data as { state: string }).state).toBe('lost')

    const { data: ret } = await sb.from('courier_returns').select('state').eq('order_id', orderLost).single()
    expect(ret!.state).toBe('lost')

    const { data: debt } = await sb
      .from('courier_product_debts')
      .select('id, amount_mad, courier_id, reason')
      .eq('order_id', orderLost)
      .single()
    expect(debt!.amount_mad).toBeGreaterThan(0)
    expect(debt!.courier_id).toBe(courierA)

    const { data: bal } = await sb
      .from('v_courier_balances')
      .select('product_debt_mad')
      .eq('id', courierA)
      .single()
    expect(Number(bal!.product_debt_mad)).toBeGreaterThanOrEqual(15000)

    // Immuable : ni UPDATE ni DELETE (append-only, calque mig 126/100).
    const { error: updErr } = await sb.from('courier_product_debts').update({ amount_mad: 1 }).eq('id', debt!.id)
    expect(updErr).not.toBeNull()
    const { error: delErr } = await sb.from('courier_product_debts').delete().eq('id', debt!.id)
    expect(delErr).not.toBeNull()
  })

  it('5. Cloisonnement : declare_courier_return sur la commande d\'un AUTRE livreur → RAISE', async () => {
    // orderCloisonnement appartient à courierA — courierB tente de le déclarer.
    const { error } = await sb.rpc('declare_courier_return', {
      p_order_id: orderCloisonnement,
      p_courier_id: courierB,
    })
    expect(error).not.toBeNull()

    const { data: ret } = await sb
      .from('courier_returns')
      .select('id')
      .eq('order_id', orderCloisonnement)
      .maybeSingle()
    expect(ret).toBeNull()
  })

  it('6. @finance P1-A : recordDeliveryScan(delivery_refused) est REFUSÉ (le refus ne peut pas contre-passer sans confirmation)', async () => {
    // Le schéma de l'action n'accepte plus que 'delivered_collected'. Un appel forgé
    // avec 'delivery_refused' échoue AVANT toute écriture (safeParse) → dette protégée.
    const res = await recordDeliveryScan({
      code: 'X'.repeat(16),
      orderId: orderCloisonnement,
      outcome: 'delivery_refused',
    } as unknown as Parameters<typeof recordDeliveryScan>[0])
    expect(res.error).toBeTruthy()
    expect(res.newStatus).toBeNull()
  })

  it('7. @finance P1-B : mark_return_lost sur une commande LIVRÉE → RAISE (pas de double-comptage cash+produit)', async () => {
    const orderDeliveredLost = await seedOrder(courierA, 'confirmed', 22000)
    // Livrer (cash_owed compte déjà total_amount).
    await sb.rpc('record_delivery_scan', {
      p_order_id: orderDeliveredLost, p_courier_id: courierA, p_outcome: 'delivered_collected', p_tracking_ref: null,
    })
    await sb.rpc('declare_courier_return', { p_order_id: orderDeliveredLost, p_courier_id: courierA })
    // Marquer perte sur une commande livrée → interdit (double dette).
    const { error } = await sb.rpc('mark_return_lost', {
      p_order_id: orderDeliveredLost, p_amount_mad: 22000, p_quantity: 1,
    })
    expect(error).not.toBeNull()
    // Nettoyage.
    await sb.from('orders').update({ courier_id: null }).eq('id', orderDeliveredLost)
  })

  afterAll(async () => {
    if (!sb) return
    const orderIds = [orderPickup, orderReturnDepot, orderLost, orderCloisonnement].filter(Boolean)
    try {
      await sb.from('scan_events').delete().in('order_id', orderIds)
    } catch {
      /* append-only : toléré */
    }
    try {
      await sb.from('courier_returns').delete().in('order_id', orderIds)
      await sb.from('courier_tour_orders').delete().eq('tour_id', tourId)
      await sb.from('courier_tours').delete().eq('id', tourId)
      await sb.from('orders').delete().in('id', orderIds)
      const { data: extraOrders } = await sb.from('orders').select('id').in('courier_id', [courierA, courierB])
      if (extraOrders?.length) {
        await sb.from('orders').delete().in('id', extraOrders.map((o) => o.id as string))
      }
      await sb.from('couriers').delete().in('id', [courierA, courierB])
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch {
      /* toléré en local */
    }
  })
})
