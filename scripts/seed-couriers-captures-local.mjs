#!/usr/bin/env node
/**
 * seed-couriers-captures-local.mjs — Seed LOCAL uniquement pour peupler les 2
 * écrans admin registre livreurs (/admin/couriers + /admin/couriers/[id])
 * avec des données réalistes, en vue de captures d'écran FR/AR.
 *
 * Calque exact de scripts/seed-p0-captures-local.mjs (garde-fou local identique).
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * NOTE UNITÉS : `couriers.balance_cap_mad` et `courier_product_debts.amount_mad`
 * sont des numeric(12,2) exprimés DIRECTEMENT en MAD (pas en centimes) — confirmé
 * par src/app/actions/couriers.ts (mapBalanceRow: `Number(r.balance_cap_mad)`
 * sans division) et courier-create-form.tsx (input MAD envoyé tel quel).
 *
 * Usage :
 *   node scripts/seed-couriers-captures-local.mjs --seed
 *
 * Idempotent : ré-exécuté, retrouve les entités par email (users) / notes taguées
 * (orders) / name (couriers) — ne duplique rien.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/couriers-captures-seed-ids.json',
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

const ADMIN_EMAIL = 'couriersadmin-cap@test.local'
const AFFILIATE_EMAIL = 'couriersaffiliate-cap@test.local'
const TEST_PWD = 'Couriers0Capture2026!'
const TAG = 'COURIERS_CAPTURE_SEED'

const ACCESS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateAccessCode() {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ACCESS_ALPHABET[bytes[i] % ACCESS_ALPHABET.length]
  return out
}

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

async function ensureProduct() {
  const existing = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture Livreurs')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Produit déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture Livreurs',
    description: 'Produit de test automatisé pour captures registre livreurs',
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
    category: 'Test Livreurs Captures',
    subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Produit créé (id=${r.body[0].id})`)
  return r.body[0].id
}

async function ensureCourier(spec) {
  const existing = await rest('GET', `/rest/v1/couriers?name=eq.${encodeURIComponent(spec.name)}&select=id,access_code`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Livreur ${spec.name} déjà existant (id=${existing.body[0].id})`)
    return { id: existing.body[0].id, accessCode: existing.body[0].access_code }
  }
  const accessCode = generateAccessCode()
  const r = await rest('POST', '/rest/v1/couriers', {
    name: spec.name,
    courier_type: spec.courierType,
    company_name: spec.companyName ?? null,
    phone: spec.phone,
    notes: spec.notes ?? null,
    status: 'active',
    balance_cap_mad: spec.balanceCapMad,
    access_code: accessCode,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création livreur ${spec.name} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Livreur ${spec.name} créé (id=${id}, access_code=${accessCode})`)
  return { id, accessCode }
}

async function ensureOrder(spec, affiliateId, productId) {
  const existing = await rest('GET', `/rest/v1/orders?notes=eq.${encodeURIComponent(spec.tag)}&select=id,status,courier_id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Commande ${spec.tag} déjà existante (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/orders', {
    affiliate_id: affiliateId,
    product_id: productId,
    customer_name: spec.name,
    customer_phone: spec.phone,
    customer_city: spec.city,
    customer_address: `${spec.quantity + 3} Rue de test, ${spec.city}`,
    quantity: spec.quantity,
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

async function markDeliveredAndAssign(orderId, courierId, tag) {
  const cur = await rest('GET', `/rest/v1/orders?id=eq.${orderId}&select=status,courier_id`)
  if (cur.body?.[0]?.status === 'delivered' && cur.body?.[0]?.courier_id === courierId) {
    console.log(`[SEED] Commande ${tag} déjà 'delivered' + assignée`)
    return
  }
  const r = await rest('PATCH', `/rest/v1/orders?id=eq.${orderId}`,
    { status: 'delivered', delivered_at: new Date().toISOString(), courier_id: courierId },
    'return=minimal')
  if (r.status >= 300) {
    throw new Error(`Passage 'delivered'+assignation commande ${tag} échoué : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Commande ${tag} → status=delivered, courier_id=${courierId}`)
}

async function ensureProductDebt(courierId, orderId, spec) {
  const existing = await rest('GET', `/rest/v1/courier_product_debts?courier_id=eq.${courierId}&reason=eq.${encodeURIComponent(spec.reason)}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Créance produit "${spec.reason}" déjà existante (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/courier_product_debts', {
    courier_id: courierId,
    order_id: orderId,
    quantity: spec.quantity,
    amount_mad: spec.amountMad,
    reason: spec.reason,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création créance produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Créance produit "${spec.reason}" créée (id=${id}, montant=${spec.amountMad} MAD)`)
  return id
}

// ── Données ────────────────────────────────────────────────────────────────────

// 1. Société Ozone — 2 commandes livrées, encours sous plafond.
const OZONE_ORDERS = [
  { tag: `${TAG}_OZONE_1`, city: 'Casablanca', total: 450.0, commission: 70.0, quantity: 1, name: 'Salma Idrissi', phone: '0661112201' },
  { tag: `${TAG}_OZONE_2`, city: 'Rabat', total: 380.0, commission: 65.0, quantity: 2, name: 'Anas Fassi', phone: '0661112202' },
]

// 2. Livreur perso (avec créance produit) — sous plafond malgré la créance.
const PERSO_ORDERS = [
  { tag: `${TAG}_PERSO_1`, city: 'Marrakech', total: 300.0, commission: 55.0, quantity: 1, name: 'Nadia Ouahbi', phone: '0661112203' },
  { tag: `${TAG}_PERSO_2`, city: 'Fès', total: 250.0, commission: 45.0, quantity: 1, name: 'Mehdi Bouzidi', phone: '0661112204' },
]
const PERSO_DEBT = { quantity: 2, amountMad: 150.0, reason: 'Colis perdu' }

// 3. Livreur en dépassement de plafond — plafond très bas (50 MAD).
const OVERCAP_ORDERS = [
  { tag: `${TAG}_OVERCAP_1`, city: 'Tanger', total: 320.0, commission: 55.0, quantity: 1, name: 'Karim Zerouali', phone: '0661112205' },
  { tag: `${TAG}_OVERCAP_2`, city: 'Agadir', total: 275.0, commission: 50.0, quantity: 1, name: 'Imane Alaoui', phone: '0661112206' },
]

async function seed() {
  console.log('\n[SEED] Démarrage seed registre livreurs (captures FR/AR) — LOCAL UNIQUEMENT\n')

  const adminId = await ensureUser(ADMIN_EMAIL, 'admin', 'Admin Capture Livreurs')
  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture Livreurs')
  const productId = await ensureProduct()

  // ── Courier 1 : société Ozone ──
  const ozone = await ensureCourier({
    name: 'Ozone Livraison',
    courierType: 'company',
    companyName: 'Ozone',
    phone: '0522334455',
    notes: 'Société de livraison partenaire — zone Casablanca/Rabat.',
    balanceCapMad: 5000.0,
  })
  const ozoneOrderIds = []
  for (const spec of OZONE_ORDERS) ozoneOrderIds.push(await ensureOrder(spec, affiliateId, productId))
  for (let i = 0; i < OZONE_ORDERS.length; i++) {
    await markDeliveredAndAssign(ozoneOrderIds[i], ozone.id, OZONE_ORDERS[i].tag)
  }

  // ── Courier 2 : livreur personnel avec créance produit ──
  const perso = await ensureCourier({
    name: 'Hassan El Idrissi',
    courierType: 'personal',
    phone: '0661998877',
    notes: 'Livreur indépendant — zone Marrakech/Fès.',
    balanceCapMad: 1000.0,
  })
  const persoOrderIds = []
  for (const spec of PERSO_ORDERS) persoOrderIds.push(await ensureOrder(spec, affiliateId, productId))
  for (let i = 0; i < PERSO_ORDERS.length; i++) {
    await markDeliveredAndAssign(persoOrderIds[i], perso.id, PERSO_ORDERS[i].tag)
  }
  await ensureProductDebt(perso.id, persoOrderIds[0], PERSO_DEBT)

  // ── Courier 3 : dépassement de plafond ──
  const overcap = await ensureCourier({
    name: 'Omar Chraibi',
    courierType: 'personal',
    phone: '0661556644',
    notes: 'Livreur indépendant — zone Tanger/Agadir.',
    balanceCapMad: 50.0,
  })
  const overcapOrderIds = []
  for (const spec of OVERCAP_ORDERS) overcapOrderIds.push(await ensureOrder(spec, affiliateId, productId))
  for (let i = 0; i < OVERCAP_ORDERS.length; i++) {
    await markDeliveredAndAssign(overcapOrderIds[i], overcap.id, OVERCAP_ORDERS[i].tag)
  }

  const seedData = {
    adminId,
    adminEmail: ADMIN_EMAIL,
    adminPassword: TEST_PWD,
    affiliateId,
    productId,
    couriers: {
      ozone: { id: ozone.id, accessCode: ozone.accessCode },
      perso: { id: perso.id, accessCode: perso.accessCode },
      overcap: { id: overcap.id, accessCode: overcap.accessCode },
    },
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Admin   : ${ADMIN_EMAIL} / ${TEST_PWD}`)
  console.log(`  Ozone (société)     : cap=5000 MAD, cash≈830 MAD, pas de dépassement`)
  console.log(`  Hassan (personnel)  : cap=1000 MAD, cash≈550 MAD + créance produit 150 MAD = 700 MAD, sous plafond`)
  console.log(`  Omar (personnel)    : cap=50 MAD, cash≈595 MAD → DÉPASSEMENT (over_cap=true)`)
  console.log(`  Fiche à capturer (créance visible) : /admin/couriers/${perso.id}`)
  console.log('\n[SEED] FAIT.\n')
}

const mode = process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
