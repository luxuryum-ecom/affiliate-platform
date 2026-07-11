/**
 * Lot F — Preuves RUNTIME : relevés PDF figés (affilié + livreur).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT (assertLocalSupabase).
 * Prouve, côté GRAND LIVRE et côté RENDU :
 *  1. generate_payout_statement fige un snapshot dont le total = payouts.amount
 *     EXACTEMENT (montants issus du grand livre : ledger_entries payout→commission→order).
 *  2. GARDE-FOU FINANCIER : si le total des lignes ≠ montant du payout, la RPC LÈVE
 *     (divergence grand livre STRUCTURELLEMENT interdite). @finance.
 *  3. SNAPSHOT FIGÉ : après génération, l'ajout d'une écriture au payout ne change PAS
 *     le relevé (rejeu idempotent = même snapshot).
 *  4. IMMUABILITÉ : UPDATE d'un relevé est refusé (append-only).
 *  5. generate_courier_statement : SOLDE FINAL = v_courier_balances (grand livre).
 *  6. RENDU : les snapshots réels produisent des PDF valides (FR).
 *
 * Écriture LOCAL only (service_role sur 127.0.0.1). Les relevés étant append-only,
 * ils ne sont pas supprimables en teardown (résidu LOCAL assumé — db reset nettoie).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { buildPayoutStatementPdf } from '@/lib/statements/payout-statement-pdf'
import { buildCourierStatementPdf } from '@/lib/statements/courier-statement-pdf'

const tag = `lotf-${Date.now()}`
let sb: SupabaseClient
let affiliateId = ''
let productId = ''
let orderIds: string[] = []
let payoutId = ''
let badPayoutId = ''
let courierId = ''

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46

async function seedOrder(total: number, courier: string | null = null): Promise<string> {
  const { data, error } = await sb
    .from('orders')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      customer_name: 'Client',
      customer_phone: '0600000000',
      customer_city: 'Casablanca',
      customer_address: 'Adr',
      quantity: 1,
      total_amount: total,
      commission_amount: 0,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      courier_id: courier,
    })
    .select('id')
    .single()
  if (error) throw error
  orderIds.push(data!.id)
  return data!.id
}

/** Insère un payout PAYÉ + ses commissions + le ledger 'payout' (calque create_payout). */
async function seedPayout(lines: { orderId: string; commission: number }[], method: string): Promise<string> {
  const total = lines.reduce((s, l) => s + l.commission, 0)
  const { data: p } = await sb
    .from('payouts')
    .insert({
      affiliate_id: affiliateId,
      amount: total,
      status: 'paid',
      reference: `VIR-${tag}`,
      payment_method: method,
      paid_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const pid = p!.id
  for (const l of lines) {
    const { data: c } = await sb
      .from('commissions')
      .insert({ affiliate_id: affiliateId, order_id: l.orderId, amount: l.commission, status: 'paid' })
      .select('id')
      .single()
    await sb.from('ledger_entries').insert({
      affiliate_id: affiliateId,
      entry_type: 'payout',
      amount: -l.commission,
      order_id: l.orderId,
      commission_id: c!.id,
      payout_id: pid,
      idempotency_key: `payout:${c!.id}`,
      metadata: { payout_id: pid },
    })
  }
  return pid
}

describe('Lot F — relevés figés (grand livre)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-f-setup')
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: aff } = await sb.auth.admin.createUser({
      email: `taff-${tag}@test.local`,
      password: 'TestLotF2026!X',
      email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Youssef ${tag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)

    const { data: prod } = await sb.from('products').insert({ name: `Prod LotF ${tag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    const o1 = await seedOrder(300), o2 = await seedOrder(500)
    payoutId = await seedPayout([{ orderId: o1, commission: 45 }, { orderId: o2, commission: 80 }], 'virement')

    // Payout INCOHÉRENT : montant (999) ≠ somme ledger (45) → doit faire lever la RPC.
    const o3 = await seedOrder(200)
    const { data: bad } = await sb
      .from('payouts')
      .insert({ affiliate_id: affiliateId, amount: 999, status: 'paid', paid_at: new Date().toISOString() })
      .select('id')
      .single()
    badPayoutId = bad!.id
    const { data: c3 } = await sb.from('commissions').insert({ affiliate_id: affiliateId, order_id: o3, amount: 45, status: 'paid' }).select('id').single()
    await sb.from('ledger_entries').insert({
      affiliate_id: affiliateId, entry_type: 'payout', amount: -45, order_id: o3, commission_id: c3!.id,
      payout_id: badPayoutId, idempotency_key: `payout:${c3!.id}`, metadata: {},
    })

    // Courier + activité (livraison + créance produit).
    const { data: cr } = await sb.from('couriers').insert({ name: `Ahmed ${tag}`, courier_type: 'personal', status: 'active', balance_cap_mad: 5000 }).select('id').single()
    courierId = cr!.id
    const co = await seedOrder(400, courierId)
    await sb.from('scan_events').insert({ scan_type: 'pickup_dispatch', order_id: co, order_type: 'affiliate', carrier_tracking_ref: `${tag}-co`, scanned_qty: 1 })
    await sb.from('courier_product_debts').insert({ courier_id: courierId, order_id: co, quantity: 1, amount_mad: 120, reason: 'perte test' })
  }, 60000)

  afterAll(async () => {
    if (!sb) return
    // Relevés append-only : non supprimables (résidu LOCAL assumé). On nettoie le reste.
    try {
      await sb.from('ledger_entries').delete().eq('affiliate_id', affiliateId)
      await sb.from('courier_product_debts').delete().eq('courier_id', courierId)
      await sb.from('scan_events').delete().in('order_id', orderIds)
      await sb.from('commissions').delete().eq('affiliate_id', affiliateId)
      await sb.from('orders').delete().in('id', orderIds)
    } catch {
      /* best-effort */
    }
    if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
  })

  it('1+2. relevé affilié : total = payout.amount, snapshot cohérent + rendu PDF', async () => {
    const { data: stmt, error } = await sb.rpc('generate_payout_statement', { p_payout_id: payoutId })
    expect(error).toBeNull()
    const row = Array.isArray(stmt) ? stmt[0] : stmt
    expect(Number(row.total_amount)).toBe(125) // 45 + 80, EXACT
    const snap = row.snapshot
    expect(snap.lines.length).toBe(2)
    expect(Number(snap.total)).toBe(125)
    expect(snap.paymentMethod).toBe('virement')
    const pdf = await buildPayoutStatementPdf(snap, 'fr')
    expect(isPdf(pdf)).toBe(true)
    const pdfAr = await buildPayoutStatementPdf(snap, 'ar')
    expect(isPdf(pdfAr)).toBe(true)
  })

  it('3. GARDE-FOU : total lignes ≠ montant payout → RPC lève (divergence interdite)', async () => {
    const { error } = await sb.rpc('generate_payout_statement', { p_payout_id: badPayoutId })
    expect(error).not.toBeNull()
    expect(String(error?.message)).toMatch(/incohérent|<>|lignes/i)
  })

  it('4. SNAPSHOT FIGÉ : un ajout au payout ne change pas le relevé (idempotent)', async () => {
    // Ajout d'une écriture ledger APRÈS génération : le relevé figé ne bouge pas.
    const extra = await seedOrder(700)
    const { data: cX } = await sb.from('commissions').insert({ affiliate_id: affiliateId, order_id: extra, amount: 999, status: 'paid' }).select('id').single()
    await sb.from('ledger_entries').insert({
      affiliate_id: affiliateId, entry_type: 'payout', amount: -999, order_id: extra, commission_id: cX!.id,
      payout_id: payoutId, idempotency_key: `payout:${cX!.id}`, metadata: {},
    })
    const { data: again } = await sb.rpc('generate_payout_statement', { p_payout_id: payoutId })
    const row = Array.isArray(again) ? again[0] : again
    expect(Number(row.total_amount)).toBe(125) // toujours figé à 125, PAS 1124
    expect(row.snapshot.lines.length).toBe(2)
  })

  it('5. IMMUABILITÉ : UPDATE d’un relevé figé refusé', async () => {
    const { data: s } = await sb.from('payout_statements').select('id').eq('payout_id', payoutId).single()
    const { error } = await sb.from('payout_statements').update({ total_amount: 0 }).eq('id', s!.id)
    expect(error).not.toBeNull()
  })

  it('6. relevé livreur : SOLDE FINAL = grand livre (v_courier_balances) + rendu PDF', async () => {
    const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const end = new Date().toISOString().slice(0, 10)
    const { data: cstmt, error } = await sb.rpc('generate_courier_statement', { p_courier_id: courierId, p_start: start, p_end: end })
    expect(error).toBeNull()
    const row = Array.isArray(cstmt) ? cstmt[0] : cstmt
    // cash dû (commande livrée non réconciliée 400) + créance produit (120) = 520
    expect(Number(row.final_balance_mad)).toBe(520)
    expect(Number(row.product_debt_mad)).toBe(120)
    expect(row.snapshot.activity.losses.amount).toBe(120)
    const pdf = await buildCourierStatementPdf(row.snapshot, { generatedAt: row.generated_at }, 'ar')
    expect(isPdf(pdf)).toBe(true)
  })
})
