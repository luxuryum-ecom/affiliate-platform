/**
 * AUDIT 2026-07-12 — Correctif C-1 : clawback d'une commission PAYÉE (LOCAL only).
 *
 * FAILLE C-1 : `create_payout` versait SUM(commissions approved & !reversed) sans
 * jamais consulter le grand livre 048. Un retour COD APRÈS paiement écrivait
 * `commission_reversed = −amount` mais la commission déjà `paid` n'était jamais
 * déduite d'un versement futur → l'affilié gardait le trop-perçu.
 *
 * Correctif mig 132 : `create_payout` raisonne sur le SOLDE NET
 * (approuvé payable − clawback en attente), verse MAX(0, net), reporte le négatif.
 *
 * On prouve :
 *   C1-A. NON-RÉGRESSION — un payout SANS retour = montant identique (SUM approuvé).
 *   C1-B. CLAWBACK — commission payée puis retour post-paiement → le versement
 *         suivant est réduit d'exactement le montant contre-passé.
 *   C1-C. GRAND LIVRE ÉQUILIBRÉ — après récupération, le solde ledger de l'affilié
 *         reflète exactement le net réellement dû (invariant somme).
 *
 * RÈGLES : jamais la prod ; clés via getLocalSupabaseEnv() ; aucun secret en dur.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const tag = `c1-${Date.now()}`

let admin: SupabaseClient // service_role (setup + pilotage du flux)
let adminJwt: SupabaseClient // admin authentifié (JWT) — create_payout exige my_role()='admin'
let env: { url: string; anonKey: string; serviceKey: string }
let affiliateId: string
let productId: string
let adminId: string

/** Pilote une commande jusqu'à commission APPROUVÉE payable (livrée + réconciliée). */
async function makeApprovedCommission(commissionMad: number, totalMad: number): Promise<string> {
  const { data: courier } = await admin.from('couriers')
    .insert({ name: `Cr ${tag}-${commissionMad}-${Math.round(totalMad)}`, courier_type: 'personal', status: 'active' })
    .select('id').single()
  const { data: order } = await admin.from('orders').insert({
    affiliate_id: affiliateId, product_id: productId,
    customer_name: 'c', customer_phone: '0600000000',
    customer_city: 'Casablanca', customer_address: 'a',
    quantity: 1, total_amount: totalMad,
    commission_amount: commissionMad, affiliate_commission_mad_snapshot: commissionMad,
    fraud_score: 0, status: 'confirmed', courier_id: courier!.id,
  }).select('id').single()
  await admin.rpc('record_pickup_scan', { p_order_id: order!.id, p_courier_id: courier!.id })
  await admin.rpc('record_delivery_scan', { p_order_id: order!.id, p_courier_id: courier!.id, p_outcome: 'delivered_collected', p_tracking_ref: null })
  await admin.rpc('reconcile_courier_remittance', {
    p_courier_name: `Cr ${tag}-${commissionMad}-${Math.round(totalMad)}`,
    p_received_amount: totalMad, p_order_ids: [order!.id],
    p_idempotency_key: `rec-${tag}-${order!.id}`, p_courier_id: courier!.id,
  })
  return order!.id
}

