/**
 * Lot C — Preuves RUNTIME : dashboard livreur CLOISONNÉ.
 *
 * Test d'INTÉGRATION LOCAL (assertLocalSupabase). Prouve :
 *  1. getCourierDashboard(codeA) ne renvoie QUE les livraisons/retours du livreur A
 *     — JAMAIS celles du livreur B (cloisonnement).
 *  2. Le solde affiché = EXACTEMENT v_courier_balances du livreur (aucun calcul parallèle).
 *  3. Le contact client (nom/tél/adresse) n'est présent que pour SES livraisons.
 *  4. Code invalide → erreur générique, zéro donnée.
 *
 * RÈGLES ABSOLUES : jamais la prod ; clés via getLocalSupabaseEnv().
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { getCourierDashboard } from '@/app/actions/courier-dashboard'

const testTag = `lotc-${Date.now()}`
const CODE_A = `LOTCAAA${testTag.slice(-8).toUpperCase()}`
const CODE_B = `LOTCBBB${testTag.slice(-8).toUpperCase()}`
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

let sb: SupabaseClient
let affiliateId: string
let productId: string
let courierA: string
let courierB: string
let orderA1: string
let orderAret: string
let orderB1: string

async function seedOrder(courier: string, status: string, total: number, name: string): Promise<string> {
  const { data, error } = await sb.from('orders').insert({
    affiliate_id: affiliateId, product_id: productId,
    customer_name: name, customer_phone: '0611223344', customer_city: 'Casablanca',
    customer_address: '10 rue test', quantity: 1, total_amount: total,
    commission_amount: 50, affiliate_commission_mad_snapshot: 50, status, courier_id: courier,
  }).select('id').single()
  if (error || !data) throw new Error(`seed order: ${error?.message}`)
  return data.id as string
}

describe('Lot C — dashboard livreur cloisonné (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot-c-setup')
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey
    sb = createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: aff } = await sb.auth.admin.createUser({
      email: `taff-${testTag}@test.local`, password: 'TestLotC2026!X', email_confirm: true,
      user_metadata: { role: 'affiliate', full_name: `Aff ${testTag}` },
    })
    affiliateId = aff!.user!.id
    await sb.from('profiles').update({ role: 'affiliate', status: 'approved' }).eq('id', affiliateId)
    const { data: prod } = await sb.from('products').insert({ name: `Prod ${testTag}`, sell_price: 30000 }).select('id').single()
    productId = prod!.id

    const mk = async (code: string, name: string) => (await sb.from('couriers').insert({
      name, courier_type: 'personal', status: 'active',
      access_code_hash: sha(code), access_code_expires_at: new Date(Date.now() + 864e5).toISOString(),
    }).select('id').single()).data!.id as string
    courierA = await mk(CODE_A, `Livreur A ${testTag}`)
    courierB = await mk(CODE_B, `Livreur B ${testTag}`)

    orderA1 = await seedOrder(courierA, 'confirmed', 25000, `Client A1 ${testTag}`)
    orderAret = await seedOrder(courierA, 'returned', 18000, `Client Aret ${testTag}`)
    orderB1 = await seedOrder(courierB, 'confirmed', 40000, `Client B1 ${testTag}`)
  }, 60000)

  it('1. dashboard A ne montre QUE les livraisons de A (jamais B)', async () => {
    const { dashboard, error } = await getCourierDashboard(CODE_A)
    expect(error).toBeNull()
    const ids = dashboard!.deliveries.map((d) => d.orderId)
    expect(ids).toContain(orderA1)
    expect(ids).not.toContain(orderB1) // cloisonnement : jamais la commande de B
  })

  it('2. le solde = EXACTEMENT v_courier_balances (aucun calcul parallèle)', async () => {
    const { data: bal } = await sb.from('v_courier_balances')
      .select('cash_owed_mad, product_debt_mad, total_balance_mad').eq('id', courierA).maybeSingle()
    const { dashboard } = await getCourierDashboard(CODE_A)
    expect(dashboard!.cashOwedMad).toBe(Number(bal!.cash_owed_mad))
    expect(dashboard!.productDebtMad).toBe(Number(bal!.product_debt_mad))
    expect(dashboard!.totalBalanceMad).toBe(Number(bal!.total_balance_mad))
    expect(dashboard!.toDepositMad).toBe(Number(bal!.cash_owed_mad))
  })

  it('3. contact client présent pour SES livraisons + retours scopés', async () => {
    const { dashboard } = await getCourierDashboard(CODE_A)
    const d = dashboard!.deliveries.find((x) => x.orderId === orderA1)!
    expect(d.customerName).toContain('Client A1')
    expect(d.customerPhone).toBeTruthy()
    expect(d.customerAddress).toBeTruthy()
    // retour de A présent, pas d'autre
    expect(dashboard!.returns.map((r) => r.orderId)).toContain(orderAret)
  })

  it('4. dashboard B ne voit pas les commandes de A', async () => {
    const { dashboard } = await getCourierDashboard(CODE_B)
    const ids = dashboard!.deliveries.map((d) => d.orderId)
    expect(ids).toContain(orderB1)
    expect(ids).not.toContain(orderA1)
  })

  it('5. code invalide → erreur générique, zéro donnée', async () => {
    const { dashboard, error } = await getCourierDashboard('INVALIDCODE00000')
    expect(error).toBeTruthy()
    expect(dashboard).toBeNull()
  })

  afterAll(async () => {
    if (!sb) return
    try {
      await sb.from('orders').update({ courier_id: null }).in('courier_id', [courierA, courierB])
      await sb.from('couriers').delete().in('id', [courierA, courierB])
      if (affiliateId) await sb.auth.admin.deleteUser(affiliateId)
    } catch { /* toléré */ }
  })
})
