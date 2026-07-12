/**
 * Lot G — AGENT GARDIEN ANTI-COLLUSION : preuves RUNTIME de FRAUDE SIMULÉE.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT (assertLocalSupabase).
 * Principe directeur : la fraude est STRUCTURELLEMENT IMPOSSIBLE, pas seulement
 * détectée. Les 4 fraudes obligatoires doivent TOUTES échouer :
 *   F1. COLIS FANTÔME     — réception d'un colis jamais ramassé → RAISE.
 *   F2. IMPUTATION CROISÉE— confirmer un porteur ≠ porteur réel → RAISE, dette intacte.
 *   F3. RÉCEPTION FANTÔME — réception sans déclaration livreur → alerte collusion, dette GELÉE.
 *   F4. AUTO-ENCAISSEMENT — un non-admin ne peut pas confirmer un versement (REVOKE) → dette intacte.
 * + chemins nominaux (RÈGLE DU PORTEUR, double confirmation cash), sanctions
 * (perso=auto / société=manuel), détections (retour fantôme 48h), append-only.
 *
 * RÈGLES ABSOLUES : jamais la prod ; clés via getLocalSupabaseEnv() ; aucun secret en dur.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const testTag = `lotg-${Date.now()}`
const STAFF_PWD = 'TestLotG2026!X'

let sb: SupabaseClient
let env: { url: string; anonKey: string; serviceKey: string }
let affiliateId: string
let productId: string
let courierPerso: string
let courierOther: string
let courierCompany: string
let courierPersoBlock: string
let courierCompanyBlock: string

async function seedOrder(courier: string | null, status: string, total: number): Promise<string> {
  const { data, error } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: `Client LotG ${testTag}`,
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

async function newCourier(type: 'personal' | 'company', cap = 0): Promise<string> {
  const { data, error } = await sb
    .from('couriers')
    .insert({ name: `Livreur ${type} ${testTag} ${Math.round(cap)}`, courier_type: type, status: 'active', balance_cap_mad: cap })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed courier: ${error?.message}`)
  return data.id as string
}

/** Ramasse (pickup) + livre un colis pour un porteur — établit la garde légitime. */
async function pickupAndDeliver(orderId: string, courier: string): Promise<void> {
  const { error: p } = await sb.rpc('record_pickup_scan', { p_order_id: orderId, p_courier_id: courier, p_tour_id: undefined })
  if (p) throw new Error(`pickup: ${p.message}`)
  const { error: d } = await sb.rpc('record_delivery_scan', {
    p_order_id: orderId, p_courier_id: courier, p_outcome: 'delivered_collected', p_tracking_ref: null,
  })
  if (d) throw new Error(`deliver: ${d.message}`)
}

