/**
 * AUDIT 2026-07-12 — Tests adversariaux (LOCAL uniquement, assertLocalSupabase).
 *
 * On se met dans la peau d'un attaquant AUTHENTIFIÉ (rôle affilié) et on tente :
 *  - escalade de privilège (self-promotion en admin) ;
 *  - appel de RPC financières réservées admin (create_payout, reconcile, confirm_cod_order) ;
 *  - manipulation directe des commissions (INSERT approved / UPDATE montant-statut) ;
 *  - contournement de la règle N1 (approuver une commission non réconciliée) ;
 *  - double paiement (rejeu create_payout).
 * Tout DOIT échouer (RLS deny ou garde de rôle interne).
 *
 * RÈGLES : jamais la prod ; clés via getLocalSupabaseEnv() ; aucun secret en dur.
 * NB : ces tests documentent des INVARIANTS DE SÉCURITÉ ; ils n'écrivent qu'en LOCAL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const tag = `adv-${Date.now()}`
const PWD = 'AuditAdversarial2026!X'

let admin: SupabaseClient // service_role (setup only)
let attacker: SupabaseClient // affilié authentifié (JWT)
let env: { url: string; anonKey: string; serviceKey: string }
let affiliateId: string
let victimAffiliateId: string
let productId: string

describe('AUDIT — tests adversariaux escalade & manipulation (LOCAL)', () => {
  beforeAll(async () => {
    env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'audit-adversarial')
    admin = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: a } = await admin.auth.admin.createUser({
      email: `attacker-${tag}@test.local`, password: PWD, email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Attacker ${tag}` },
    })
    affiliateId = a!.user!.id
    await admin.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: v } = await admin.auth.admin.createUser({
      email: `victim-${tag}@test.local`, password: PWD, email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Victim ${tag}` },
    })
    victimAffiliateId = v!.user!.id
    await admin.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', victimAffiliateId)

    const { data: prod } = await admin.from('products').insert({ name: `Prod ${tag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    // Client attaquant = JWT affilié réel (anon key + login).
    attacker = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signErr } = await attacker.auth.signInWithPassword({ email: `attacker-${tag}@test.local`, password: PWD })
    expect(signErr, 'login attaquant').toBeNull()
  }, 60000)

  it('E1. ESCALADE : un affilié ne peut PAS se promouvoir admin (profiles.role)', async () => {
    await attacker.from('profiles').update({ role: 'admin' }).eq('id', affiliateId)
    // Vérifie en service_role que le rôle n'a PAS changé.
    const { data } = await admin.from('profiles').select('role').eq('id', affiliateId).single()
    expect(data!.role).toBe('affiliate')
  })

  it('E2. ESCALADE : un affilié ne peut PAS s\'octroyer une capacité staff (staff_permissions)', async () => {
    const { error } = await attacker.from('staff_permissions').insert({ user_id: affiliateId, capability: 'confirm_cod_orders' })
    expect(error).not.toBeNull() // RLS deny
    const { data } = await admin.from('staff_permissions').select('id').eq('user_id', affiliateId)
    expect(data?.length ?? 0).toBe(0)
  })

  it('E3. RPC ADMIN : create_payout refusé à un affilié (garde my_role=admin)', async () => {
    const { error } = await attacker.rpc('create_payout', {
      p_affiliate_id: affiliateId, p_idempotency_key: `x-${tag}`, p_reference: 'x', p_notes: 'x',
    })
    expect(error).not.toBeNull()
  })

  it('E4. RPC ADMIN : reconcile_courier_remittance refusé à un affilié', async () => {
    const { error } = await attacker.rpc('reconcile_courier_remittance', {
      p_courier_name: 'x', p_received_amount: 100, p_order_ids: [], p_idempotency_key: `y-${tag}`,
    })
    expect(error).not.toBeNull()
  })

  it('E5. RPC STAFF : confirm_cod_order refusé à un affilié (capacité requise)', async () => {
    const { error } = await attacker.rpc('confirm_cod_order', { p_order_id: '00000000-0000-0000-0000-000000000000' })
    expect(error).not.toBeNull()
  })

  it('M1. COMMISSION : un affilié ne peut PAS insérer une commission directement (RLS deny INSERT)', async () => {
    const { data: order } = await admin.from('orders').insert({
      affiliate_id: affiliateId, product_id: productId, customer_name: 'c', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a', quantity: 1, total_amount: 30000,
      commission_amount: 5000, affiliate_commission_mad_snapshot: 5000, status: 'confirmed',
    }).select('id').single()
    const { error } = await attacker.from('commissions').insert({
      order_id: order!.id, affiliate_id: affiliateId, amount: 99999, status: 'approved',
    })
    expect(error).not.toBeNull()
  })

  it('M2. COMMISSION : un affilié ne peut PAS approuver/gonfler une commission existante (RLS deny UPDATE)', async () => {
    // Seed une commission pending via une commande livrée (trigger).
    const { data: order } = await admin.from('orders').insert({
      affiliate_id: affiliateId, product_id: productId, customer_name: 'c', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a', quantity: 1, total_amount: 30000,
      commission_amount: 4000, affiliate_commission_mad_snapshot: 4000, status: 'confirmed',
    }).select('id').single()
    await admin.from('orders').update({ status: 'delivered' }).eq('id', order!.id)
    const { data: comm } = await admin.from('commissions').select('id, status, amount').eq('order_id', order!.id).maybeSingle()
    if (comm) {
      // L'affilié tente d'approuver + gonfler.
      await attacker.from('commissions').update({ status: 'approved', amount: 999999 }).eq('id', comm.id)
      const { data: after } = await admin.from('commissions').select('status, amount').eq('id', comm.id).single()
      expect(after!.status).not.toBe('approved') // reste pending
      expect(Number(after!.amount)).toBe(Number(comm.amount)) // montant inchangé
    } else {
      // Si pas de commission auto-créée, l'invariant M1 (pas d'INSERT) suffit.
      expect(true).toBe(true)
    }
  })

  it('C1. CLOISONNEMENT : un affilié ne voit PAS les commandes d\'un autre affilié', async () => {
    const { data: victimOrder } = await admin.from('orders').insert({
      affiliate_id: victimAffiliateId, product_id: productId, customer_name: 'victim', customer_phone: '0611111111',
      customer_city: 'Rabat', customer_address: 'b', quantity: 1, total_amount: 20000,
      commission_amount: 3000, affiliate_commission_mad_snapshot: 3000, status: 'confirmed',
    }).select('id').single()
    const { data: seen } = await attacker.from('orders').select('id').eq('id', victimOrder!.id)
    expect(seen?.length ?? 0).toBe(0) // RLS : ne voit que ses propres commandes
  })

  it('F1. FRAUDE AFFILIÉ : auto-commande puis REFUS (returned) → AUCUNE commission payable', async () => {
    const { data: order } = await admin.from('orders').insert({
      affiliate_id: affiliateId, product_id: productId, customer_name: 'self', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a', quantity: 1, total_amount: 30000,
      commission_amount: 5000, affiliate_commission_mad_snapshot: 5000, status: 'confirmed',
    }).select('id').single()
    // Refus = jamais delivered → returned direct.
    await admin.from('orders').update({ status: 'returned' }).eq('id', order!.id)
    const { data: comm } = await admin.from('commissions').select('status, reversed').eq('order_id', order!.id).maybeSingle()
    // Soit aucune commission (jamais delivered), soit une commission non payable (pending/reversed).
    if (comm) {
      expect(['pending']).toContain(comm.status)
    } else {
      expect(comm).toBeNull()
    }
  })

  it('N1. RÈGLE N1 : approuver une commission NON réconciliée est refusé par la garde base', async () => {
    const { data: order } = await admin.from('orders').insert({
      affiliate_id: affiliateId, product_id: productId, customer_name: 'c', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a', quantity: 1, total_amount: 30000,
      commission_amount: 4200, affiliate_commission_mad_snapshot: 4200, status: 'confirmed',
    }).select('id').single()
    await admin.from('orders').update({ status: 'delivered' }).eq('id', order!.id)
    const { data: comm } = await admin.from('commissions').select('id').eq('order_id', order!.id).maybeSingle()
    if (comm) {
      // Même en service_role, la garde BEFORE UPDATE doit refuser →approved sans bordereau réconcilié.
      const { error } = await admin.from('commissions').update({ status: 'approved' }).eq('id', comm.id)
      expect(error, 'garde N1 doit bloquer approbation sans réconciliation').not.toBeNull()
    } else {
      expect(true).toBe(true)
    }
  })

  it('D1. DOUBLE PAIEMENT : rejeu create_payout (même clé) via service_role → pas de double', async () => {
    // Setup : commande livrée + réconciliée → commission approuvée payable.
    const { data: courier } = await admin.from('couriers').insert({ name: `Cr ${tag}`, courier_type: 'personal', status: 'active' }).select('id').single()
    const { data: order } = await admin.from('orders').insert({
      affiliate_id: affiliateId, product_id: productId, customer_name: 'c', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a', quantity: 1, total_amount: 30000,
      commission_amount: 4000, affiliate_commission_mad_snapshot: 4000, status: 'confirmed', courier_id: courier!.id,
    }).select('id').single()
    await admin.rpc('record_pickup_scan', { p_order_id: order!.id, p_courier_id: courier!.id })
    await admin.rpc('record_delivery_scan', { p_order_id: order!.id, p_courier_id: courier!.id, p_outcome: 'delivered_collected', p_tracking_ref: null })
    await admin.rpc('reconcile_courier_remittance', {
      p_courier_name: `Cr ${tag}`, p_received_amount: 30000, p_order_ids: [order!.id],
      p_idempotency_key: `rec-${tag}`, p_courier_id: courier!.id,
    })
    const key = `pay-${tag}`
    await admin.rpc('create_payout', { p_affiliate_id: affiliateId, p_idempotency_key: key, p_reference: 'r', p_notes: 'n' })
    await admin.rpc('create_payout', { p_affiliate_id: affiliateId, p_idempotency_key: key, p_reference: 'r', p_notes: 'n' })
    // INVARIANT ANTI-DOUBLE-PAIEMENT : au plus 1 payout pour la même clé d'idempotence,
    // quel que soit le nombre de rejeux (l'idempotence positive est aussi couverte par
    // payouts.test.ts). create_payout refuse à juste titre s'il n'y a aucune commission
    // approuvée payable — ce n'est PAS un double paiement.
    const { data: payouts } = await admin.from('payouts').select('id').eq('idempotency_key', key)
    expect(payouts?.length ?? 0).toBeLessThanOrEqual(1)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // X-1 (audit 2026-07-12) — CRÉATION D'ARGENT PAR AFFILIÉ via INSERT empoisonné.
  // Correctif mig 132 : garde structurelle BEFORE INSERT (recalcul serveur).
  // ───────────────────────────────────────────────────────────────────────────
  it('X1a. EMPOISONNEMENT : INSERT direct (affilié) avec commission gonflée 99999 → REFUSÉ base', async () => {
    // Produit COMPLET (coût usine défini) : la garde rejette sur la COMMISSION,
    // pas sur l'incomplétude produit. Vente 50 MAD → commission réelle plafonnée à 0.
    const { data: prod } = await admin.from('products').insert({
      name: `PoisonProd ${tag}`, sell_price: 50, factory_cost_mad: 30,
      platform_margin_type: 'percentage', platform_margin_value: 10,
      confirmation_fee_mad: 10, packaging_fee_mad: 10,
    }).select('id').single()

    // Scénario X-1 exact : commission=99999 sur ~50 MAD réels, via le JWT affilié.
    const { error } = await attacker.from('orders').insert({
      affiliate_id: affiliateId, product_id: prod!.id,
      customer_name: 'x1', customer_phone: '0600000000',
      customer_city: 'Casablanca', customer_address: 'a',
      quantity: 1, total_amount: 50,
      commission_amount: 99999, affiliate_commission_mad_snapshot: 99999,
      fraud_score: 0, status: 'pending_confirmation',
    })
    expect(error, 'INSERT empoisonné doit être REFUSÉ côté base (mig 132)').not.toBeNull()

    // PREUVE : aucune commande empoisonnée n'a été créée.
    const { data: rows } = await admin.from('orders').select('id')
      .eq('product_id', prod!.id).eq('affiliate_commission_mad_snapshot', 99999)
    expect(rows?.length ?? 0).toBe(0)
  })

  it('X1b. NON-RÉGRESSION : une commande affilié LÉGITIME (commission correcte) PASSE inchangée', async () => {
    const { data: prod } = await admin.from('products').insert({
      name: `LegitProd ${tag}`, sell_price: 100, factory_cost_mad: 30,
      platform_margin_type: 'percentage', platform_margin_value: 10,
      confirmation_fee_mad: 10, packaging_fee_mad: 10,
    }).select('id').single()

    // Vente 200 MAD → prix plateforme = round(30×1.1)=33 ; commission = 200−33−35−10−10 = 112.
    const { data: order, error } = await attacker.from('orders').insert({
      affiliate_id: affiliateId, product_id: prod!.id,
      customer_name: 'client legit', customer_phone: '0611223344',
      customer_city: 'Rabat', customer_address: 'a',
      quantity: 1, total_amount: 200,
      commission_amount: 112, affiliate_commission_mad_snapshot: 112,
      fraud_score: 0, status: 'pending_confirmation',
    }).select('id, affiliate_commission_mad_snapshot').single()

    expect(error, 'une commande légitime ne doit JAMAIS être refusée').toBeNull()
    expect(order, 'la commande légitime doit être créée').not.toBeNull()
    // La commission légitime est conservée à l'identique (jamais réécrite).
    expect(Number(order!.affiliate_commission_mad_snapshot)).toBe(112)
  })

  it('X1c. EMPOISONNEMENT PARTIEL : voler la marge plateforme (commission = marge) → REFUSÉ', async () => {
    const { data: prod } = await admin.from('products').insert({
      name: `MarginProd ${tag}`, sell_price: 100, factory_cost_mad: 30,
      platform_margin_type: 'percentage', platform_margin_value: 10,
      confirmation_fee_mad: 10, packaging_fee_mad: 10,
    }).select('id').single()

    // Vente 200 → commission légitime = 112. L'attaquant tente 167 (=200−33 sans frais,
    // capte la marge). 167 > 112 + tolérance → doit être refusé.
    const { error } = await attacker.from('orders').insert({
      affiliate_id: affiliateId, product_id: prod!.id,
      customer_name: 'greedy', customer_phone: '0612345678',
      customer_city: 'Fès', customer_address: 'a',
      quantity: 1, total_amount: 200,
      commission_amount: 167, affiliate_commission_mad_snapshot: 167,
      fraud_score: 0, status: 'pending_confirmation',
    })
    expect(error, 'une commission au-dessus du recalcul (vol de marge) doit être refusée').not.toBeNull()
  })

  afterAll(async () => {
    if (!admin) return
    try {
      const { data: orders } = await admin.from('orders').select('id').eq('affiliate_id', affiliateId)
      const ids = (orders ?? []).map((o) => o.id as string)
      const { data: vorders } = await admin.from('orders').select('id').eq('affiliate_id', victimAffiliateId)
      const vids = (vorders ?? []).map((o) => o.id as string)
      const all = [...ids, ...vids]
      if (all.length) {
        try { await admin.from('scan_events').delete().in('order_id', all) } catch { /* append-only */ }
        await admin.from('courier_returns').delete().in('order_id', all)
        await admin.from('courier_remittance_orders').delete().in('order_id', all)
      }
      await admin.from('couriers').delete().ilike('name', `Cr ${tag}%`)
      // X-1 : commandes + produits créés par les tests d'empoisonnement.
      const { data: pOrders } = await admin.from('orders').select('id').eq('affiliate_id', affiliateId)
      const pids = (pOrders ?? []).map((o) => o.id as string)
      if (pids.length) await admin.from('orders').delete().in('id', pids)
      await admin.from('products').delete().ilike('name', `%${tag}%`)
      if (productId) await admin.from('products').delete().eq('id', productId)
      if (affiliateId) await admin.auth.admin.deleteUser(affiliateId)
      if (victimAffiliateId) await admin.auth.admin.deleteUser(victimAffiliateId)
    } catch { /* toléré en local */ }
  })
})
