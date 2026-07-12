#!/usr/bin/env node
/**
 * seed-guardian-captures-local.mjs — Seed LOCAL uniquement pour peupler le cockpit
 * Agent Gardien (/admin/guardian) + les écrans mobiles (réception, inventaire) du
 * Lot G, en vue de captures FR/AR. Calque de seed-couriers-captures-local.mjs.
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés via `supabase status` — JAMAIS .env.local / la prod.
 *
 * Usage : node scripts/seed-guardian-captures-local.mjs --seed
 * Idempotent (retrouve par email/name/tag).
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/fbf31931-dd56-4c84-b141-1eb66ff5f729/scratchpad/guardian-captures-seed-ids.json',
)

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) throw new Error(`REFUS: seed NON-LOCAL (URL=${url || 'absente'}).`)
  return url
}
function getLocalSupabaseEnv() {
  let out = ''
  try { out = execSync('supabase status --output env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { throw new Error('REFUS: « supabase status » illisible. Lance « supabase start ».') }
  const pick = (k) => { const m = out.match(new RegExp(`^${k}="?(.*?)"?$`, 'm')); return (m?.[1] ?? '').trim() }
  const url = pick('API_URL'), anonKey = pick('ANON_KEY'), serviceKey = pick('SERVICE_ROLE_KEY')
  assertLocalSupabase(url)
  if (!anonKey || !serviceKey) throw new Error('REFUS: clés locales introuvables.')
  return { url, anonKey, serviceKey }
}
const { url: U, serviceKey: K } = getLocalSupabaseEnv()
console.log(`[GARDE-FOU] URL locale confirmée : ${U}`)

async function rest(method, path, body, prefer) {
  const res = await fetch(`${U}${path}`, {
    method,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}
async function rpc(fn, args) { return rest('POST', `/rest/v1/rpc/${fn}`, args) }

const ADMIN_EMAIL = 'guardianadmin-cap@test.local'
const AFFILIATE_EMAIL = 'guardianaffiliate-cap@test.local'
const TEST_PWD = 'Guardian0Capture2026!'
const TAG = 'GUARDIAN_CAPTURE_SEED'
const ACCESS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function accessCode() { const b = randomBytes(8); let o = ''; for (let i = 0; i < 8; i++) o += ACCESS_ALPHABET[b[i] % ACCESS_ALPHABET.length]; return o }

async function findUserByEmail(email) {
  const r = await rest('GET', `/auth/v1/admin/users?per_page=200`)
  const users = Array.isArray(r.body?.users) ? r.body.users : (Array.isArray(r.body) ? r.body : [])
  return users.find((u) => u.email === email) ?? null
}
async function ensureUser(email, role, fullName) {
  const existing = await findUserByEmail(email)
  let userId = existing?.id
  if (!existing) {
    const r = await rest('POST', '/auth/v1/admin/users', { email, password: TEST_PWD, email_confirm: true })
    if (!r.body?.id) throw new Error(`user ${email}: HTTP ${r.status}`)
    userId = r.body.id
  }
  await rest('POST', '/rest/v1/profiles', { id: userId, role, full_name: fullName, status: 'approved' }, 'resolution=merge-duplicates,return=minimal')
  console.log(`[SEED] user ${email} (${role}) → ${userId}`)
  return userId
}
async function ensureProduct() {
  const ex = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture Gardien')}&select=id`)
  if (Array.isArray(ex.body) && ex.body[0]?.id) return ex.body[0].id
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture Gardien', description: 'Test captures Lot G', sell_price: 350.0, commission_amount: 60.0,
    stock_count: 200, images: [], active: true, source_type: 'local_production', submitted_via: 'admin_dashboard',
    approval_status: 'approved', affiliate_enabled: true, origin_country: 'Maroc', category: 'Test Gardien', subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) throw new Error(`produit: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
  return r.body[0].id
}
async function ensureCourier(spec) {
  const ex = await rest('GET', `/rest/v1/couriers?name=eq.${encodeURIComponent(spec.name)}&select=id`)
  if (Array.isArray(ex.body) && ex.body[0]?.id) return ex.body[0].id
  const r = await rest('POST', '/rest/v1/couriers', {
    name: spec.name, courier_type: spec.type, company_name: spec.company ?? null, phone: spec.phone,
    notes: spec.notes ?? null, status: 'active', balance_cap_mad: spec.cap, access_code: accessCode(),
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) throw new Error(`courier ${spec.name}: HTTP ${r.status}`)
  console.log(`[SEED] courier ${spec.name} → ${r.body[0].id}`)
  return r.body[0].id
}
async function ensureOrder(tag, affiliateId, productId, total, city, name) {
  const ex = await rest('GET', `/rest/v1/orders?notes=eq.${encodeURIComponent(tag)}&select=id`)
  if (Array.isArray(ex.body) && ex.body[0]?.id) return ex.body[0].id
  const r = await rest('POST', '/rest/v1/orders', {
    affiliate_id: affiliateId, product_id: productId, customer_name: name, customer_phone: '0661000000',
    customer_city: city, customer_address: `Rue test, ${city}`, quantity: 1, total_amount: total,
    commission_amount: 55.0, affiliate_commission_mad_snapshot: 55.0, status: 'confirmed', notes: tag,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) throw new Error(`order ${tag}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
  return r.body[0].id
}
async function pickupAndDeliver(orderId, courierId) {
  await rpc('record_pickup_scan', { p_order_id: orderId, p_courier_id: courierId })
  await rpc('record_delivery_scan', { p_order_id: orderId, p_courier_id: courierId, p_outcome: 'delivered_collected', p_tracking_ref: null })
}

async function seed() {
  console.log('\n[SEED] Cockpit Agent Gardien (Lot G) — LOCAL UNIQUEMENT\n')
  const adminId = await ensureUser(ADMIN_EMAIL, 'admin', 'Admin Capture Gardien')
  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture Gardien')
  const productId = await ensureProduct()

  const ozone = await ensureCourier({ name: 'Ozone Livraison (Gardien)', type: 'company', company: 'Ozone', phone: '0522334455', notes: 'Société partenaire.', cap: 5000.0 })
  const hassan = await ensureCourier({ name: 'Hassan El Idrissi (Gardien)', type: 'personal', phone: '0661998877', notes: 'Livreur indépendant.', cap: 1000.0 })
  const omar = await ensureCourier({ name: 'Omar Chraibi (Gardien)', type: 'personal', phone: '0661556644', notes: 'À surveiller.', cap: 50.0 })

  // Hassan : une commande livrée + versement DÉCLARÉ en attente (double confirmation).
  const hassanOrder = await ensureOrder(`${TAG}_HASSAN_1`, affiliateId, productId, 300.0, 'Marrakech', 'Nadia Ouahbi')
  await pickupAndDeliver(hassanOrder, hassan)
  await rpc('declare_courier_cash', {
    p_courier_id: hassan, p_order_ids: [hassanOrder], p_amount_mad: 300.0, p_method: 'cash',
    p_actor_id: adminId, p_idempotency_key: `${TAG}_HASSAN_CASH`,
  })

  // Omar : commande livrée → dépassement de plafond (cap 50).
  const omarOrder = await ensureOrder(`${TAG}_OMAR_1`, affiliateId, productId, 320.0, 'Tanger', 'Karim Zerouali')
  await pickupAndDeliver(omarOrder, omar)
  await rpc('evaluate_courier_block', { p_courier_id: omar }) // perso over cap → auto-block + alerte

  // Un retour déclaré ANCIEN (>48h) pour la vue "retours en attente" + détection.
  const ghostOrder = await ensureOrder(`${TAG}_GHOST_1`, affiliateId, productId, 280.0, 'Fès', 'Mehdi Bouzidi')
  await pickupAndDeliver(ghostOrder, hassan)
  const oldDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  const exRet = await rest('GET', `/rest/v1/courier_returns?order_id=eq.${ghostOrder}&select=id`)
  if (!(Array.isArray(exRet.body) && exRet.body[0]?.id)) {
    await rest('POST', '/rest/v1/courier_returns', { order_id: ghostOrder, courier_id: hassan, state: 'declared', declared_at: oldDate }, 'return=minimal')
  }
  await rpc('detect_ghost_returns', { p_hours: 48 })
  await rpc('detect_courier_staff_patterns', { p_window_days: 30, p_threshold: 1 }) // seuil bas → paire flaggée pour la démo

  // Alertes variées ouvertes (démonstration cockpit) — insert direct (le trigger n'empêche que UPDATE/DELETE).
  const wantAlerts = [
    { alert_type: 'ghost_parcel', severity: 'critical', courier_id: null, order_id: ghostOrder, details: { reason: 'reception_sans_ramassage' } },
    { alert_type: 'reception_without_declaration', severity: 'critical', courier_id: hassan, order_id: hassanOrder, details: { bearer_name: 'Hassan El Idrissi' } },
    { alert_type: 'debt_spike', severity: 'warning', courier_id: omar, order_id: null, details: { total_balance_mad: 320 } },
  ]
  for (const a of wantAlerts) {
    const q = `/rest/v1/guardian_alerts?alert_type=eq.${a.alert_type}&status=eq.open&select=id` +
      (a.order_id ? `&order_id=eq.${a.order_id}` : '') + (a.courier_id ? `&courier_id=eq.${a.courier_id}` : '')
    const ex = await rest('GET', q)
    if (Array.isArray(ex.body) && ex.body[0]?.id) continue
    await rest('POST', '/rest/v1/guardian_alerts', a, 'return=minimal')
  }

  const seedData = {
    adminId, adminEmail: ADMIN_EMAIL, adminPassword: TEST_PWD, affiliateId, productId,
    couriers: { ozone, hassan, omar },
    orders: { hassanOrder, omarOrder, ghostOrder },
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs → ${SEEDS_FILE}`)
  console.log(`  Admin : ${ADMIN_EMAIL} / ${TEST_PWD}`)
  console.log('  Cockpit : /admin/guardian  ·  Réception mobile : /admin/couriers/reception  ·  Inventaire : /admin/couriers/inventory')
  console.log('[SEED] FAIT.\n')
}

if (!process.argv.includes('--seed')) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