describe('Lot G — Agent Gardien anti-collusion (fraude simulée, intégration LOCAL)', () => {
  beforeAll(async () => {
    env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-g-setup')
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: aff } = await sb.auth.admin.createUser({
      email: `tg-${testTag}@test.local`,
      password: STAFF_PWD,
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${testTag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await sb.from('products').insert({ name: `Prod LotG ${testTag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    courierPerso = await newCourier('personal')
    courierOther = await newCourier('personal')
    courierCompany = await newCourier('company')
    courierPersoBlock = await newCourier('personal', 100)
    courierCompanyBlock = await newCourier('company', 100)
  }, 60000)

  // ─── F1 — COLIS FANTÔME ───────────────────────────────────────────────────
  it('F1. COLIS FANTÔME : réception d\'un colis jamais ramassé → REFUS (ghost_parcel)', async () => {
    const ghost = await seedOrder(null, 'confirmed', 20000)
    // resolve_parcel_bearer = NULL (aucun scan pickup_dispatch).
    const { data: bearer } = await sb.rpc('resolve_parcel_bearer', { p_order_id: ghost })
    expect(bearer).toBeNull()

    const { error } = await sb.rpc('record_depot_reception', { p_order_id: ghost, p_actor_id: affiliateId })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('ghost_parcel')
  })

  // ─── F2 — IMPUTATION CROISÉE ──────────────────────────────────────────────
  it('F2. IMPUTATION CROISÉE : confirmer un porteur ≠ porteur réel → REFUS + dette intacte', async () => {
    const ord = await seedOrder(null, 'confirmed', 24000)
    await pickupAndDeliver(ord, courierPerso) // porteur réel = courierPerso
    await sb.rpc('declare_courier_return', { p_order_id: ord, p_courier_id: courierPerso })

    // Tentative d'imputer à courierOther (≠ porteur réel courierPerso).
    const { error } = await sb.rpc('record_depot_reception', {
      p_order_id: ord, p_actor_id: affiliateId, p_confirmed_courier_id: courierOther,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('cross_imputation')

    // La commande reste 'delivered' (aucune contre-passation) → dette du porteur INCHANGÉE.
    const { data: o } = await sb.from('orders').select('status').eq('id', ord).single()
    expect(o!.status).toBe('delivered')
    const { data: rev } = await sb.from('ledger_transactions').select('id').eq('idempotency_key', `cod_reversal:${ord}`).maybeSingle()
    expect(rev).toBeNull()

    // Nettoyage d'état pour ne pas polluer les autres tests.
    await sb.from('courier_returns').delete().eq('order_id', ord)
  })

  // ─── RÈGLE DU PORTEUR — chemin NOMINAL ────────────────────────────────────
  it('OK. RÈGLE DU PORTEUR : réception guidée résout le porteur imposé → retour confirmé + contre-passation', async () => {
    const ord = await seedOrder(null, 'confirmed', 30000)
    await pickupAndDeliver(ord, courierPerso)
    await sb.rpc('declare_courier_return', { p_order_id: ord, p_courier_id: courierPerso })

    const { data, error } = await sb.rpc('record_depot_reception', {
      p_order_id: ord, p_actor_id: affiliateId, p_confirmed_courier_id: courierPerso,
    })
    expect(error).toBeNull()
    const r = data as { bearer_id: string; path: string }
    expect(r.bearer_id).toBe(courierPerso) // porteur DÉDUIT, jamais saisi
    expect(r.path).toBe('nominal')

    const { data: o } = await sb.from('orders').select('status').eq('id', ord).single()
    expect(o!.status).toBe('returned')
    const { data: rev } = await sb.from('ledger_transactions').select('id').eq('idempotency_key', `cod_reversal:${ord}`).maybeSingle()
    expect(rev).not.toBeNull()
    // confirmed_by = acteur RÉEL (≠ Lot D où auth.uid() était NULL).
    const { data: ret } = await sb.from('courier_returns').select('confirmed_by, state').eq('order_id', ord).single()
    expect(ret!.state).toBe('confirmed_depot')
    expect(ret!.confirmed_by).toBe(affiliateId)
  })

  // ─── F3 — RÉCEPTION FANTÔME (collusion) ───────────────────────────────────
  it('F3. RÉCEPTION FANTÔME : réception sans déclaration préalable → alerte collusion + dette GELÉE', async () => {
    const ord = await seedOrder(null, 'confirmed', 18000)
    await pickupAndDeliver(ord, courierPerso) // ramassé + livré, MAIS aucune déclaration de retour

    const { data, error } = await sb.rpc('record_depot_reception', { p_order_id: ord, p_actor_id: affiliateId })
    expect(error).toBeNull()
    expect((data as { path: string }).path).toBe('collusion_flagged')

    // Dette GELÉE : statut inchangé, aucune contre-passation.
    const { data: o } = await sb.from('orders').select('status').eq('id', ord).single()
    expect(o!.status).toBe('delivered')
    const { data: rev } = await sb.from('ledger_transactions').select('id').eq('idempotency_key', `cod_reversal:${ord}`).maybeSingle()
    expect(rev).toBeNull()

    // Alerte critique de collusion tracée.
    const { data: alert } = await sb
      .from('guardian_alerts')
      .select('id, severity, staff_id')
      .eq('alert_type', 'reception_without_declaration')
      .eq('order_id', ord)
      .maybeSingle()
    expect(alert).not.toBeNull()
    expect(alert!.severity).toBe('critical')
    expect(alert!.staff_id).toBe(affiliateId)
  })

  // ─── F4 — ANTI AUTO-ENCAISSEMENT ──────────────────────────────────────────
  it('F4. AUTO-ENCAISSEMENT : un versement déclaré ne fait PAS tomber la dette + un non-admin ne peut pas confirmer', async () => {
    const ord = await seedOrder(null, 'confirmed', 22000)
    await pickupAndDeliver(ord, courierPerso)

    // Déclaration du versement → pending, AUCUNE réconciliation.
    const { data: decl, error: declErr } = await sb.rpc('declare_courier_cash', {
      p_courier_id: courierPerso, p_order_ids: [ord], p_amount_mad: 22000, p_method: 'cash',
      p_actor_id: affiliateId, p_idempotency_key: `decl-${testTag}-${ord}`,
    })
    expect(declErr).toBeNull()
    const confId = (decl as { id: string }).id
    // Pas encore de bordereau pour cette commande.
    const { data: cro0 } = await sb.from('courier_remittance_orders').select('order_id').eq('order_id', ord).maybeSingle()
    expect(cro0).toBeNull()

    // Un NON-ADMIN (affilié authentifié) tente de confirmer → REVOKE authenticated → refus.
    const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signErr } = await anon.auth.signInWithPassword({ email: `tg-${testTag}@test.local`, password: STAFF_PWD })
    expect(signErr).toBeNull()
    const { error: forbErr } = await anon.rpc('confirm_cash_receipt', { p_confirmation_id: confId, p_actor_id: affiliateId })
    expect(forbErr).not.toBeNull() // permission denied for function confirm_cash_receipt

    // Toujours aucune réconciliation (dette intacte).
    const { data: cro1 } = await sb.from('courier_remittance_orders').select('order_id').eq('order_id', ord).maybeSingle()
    expect(cro1).toBeNull()

    // L'ADMIN (service_role) confirme avec un compte DISTINCT du déclarant → dette tombe.
    const { data: conf, error: confErr } = await sb.rpc('confirm_cash_receipt', { p_confirmation_id: confId, p_actor_id: randomUUID() })
    expect(confErr).toBeNull()
    expect((conf as { remittance_id: string }).remittance_id).toBeTruthy()
    const { data: cro2 } = await sb.from('courier_remittance_orders').select('order_id').eq('order_id', ord).maybeSingle()
    expect(cro2).not.toBeNull()
    const { data: c } = await sb.from('courier_cash_confirmations').select('state').eq('id', confId).single()
    expect(c!.state).toBe('confirmed')
  })

  // ─── SANCTIONS ────────────────────────────────────────────────────────────
  it('S1. SANCTION PERSO : dépassement de plafond → blocage AUTOMATIQUE + trace + alerte', async () => {
    const ord = await seedOrder(null, 'confirmed', 25000)
    await pickupAndDeliver(ord, courierPersoBlock) // cash_owed 25000 > cap 100 → over_cap

    const { data, error } = await sb.rpc('evaluate_courier_block', { p_courier_id: courierPersoBlock })
    expect(error).toBeNull()
    expect((data as { action: string }).action).toBe('auto_blocked')

    const { data: c } = await sb.from('couriers').select('status').eq('id', courierPersoBlock).single()
    expect(c!.status).toBe('blocked')
    const { data: blk } = await sb.from('courier_blocks').select('block_type').eq('courier_id', courierPersoBlock).eq('action', 'block').maybeSingle()
    expect(blk!.block_type).toBe('auto_personal')
    const { data: al } = await sb.from('guardian_alerts').select('id').eq('alert_type', 'fraud_auto_block').eq('courier_id', courierPersoBlock).maybeSingle()
    expect(al).not.toBeNull()
  })

  it('S2. SANCTION SOCIÉTÉ : dépassement de plafond → ALERTE seule, JAMAIS de blocage auto', async () => {
    const ord = await seedOrder(null, 'confirmed', 25000)
    await pickupAndDeliver(ord, courierCompanyBlock)

    const { data, error } = await sb.rpc('evaluate_courier_block', { p_courier_id: courierCompanyBlock })
    expect(error).toBeNull()
    expect((data as { action: string }).action).toBe('alert_only')

    const { data: c } = await sb.from('couriers').select('status').eq('id', courierCompanyBlock).single()
    expect(c!.status).toBe('active') // société JAMAIS bloquée automatiquement
    const { data: al } = await sb.from('guardian_alerts').select('id').eq('alert_type', 'over_cap').eq('courier_id', courierCompanyBlock).maybeSingle()
    expect(al).not.toBeNull()
  })

  // ─── DÉTECTION ────────────────────────────────────────────────────────────
  it('D1. RETOUR FANTÔME : retour déclaré > 48h non confirmé → détecté et alerté', async () => {
    const ord = await seedOrder(courierOther, 'confirmed', 12000)
    // Insère une déclaration ANCIENNE (48h+) directement (état de test).
    const oldDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
    await sb.from('courier_returns').insert({ order_id: ord, courier_id: courierOther, state: 'declared', declared_at: oldDate })

    const { data, error } = await sb.rpc('detect_ghost_returns', { p_hours: 48 })
    expect(error).toBeNull()
    expect((data as number) >= 1).toBe(true)

    const { data: al } = await sb.from('guardian_alerts').select('id').eq('alert_type', 'return_ghost_48h').eq('order_id', ord).maybeSingle()
    expect(al).not.toBeNull()

    await sb.from('courier_returns').delete().eq('order_id', ord)
  })

  // ─── INEFFAÇABILITÉ ───────────────────────────────────────────────────────
  it('A1. APPEND-ONLY : une alerte gardien est INEFFAÇABLE (DELETE refusé même en service_role)', async () => {
    const { data: al } = await sb.from('guardian_alerts').insert({ alert_type: 'debt_spike', severity: 'warning' }).select('id').single()
    const { error: delErr } = await sb.from('guardian_alerts').delete().eq('id', al!.id)
    expect(delErr).not.toBeNull()
    // Le cœur est immuable (seule la résolution write-once est permise).
    const { error: updErr } = await sb.from('guardian_alerts').update({ alert_type: 'over_cap' }).eq('id', al!.id)
    expect(updErr).not.toBeNull()
  })

  // ─── @security P2-1 — 2 COMPTES DISTINCTS (chaîne de garde) ───────────────
  it('F4c. CHAÎNE DE GARDE : le déclarant ne peut PAS se confirmer lui-même (2 comptes distincts)', async () => {
    const ord = await seedOrder(null, 'confirmed', 16000)
    await pickupAndDeliver(ord, courierPerso)
    const { data: decl } = await sb.rpc('declare_courier_cash', {
      p_courier_id: courierPerso, p_order_ids: [ord], p_amount_mad: 16000, p_method: 'cash',
      p_actor_id: affiliateId, p_idempotency_key: `sameactor-${testTag}`,
    })
    const confId = (decl as { id: string }).id

    // Même acteur (affiliateId a déclaré) tente de confirmer → REFUS.
    const { error: sameErr } = await sb.rpc('confirm_cash_receipt', { p_confirmation_id: confId, p_actor_id: affiliateId })
    expect(sameErr).not.toBeNull()
    expect(sameErr!.message).toContain('same_actor_double_confirm')

    // Un 2ᵉ compte DISTINCT confirme → OK (double confirmation satisfaite).
    const { error: okErr } = await sb.rpc('confirm_cash_receipt', { p_confirmation_id: confId, p_actor_id: randomUUID() })
    expect(okErr).toBeNull()
  })

  // ─── @finance P1 — ZÉRO COMPENSATION CROISÉE (chemin cash) ─────────────────
  it('F2b. COMPENSATION CROISÉE (cash) : déclarer un versement porteur A avec une commande de B → REFUS', async () => {
    const ordA = await seedOrder(null, 'confirmed', 15000)
    await pickupAndDeliver(ordA, courierPerso)
    const ordB = await seedOrder(null, 'confirmed', 15000)
    await pickupAndDeliver(ordB, courierOther)

    // courierPerso tente d'encaisser un versement incluant une commande de courierOther.
    const { error } = await sb.rpc('declare_courier_cash', {
      p_courier_id: courierPerso, p_order_ids: [ordA, ordB], p_amount_mad: 30000, p_method: 'cash',
      p_actor_id: affiliateId, p_idempotency_key: `crossown-${testTag}`,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('order_not_owned')

    // Aucune confirmation créée (dette de B intacte).
    const { data: conf } = await sb.from('courier_cash_confirmations').select('id').eq('idempotency_key', `crossown-${testTag}`).maybeSingle()
    expect(conf).toBeNull()
  })

  it('F4b. IDEMPOTENCE cash : déclarer 2× avec la MÊME clé → une SEULE confirmation (jamais de double versement)', async () => {
    const ord = await seedOrder(null, 'confirmed', 15000)
    await pickupAndDeliver(ord, courierPerso)
    const key = `idem-${testTag}`
    const { data: r1 } = await sb.rpc('declare_courier_cash', {
      p_courier_id: courierPerso, p_order_ids: [ord], p_amount_mad: 15000, p_method: 'cash', p_actor_id: affiliateId, p_idempotency_key: key,
    })
    const { data: r2 } = await sb.rpc('declare_courier_cash', {
      p_courier_id: courierPerso, p_order_ids: [ord], p_amount_mad: 15000, p_method: 'cash', p_actor_id: affiliateId, p_idempotency_key: key,
    })
    expect((r1 as { id: string }).id).toBe((r2 as { id: string }).id)
    expect((r2 as { idempotent: boolean }).idempotent).toBe(true)
    const { data: rows } = await sb.from('courier_cash_confirmations').select('id').eq('idempotency_key', key)
    expect(rows!.length).toBe(1)
  })

  it('A2. RÉCEPTION IDEMPOTENTE : 2ᵉ scan d\'un retour déjà confirmé → already_received, AUCUNE fausse alerte collusion', async () => {
    const ord = await seedOrder(null, 'confirmed', 20000)
    await pickupAndDeliver(ord, courierPerso)
    await sb.rpc('declare_courier_return', { p_order_id: ord, p_courier_id: courierPerso })
    await sb.rpc('record_depot_reception', { p_order_id: ord, p_actor_id: affiliateId }) // 1re = nominal

    const { count: before } = await sb.from('guardian_alerts').select('id', { count: 'exact', head: true })
      .eq('alert_type', 'reception_without_declaration').eq('order_id', ord)
    const { data, error } = await sb.rpc('record_depot_reception', { p_order_id: ord, p_actor_id: affiliateId }) // 2e
    expect(error).toBeNull()
    expect((data as { path: string }).path).toBe('already_received')
    const { count: after } = await sb.from('guardian_alerts').select('id', { count: 'exact', head: true })
      .eq('alert_type', 'reception_without_declaration').eq('order_id', ord)
    expect(after).toBe(before) // pas de fausse alerte de collusion
  })

  afterAll(async () => {
    if (!sb) return
    try {
      const couriers = [courierPerso, courierOther, courierCompany, courierPersoBlock, courierCompanyBlock].filter(Boolean)
      const { data: orders } = await sb.from('orders').select('id').eq('affiliate_id', affiliateId)
      const orderIds = (orders ?? []).map((o) => o.id as string)
      if (orderIds.length) {
        try { await sb.from('scan_events').delete().in('order_id', orderIds) } catch { /* append-only toléré */ }
        await sb.from('courier_returns').delete().in('order_id', orderIds)
        await sb.from('courier_remittance_orders').delete().in('order_id', orderIds)
        await sb.from('orders').delete().in('id', orderIds)
      }
      await sb.from('couriers').delete().in('id', couriers)
      if (productId) await sb.from('products').delete().eq('id', productId)
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch {
      /* toléré en local */
    }
  })
})
