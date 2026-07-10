#!/usr/bin/env node
/**
 * seed-p0-captures-local.mjs — Seed LOCAL uniquement pour peupler les 2 écrans
 * admin P0 trésorerie/réconciliation (/admin/remittances + /admin/treasury)
 * avec des données réalistes, en vue de captures d'écran FR/AR/EN.
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * Usage :
 *   node scripts/seed-p0-captures-local.mjs --seed
 *
 * Idempotent : ré-exécuter ne duplique rien — les entités sont retrouvées par
 * email (users) / notes taguées (orders) / idempotency_key (bordereaux, gérée
 * nativement par la RPC reconcile_courier_remittance).
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/p0-captures-seed-ids.json',
)

// ── Garde-fou local (RÈGLE ABSOLUE #8) ────────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `REFUS: seed pointé sur une base NON-LOCALE (URL=${url || 'absente'}). ` +
      `Lance « supabase start » et utilise les clés LOCALES.`,
    )
  }
  return url
}

function getLocalSupabaseEnv() {
  let out = ''
  try {
    out = execSync('supabase status --output env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('REFUS: impossible de lire « supabase status ». Lance « supabase start ».')
  }
  const pick = (key) => {
    const m = out.match(new RegExp(`^${key}="?(.*?)"?$`, 'm'))
    return (m?.[1] ?? '').trim()
  }
  const url = pick('API_URL')
  const anonKey = pick('ANON_KEY')
  const serviceKey = pick('SERVICE_ROLE_KEY')
  assertLocalSupabase(url)
  if (!anonKey || !serviceKey) {
    throw new Error('REFUS: clés Supabase locales introuvables (supabase start ?).')
  }
  return { url, anonKey, serviceKey }
}

const { url: U, serviceKey: K } = getLocalSupabaseEnv()
console.log(`[GARDE-FOU] URL locale confirmée : ${U}`)

// ── REST helper ────────────────────────────────────────────────────────────────
async function rest(method, path, body, prefer) {
  const res = await fetch(`${U}${path}`, {
    method,
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json
  try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

const ADMIN_EMAIL = 'p0admin-cap@test.local'
const AFFILIATE_EMAIL = 'p0affiliate-cap@test.local'
const TEST_PWD = 'P0Capture2026!'
const TAG = 'P0_CAPTURE_SEED'

async function findUserByEmail(email) {
  const r = await rest('GET', `/auth/v1/admin/users?per_page=200`)
  const users = Array.isArray(r.body?.users) ? r.body.users : (Array.isArray(r.body) ? r.body : [])
  return users.find((u) => u.email === email) ?? null
}

async function ensureUser(email, role, fullName) {
  const existing = await findUserByEmail(email)
  let userId
  if (existing) {
    userId = existing.id
    console.log(`[SEED] User ${email} déjà existant (id=${userId})`)
  } else {
    const r = await rest('POST', '/auth/v1/admin/users', {
      email,
      password: TEST_PWD,
      email_confirm: true,
    })
    if (!r.body?.id) throw new Error(`Création user ${email} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
    userId = r.body.id
    console.log(`[SEED] User ${email} créé (id=${userId})`)
  }

  const p = await rest('POST', '/rest/v1/profiles',
    { id: userId, role, full_name: fullName, status: 'approved' },
    'resolution=merge-duplicates,return=minimal')
  console.log(`[SEED] Profil ${role} upsert HTTP ${p.status}`)

  return userId
}

async function ensureProduct(supplierId) {
  const existing = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture P0')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Produit déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture P0',
    description: 'Produit de test automatisé pour captures P0 trésorerie/réconciliation',
    sell_price: 350.0,
    commission_amount: 60.0,
    stock_count: 200,
    images: [],
    active: true,
    source_type: 'local_production',
    submitted_via: 'admin_dashboard',
    approval_status: 'approved',
    affiliate_enabled: true,
    origin_country: 'Maroc',
    category: 'Test P0 Captures',
    subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Produit créé (id=${r.body[0].id})`)
  return r.body[0].id
}

// 4 commandes : 2 Casablanca (courier CMN) + 2 Rabat (courier RBA).
// [0] Casablanca → réconciliée EN TOTALITÉ.
// [1] Rabat      → réconciliée EN PARTIEL (reçu < attendu, écart visible).
// [2] Casablanca → laissée EN ATTENTE.
// [3] Rabat      → laissée EN ATTENTE.
const ORDER_SPECS = [
  { tag: `${TAG}_1`, city: 'Casablanca', total: 350.0, commission: 60.0, name: 'Fatima Zahra Benali', phone: '0612345671' },
  { tag: `${TAG}_2`, city: 'Rabat', total: 420.0, commission: 70.0, name: 'Youssef El Amrani', phone: '0612345672' },
  { tag: `${TAG}_3`, city: 'Casablanca', total: 280.0, commission: 45.0, name: 'Khadija Ouazzani', phone: '0612345673' },
  { tag: `${TAG}_4`, city: 'Rabat', total: 500.0, commission: 80.0, name: 'Rachid Bennani', phone: '0612345674' },
]

async function ensureOrder(spec, affiliateId, productId) {
  const existing = await rest('GET', `/rest/v1/orders?notes=eq.${encodeURIComponent(spec.tag)}&select=id,status`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Commande ${spec.tag} déjà existante (id=${existing.body[0].id}, status=${existing.body[0].status})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/orders', {
    affiliate_id: affiliateId,
    product_id: productId,
    customer_name: spec.name,
    customer_phone: spec.phone,
    customer_city: spec.city,
    customer_address: `12 Rue de test, ${spec.city}`,
    quantity: 1,
    total_amount: spec.total,
    commission_amount: spec.commission,
    affiliate_commission_mad_snapshot: spec.commission,
    status: 'pending_confirmation',
    notes: spec.tag,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création commande ${spec.tag} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Commande ${spec.tag} créée (id=${id})`)
  return id
}

async function markDelivered(orderId, tag) {
  const cur = await rest('GET', `/rest/v1/orders?id=eq.${orderId}&select=status`)
  if (cur.body?.[0]?.status === 'delivered') {
    console.log(`[SEED] Commande ${tag} déjà 'delivered'`)
    return
  }
  const r = await rest('PATCH', `/rest/v1/orders?id=eq.${orderId}`,
    { status: 'delivered', delivered_at: new Date().toISOString() },
    'return=minimal')
  if (r.status >= 300) {
    throw new Error(`Passage 'delivered' commande ${tag} échoué : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Commande ${tag} → status=delivered (commission + ledger déclenchés par trigger)`)
}

async function reconcile({ courierName, receivedAmount, orderIds, idempotencyKey, reference, courierCode }) {
  const r = await rest('POST', '/rest/v1/rpc/reconcile_courier_remittance', {
    p_courier_name: courierName,
    p_received_amount: receivedAmount,
    p_order_ids: orderIds,
    p_idempotency_key: idempotencyKey,
    p_reference: reference,
    p_notes: `Seed capture P0 — ${courierCode}`,
    p_courier_id: null,
  })
  if (r.status >= 300) {
    throw new Error(`Réconciliation ${courierName} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Réconciliation ${courierName} OK (remittance_id=${r.body})`)
  return r.body
}

async function seed() {
  console.log('\n[SEED] Démarrage seed P0 captures trésorerie/réconciliation — LOCAL UNIQUEMENT\n')

  const adminId = await ensureUser(ADMIN_EMAIL, 'admin', 'Admin Capture P0')
  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture P0')
  const productId = await ensureProduct()

  const orderIds = []
  for (const spec of ORDER_SPECS) {
    const id = await ensureOrder(spec, affiliateId, productId)
    orderIds.push(id)
  }

  // Livraison → déclenche commission 'pending' + écriture ledger (trigger handle_order_delivered).
  for (let i = 0; i < ORDER_SPECS.length; i++) {
    await markDelivered(orderIds[i], ORDER_SPECS[i].tag)
  }

  // Réconciliation [0] Casablanca (CMN) — TOTALE.
  const remit1 = await reconcile({
    courierName: 'CMN Livraison',
    receivedAmount: ORDER_SPECS[0].total,
    orderIds: [orderIds[0]],
    idempotencyKey: 'p0-capture-seed-cmn-full',
    reference: 'CAP-CMN-001',
    courierCode: 'CMN',
  })

  // Réconciliation [1] Rabat (RBA) — PARTIELLE (reçu < attendu → écart visible).
  const receivedPartial = Math.round((ORDER_SPECS[1].total - 40) * 100) / 100
  const remit2 = await reconcile({
    courierName: 'RBA Express',
    receivedAmount: receivedPartial,
    orderIds: [orderIds[1]],
    idempotencyKey: 'p0-capture-seed-rba-partiel',
    reference: 'CAP-RBA-001',
    courierCode: 'RBA',
  })

  const seedData = {
    adminId,
    adminEmail: ADMIN_EMAIL,
    adminPassword: TEST_PWD,
    affiliateId,
    affiliateEmail: AFFILIATE_EMAIL,
    productId,
    orderIds,
    remittanceIds: { cmnFull: remit1, rbaPartial: remit2 },
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Admin   : ${ADMIN_EMAIL} / ${TEST_PWD}`)
  console.log(`  Commande[0] Casablanca 350 MAD  → réconciliée TOTALE (CMN)`)
  console.log(`  Commande[1] Rabat      420 MAD  → réconciliée PARTIELLE reçu=${receivedPartial} (RBA, écart=${ORDER_SPECS[1].total - receivedPartial})`)
  console.log(`  Commande[2] Casablanca 280 MAD  → EN ATTENTE`)
  console.log(`  Commande[3] Rabat      500 MAD  → EN ATTENTE`)
  console.log('\n[SEED] FAIT.\n')
}

const mode = process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