describe('AUDIT C-1 — clawback commission payée récupéré au versement suivant (LOCAL)', () => {
  beforeAll(async () => {
    env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'payout-clawback-c1')
    admin = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Affilié admin-piloté (aucun JWT nécessaire ici : on teste la RPC serveur).
    const { data: a } = await admin.auth.admin.createUser({
      email: `c1-aff-${tag}@test.local`, password: 'ClawbackC1-2026!X', email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${tag}` },
    })
    affiliateId = a!.user!.id
    await admin.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await admin.from('products')
      .insert({ name: `C1 Prod ${tag}`, sell_price: 300, factory_cost_mad: 100,
        platform_margin_type: 'percentage', platform_margin_value: 20 })
      .select('id').single()
    productId = prod!.id

    // Admin authentifié (JWT) : create_payout exige my_role()='admin' (service_role refusé).
    const { data: adm } = await admin.auth.admin.createUser({
      email: `c1-admin-${tag}@test.local`, password: 'ClawbackAdmin-2026!X', email_confirm: true,
      user_metadata: { role: 'admin', full_name: `Admin ${tag}` },
    })
    adminId = adm!.user!.id
    await admin.from('profiles').update({ role: 'admin', status: 'approved' }).eq('id', adminId)
    adminJwt = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signErr } = await adminJwt.auth.signInWithPassword({ email: `c1-admin-${tag}@test.local`, password: 'ClawbackAdmin-2026!X' })
    expect(signErr, 'login admin').toBeNull()
  }, 60000)

  it('C1-A. NON-RÉGRESSION : payout SANS retour = SUM(approuvé), inchangé', async () => {
    const orderId = await makeApprovedCommission(40, 300)
    const { data: comm } = await admin.from('commissions').select('id, amount, status').eq('order_id', orderId).single()
    expect(comm!.status).toBe('approved')

    const { data: payout, error } = await adminJwt.rpc('create_payout', {
      p_affiliate_id: affiliateId, p_idempotency_key: `pay1-${tag}`, p_reference: 'r1', p_notes: 'n1',
    })
    expect(error).toBeNull()
    // Aucun clawback en attente → montant = commission approuvée (comportement d'origine).
    expect(Number(payout!.amount)).toBe(40)
  })

  it('C1-B. CLAWBACK : commission payée puis retour post-paiement → versement suivant réduit du montant', async () => {
    // La commission de C1-A (40 MAD) est maintenant `paid`. On la contre-passe par
    // un retour COD APRÈS paiement (delivered → returned).
    const { data: paidComm } = await admin.from('commissions')
      .select('id, order_id, status').eq('affiliate_id', affiliateId).eq('status', 'paid').limit(1).single()
    await admin.from('orders').update({ status: 'returned' }).eq('id', paidComm!.order_id)

    // Vérifie que la contre-passation a bien marqué la commission reversed + ledger négatif.
    const { data: reversed } = await admin.from('commissions').select('reversed, clawed_back, status').eq('id', paidComm!.id).single()
    expect(reversed!.reversed).toBe(true)
    expect(reversed!.clawed_back).toBe(false) // dû en attente, pas encore récupéré
    expect(reversed!.status).toBe('paid')     // reste payée (hors pool approuvé)

    // Nouveau cycle : une commission approuvée de 100 MAD.
    await makeApprovedCommission(100, 500)

    // AVANT correctif : create_payout aurait versé 100 (ignorant le retour de 40).
    // APRÈS correctif : verse 100 − 40 = 60.
    const { data: payout2, error } = await adminJwt.rpc('create_payout', {
      p_affiliate_id: affiliateId, p_idempotency_key: `pay2-${tag}`, p_reference: 'r2', p_notes: 'n2',
    })
    expect(error, 'le versement doit réussir avec un net positif').toBeNull()
    expect(Number(payout2!.amount), 'versement = 100 approuvé − 40 clawback').toBe(60)

    // Le clawback est désormais marqué récupéré (ne sera pas re-déduit).
    const { data: settled } = await admin.from('commissions').select('clawed_back').eq('id', paidComm!.id).single()
    expect(settled!.clawed_back).toBe(true)
  })

  it('C1-C. GRAND LIVRE ÉQUILIBRÉ : solde ledger de l\'affilié = net réellement dû (0 ici)', async () => {
    // Bilan attendu : gagné (40 + 100) − reversé (40) − payé (40 + 60) + récup clawback (40)
    //   = 140 − 40 − 100 + 40 = 40 ? Non : la 2e commission (100) est payée à 60 net.
    // Ledger 048 : +40 (earn1) −40 (payout1) −40 (reversed1) +100 (earn2) −100 (payout2) +40 (clawback_recovery1)
    //   = 0. L'affilié a reçu net 40 (payout1) + 60 (payout2) = 100 = gain net réel (comm2 seule,
    //   comm1 annulée). Solde ledger = 0 → livre équilibré, aucun trop-perçu.
    const { data: entries } = await admin.from('ledger_entries').select('amount').eq('affiliate_id', affiliateId)
    const balance = (entries ?? []).reduce((s, e) => s + Number(e.amount), 0)
    expect(Math.round(balance * 100) / 100).toBe(0)
  })

  it('C1-D. REPORT : clawback ≥ gains approuvés → versement refusé (reporté), aucun payout négatif', async () => {
    // Paye une petite commission (30), puis la contre-passe (retour post-paiement) → dû 30.
    const oid = await makeApprovedCommission(30, 300)
    await adminJwt.rpc('create_payout', { p_affiliate_id: affiliateId, p_idempotency_key: `pay3-${tag}`, p_reference: 'r3', p_notes: 'n3' })
    await admin.from('orders').update({ status: 'returned' }).eq('id', oid)

    // Nouvelle commission approuvée plus petite (10) que le clawback (30) → net = −20 → refus.
    await makeApprovedCommission(10, 300)
    const { data: payout4, error } = await adminJwt.rpc('create_payout', {
      p_affiliate_id: affiliateId, p_idempotency_key: `pay4-${tag}`, p_reference: 'r4', p_notes: 'n4',
    })
    expect(error, 'net ≤ 0 doit être refusé (clawback reporté)').not.toBeNull()
    expect(payout4 ?? null).toBeNull()
    // Aucun payout créé pour cette clé (pas de versement négatif).
    const { data: p4 } = await admin.from('payouts').select('id').eq('idempotency_key', `pay4-${tag}`)
    expect(p4?.length ?? 0).toBe(0)
  })

  afterAll(async () => {
    if (!admin) return
    try {
      const { data: orders } = await admin.from('orders').select('id').eq('affiliate_id', affiliateId)
      const ids = (orders ?? []).map((o) => o.id as string)
      if (ids.length) {
        try { await admin.from('scan_events').delete().in('order_id', ids) } catch { /* append-only */ }
        await admin.from('courier_returns').delete().in('order_id', ids)
        await admin.from('courier_remittance_orders').delete().in('order_id', ids)
        await admin.from('ledger_entries').delete().in('order_id', ids)
      }
      await admin.from('couriers').delete().ilike('name', `Cr ${tag}%`)
      if (ids.length) await admin.from('orders').delete().in('id', ids)
      if (productId) await admin.from('products').delete().eq('id', productId)
      if (affiliateId) await admin.auth.admin.deleteUser(affiliateId)
      if (adminId) await admin.auth.admin.deleteUser(adminId)
    } catch { /* toléré en local */ }
  })
})
