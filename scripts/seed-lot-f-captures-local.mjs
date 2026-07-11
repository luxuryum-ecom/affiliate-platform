#!/usr/bin/env node
/**
 * seed-lot-f-captures-local.mjs — Seed LOCAL uniquement pour les captures d'écran
 * Lot F (relevés PDF) : formulaire payout (méthode), fiche livreur (section relevés
 * signables), espace affilié « Mes relevés ».
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * Usage : node scripts/seed-lot-f-captures-local.mjs
 * Idempotent-ish : réutilise les users par email s'ils existent.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/lot-f-captures-seed-ids.json',
)

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
function getLocalEnv() {
  const out = execSync('supabase status --output env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const pick = (k) => (out.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1] ?? '').trim()
  const url = pick('API_URL')
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) throw new Error(`REFUS: non-local ${url}`)
  return { url, serviceKey: pick('SERVICE_ROLE_KEY') }
}

const { url, serviceKey } = getLocalEnv()
console.log('[GARDE-FOU] URL locale confirmée :', url)
const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const ADMIN = { email: 'lotf-admin-cap@test.local', password: 'LotFAdmin2026!X' }
const AFF = { email: 'lotf-aff-cap@test.local', password: 'LotFAff2026!X' }

async function ensureUser(email, password, role, fullName) {
  // Cherche un user existant par email (pagination simple).
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users?.find((u) => u.email === email)
  let id
  if (existing) {
    id = existing.id
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { role, full_name: fullName },
    })
    if (error) throw error
    id = data.user.id
  }
  await sb.from('profiles').update({ role, status: 'approved', full_name: fullName }).eq('id', id)
  return id
}

async function seedOrder(affiliateId, productId, total, courier = null) {
  const { data } = await sb.from('orders').insert({
    affiliate_id: affiliateId, product_id: productId, customer_name: 'Client Démo', customer_phone: '0600000000',
    customer_city: 'Casablanca', customer_address: 'Rue Démo', quantity: 1, total_amount: total,
    commission_amount: 0, status: 'delivered', delivered_at: new Date().toISOString(), courier_id: courier,
  }).select('id').single()
  return data.id
}

const adminId = await ensureUser(ADMIN.email, ADMIN.password, 'admin', 'Abdou Admin')
const affId = await ensureUser(AFF.email, AFF.password, 'affiliate', 'Youssef Bennani')

const { data: prod } = await sb.from('products').insert({ name: `Prod Lot F ${Date.now()}`, sell_price: 30000 }).select('id').single()
const productId = prod.id

// ── Payout affilié PAYÉ + relevé figé ────────────────────────────────────────
const lines = [
  { total: 300, comm: 45 },
  { total: 500, comm: 80 },
  { total: 1250, comm: 175 },
]
const totalComm = lines.reduce((s, l) => s + l.comm, 0)
const { data: payout } = await sb.from('payouts').insert({
  affiliate_id: affId, amount: totalComm, status: 'paid', reference: 'VIR-2026-0042',
  payment_method: 'virement', paid_at: new Date().toISOString(),
}).select('id').single()
for (const l of lines) {
  const oid = await seedOrder(affId, productId, l.total)
  const { data: c } = await sb.from('commissions').insert({ affiliate_id: affId, order_id: oid, amount: l.comm, status: 'paid' }).select('id').single()
  await sb.from('ledger_entries').insert({
    affiliate_id: affId, entry_type: 'payout', amount: -l.comm, order_id: oid, commission_id: c.id,
    payout_id: payout.id, idempotency_key: `payout:${c.id}`, metadata: { payout_id: payout.id },
  })
}
const { error: psErr } = await sb.rpc('generate_payout_statement', { p_payout_id: payout.id })
if (psErr) throw new Error(`generate_payout_statement: ${psErr.message}`)

// ── Livreur + activité + relevé signable figé ────────────────────────────────
const { data: courier } = await sb.from('couriers').insert({
  name: 'Ahmed El Idrissi', courier_type: 'personal', status: 'active', balance_cap_mad: 5000, phone: '0655443322',
}).select('id').single()
const co1 = await seedOrder(affId, productId, 400, courier.id)
const co2 = await seedOrder(affId, productId, 350, courier.id)
await sb.from('scan_events').insert([
  { scan_type: 'pickup_dispatch', order_id: co1, order_type: 'affiliate', carrier_tracking_ref: `capf-${co1}`, scanned_qty: 1 },
  { scan_type: 'pickup_dispatch', order_id: co2, order_type: 'affiliate', carrier_tracking_ref: `capf-${co2}`, scanned_qty: 1 },
])
await sb.from('courier_product_debts').insert({ courier_id: courier.id, order_id: co1, quantity: 1, amount_mad: 120, reason: 'Colis perdu (démo)' })
const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
const end = new Date().toISOString().slice(0, 10)
const { error: csErr } = await sb.rpc('generate_courier_statement', { p_courier_id: courier.id, p_start: start, p_end: end })
if (csErr) throw new Error(`generate_courier_statement: ${csErr.message}`)

const seeds = {
  admin: ADMIN, affiliate: AFF,
  courierId: courier.id, payoutId: payout.id, affiliateId: affId,
}
writeFileSync(SEEDS_FILE, JSON.stringify(seeds, null, 2))
console.log('[SEED OK]', JSON.stringify({ courierId: courier.id, payoutId: payout.id }))
