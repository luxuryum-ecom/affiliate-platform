/**
 * Migration 120 — FIX régression mig 116 : l'acheteur relit ses lignes de
 * commande SANS jamais voir la marge, et sans voir celles des autres.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Auth réelle (signInWithPassword) → auth.uid() réel → RLS exercée pour de vrai.
 *
 * Garanties prouvées :
 *  (1) L'acheteur VOIT ses `wholesale_order_items` (le « 0 article » est réparé).
 *  (2) L'acheteur ne voit TOUJOURS PAS la marge : `wholesale_orders` base reste
 *      inaccessible (E1 fermé) ; il lit sa commande via la vue redacted.
 *  (3) Isolation : l'acheteur ne voit PAS les lignes d'un AUTRE acheteur.
 *  (4) Régression staff : l'admin lit toujours les lignes en direct.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const TEST_PASSWORD = 'FixItems120-2026!X'
const tag = `fix120-${Date.now()}`

let sb: SupabaseClient // service_role
let LOCAL_URL = '', LOCAL_ANON = ''
let b1 = { id: '', email: '' }, b2 = { id: '', email: '' }, admin = { id: '', email: '' }
let order1 = '', order2 = '', productId = ''

async function mkUser(suffix: string, role: string): Promise<{ id: string; email: string }> {
  const email = `${suffix}-${tag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { role },
  })
  if (error || !data.user) throw new Error(`mkUser: ${error?.message}`)
  await sb.from('profiles').update({ role, status: 'approved' }).eq('id', data.user.id)
  return { id: data.user.id, email }
}
async function client(email: string): Promise<SupabaseClient> {
  const c = createClient(LOCAL_URL, LOCAL_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return c
}
async function mkOrder(buyerId: string, withMargin: boolean): Promise<string> {
  const { data, error } = await sb.from('wholesale_orders').insert({
    buyer_id: buyerId, status: 'delivered', delivery_preference: 'delivery', total_amount: 5000,
    ...(withMargin ? { total_cost_mad: 3000, supplier_cost_mad: 3000 } : {}), // trigger → gross_profit_mad=2000
  }).select('id').single()
  if (error || !data) throw new Error(`order: ${error?.message}`)
  const { error: itErr } = await sb.from('wholesale_order_items').insert([
    { order_id: data.id, product_id: productId, quantity: 10, unit_price_snapshot: 200, subtotal: 2000, tier_label_snapshot: '10+' },
    { order_id: data.id, product_id: productId, quantity: 5, unit_price_snapshot: 600, subtotal: 3000, tier_label_snapshot: '5+' },
  ])
  if (itErr) throw new Error(`items: ${itErr.message}`)
  return data.id
}

describe('Migration 120 — l’acheteur relit ses lignes (fix mig 116)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'fix120-setup')
    LOCAL_URL = env.url; LOCAL_ANON = env.anonKey
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    // un produit catalogue réel (product_id est NOT NULL / FK sur wholesale_order_items)
    const { data: prod } = await sb.from('products').insert({ name: `[${tag}] produit`, sell_price: 100 }).select('id').single()
    productId = prod!.id
    b1 = await mkUser('b1', 'wholesaler')
    b2 = await mkUser('b2', 'wholesaler')
    admin = await mkUser('adm', 'admin')
    order1 = await mkOrder(b1.id, true) // commande de B1 AVEC marge
    order2 = await mkOrder(b2.id, false) // commande de B2
  }, 120_000)

  afterAll(async () => {
    if (!sb) return
    for (const oid of [order1, order2]) await sb.from('wholesale_orders').delete().eq('id', oid)
    if (productId) await sb.from('products').delete().eq('id', productId)
    for (const u of [b1, b2, admin]) await sb.auth.admin.deleteUser(u.id).catch(() => {})
  }, 60_000)

  it('(1) FIX — l’acheteur VOIT ses lignes de commande', async () => {
    const c = await client(b1.email)
    const { data } = await c.from('wholesale_order_items').select('id, quantity, subtotal').eq('order_id', order1)
    expect(data?.length).toBe(2)
  })

  it('(2) E1 fermé — l’acheteur ne voit PAS la marge (wholesale_orders base refusé)', async () => {
    const c = await client(b1.email)
    // table de base : 0 ligne (staff-only) → aucune marge lisible
    const base = await c.from('wholesale_orders').select('id, gross_profit_mad').eq('id', order1)
    expect(base.data?.length ?? 0).toBe(0)
    // vue redacted : voit SA commande, mais gross_profit_mad n'existe pas dans la vue
    const view = await c.from('wholesale_orders_buyer_read').select('id').eq('id', order1)
    expect(view.data?.length).toBe(1)
    const leak = await c.from('wholesale_orders_buyer_read').select('gross_profit_mad').eq('id', order1)
    expect(leak.error).not.toBeNull() // colonne absente de la vue → erreur
  })

  it('(3) Isolation — l’acheteur ne voit PAS les lignes d’un AUTRE acheteur', async () => {
    const c = await client(b1.email)
    const { data } = await c.from('wholesale_order_items').select('id').eq('order_id', order2)
    expect(data?.length ?? 0).toBe(0)
  })

  it('(4) Staff — l’admin lit toujours les lignes en direct', async () => {
    const c = await client(admin.email)
    const { data } = await c.from('wholesale_order_items').select('id').eq('order_id', order1)
    expect(data?.length).toBe(2)
  })

  it('(5) order_proofs — l’acheteur voit son justif paiement, PAS la preuve fournisseur (coût), PAS ceux des autres', async () => {
    // Seed via service_role : sur la commande de B1, un reçu bancaire (acheteur) +
    // une preuve de réception fournisseur (coût, ne doit JAMAIS être visible acheteur).
    await sb.from('order_proofs').insert([
      { proof_type: 'bank_receipt', file_url: 'https://x/receipt.pdf', related_wholesale_order_id: order1, uploaded_by: b1.id },
      { proof_type: 'stock_reception_proof', file_url: 'https://x/supplier-invoice.pdf', related_wholesale_order_id: order1, uploaded_by: admin.id },
    ])
    const c1 = await client(b1.email)
    const { data: mine } = await c1.from('order_proofs').select('proof_type').eq('related_wholesale_order_id', order1)
    const types = (mine ?? []).map((r) => (r as { proof_type: string }).proof_type)
    expect(types).toContain('bank_receipt')             // son justif de paiement : visible
    expect(types).not.toContain('stock_reception_proof') // preuve fournisseur (coût) : masquée (P2-b)

    // Isolation : B2 ne voit AUCUN justificatif de la commande de B1.
    const c2 = await client(b2.email)
    const { data: other } = await c2.from('order_proofs').select('id').eq('related_wholesale_order_id', order1)
    expect(other?.length ?? 0).toBe(0)
  })
})
