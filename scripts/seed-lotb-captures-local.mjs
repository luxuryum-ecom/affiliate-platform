#!/usr/bin/env node
/**
 * seed-lotb-captures-local.mjs — Seed LOCAL uniquement pour peupler le portail
 * livreur cloisonné `/courier/scan?code=...` (module Livreurs, Lot B) en vue de
 * captures d'écran mobile FR/AR.
 *
 * Calque scripts/seed-couriers-captures-local.mjs (garde-fou local identique).
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * NOTE ACCÈS (mig 127) : le portail /courier/scan résout le livreur via
 * `couriers.access_code_hash` = sha256(code) en hex (encode(digest(code,'sha256'),'hex')
 * côté SQL). On seed un code CONNU en calculant le même hash côté Node
 * (crypto.createHash('sha256')...digest('hex')) — identique bit à bit à `digest()`
 * pgcrypto pour SHA-256.
 *
 * NOTE FILE (v_courier_scan_queue, mig 127) : la file expose les commandes
 * `orders.status IN ('confirmed','shipped')` avec `affiliate_id IS NOT NULL`,
 * assignées à CE livreur OU non assignées (`courier_id IS NULL`).
 *
 * Usage :
 *   node scripts/seed-lotb-captures-local.mjs --seed
 *
 * Idempotent : ré-exécuté, retrouve les entités par email (users) / notes taguées
 * (orders) / name (couriers) — ne duplique rien.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/lotb-captures-seed-ids.json',
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

const AFFILIATE_EMAIL = 'lotbaffiliate-cap@test.local'
const TEST_PWD = 'LotBCapture2026!'
const TAG = 'LOTB_CAPTURE_SEED'
const COURIER_NAME = 'Rachid Livreur'
// Code d'accès CONNU (constante, jamais un secret réel — usage LOCAL uniquement,
// portail livreur cloisonné /courier/scan). Cf. RÈGLE #7 CLAUDE.md.
const ACCESS_CODE = 'LOTBDEMO12345678'

function sha256Hex(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex')
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
  const existing = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture Lot B')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Produit déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture Lot B',
    description: 'Produit de test automatisé pour captures portail livreur scan',
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
    category: 'Test Lot B Captures',
    subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Produit créé (id=${r.body[0].id})`)
  return r.body[0].id
}

async function ensureCourier() {
  const existing = await rest('GET', `/rest/v1/couriers?name=eq.${encodeURIComponent(COURIER_NAME)}&select=id,access_code_hash`)
  const hash = sha256Hex(ACCESS_CODE)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    const id = existing.body[0].id
    if (existing.body[0].access_code_hash === hash) {
      console.log(`[SEED] Livreur ${COURIER_NAME} déjà existant avec le bon hash (id=${id})`)
      return id
    }
    // Réaligne le hash/expiration/status sur le code connu (idempotence forte).
    const upd = await rest('PATCH', `/rest/v1/couriers?id=eq.${id}`, {
      access_code_hash: hash,
      access_code_expires_at: expiresAt,
      status: 'active',
    }, 'return=minimal')
    if (upd.status >= 300) {
      throw new Error(`Réalignement hash livreur ${COURIER_NAME} échoué : HTTP ${upd.status} ${JSON.stringify(upd.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Livreur ${COURIER_NAME} réaligné sur le code d'accès connu (id=${id})`)
    return id
  }

  const r = await rest('POST', '/rest/v1/couriers', {
    name: COURIER_NAME,
    courier_type: 'personal',
    phone: '0661998800',
    notes: 'Livreur de test — captures portail /courier/scan (Lot B).',
    status: 'active',
    balance_cap_mad: 2000.0,
    access_code_hash: hash,
    access_code_expires_at: expiresAt,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création livreur ${COURIER_NAME} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Livreur ${COURIER_NAME} créé (id=${id})`)
  return id
}

async function ensureOrder(spec, affiliateId, productId, courierId) {
  const existing = await rest('GET', `/rest/v1/orders?notes=eq.${encodeURIComponent(spec.tag)}&select=id,status,courier_id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    const id = existing.body[0].id
    // Réaligne status/courier_id au cas où un run précédent aurait fait avancer la commande.
    const needsFix = existing.body[0].status !== 'confirmed' || existing.body[0].courier_id !== (courierId ?? null)
    if (needsFix) {
      const upd = await rest('PATCH', `/rest/v1/orders?id=eq.${id}`,
        { status: 'confirmed', courier_id: courierId ?? null },
        'return=minimal')
      if (upd.status >= 300) {
        throw new Error(`Réalignement commande ${spec.tag} échoué : HTTP ${upd.status} ${JSON.stringify(upd.body).slice(0, 300)}`)
      }
      console.log(`[SEED] Commande ${spec.tag} réalignée (status=confirmed, courier_id=${courierId ?? 'null'})`)
    } else {
      console.log(`[SEED] Commande ${spec.tag} déjà existante et conforme (id=${id})`)
    }
    return id
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
    status: 'confirmed',
    courier_id: courierId ?? null,
    notes: spec.tag,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création commande ${spec.tag} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Commande ${spec.tag} créée (id=${id}, status=confirmed, courier_id=${courierId ?? 'null'})`)
  return id
}

// ── Données ────────────────────────────────────────────────────────────────────
// 1 commande assignée au livreur (file « assignée à moi ») + 3 commandes
// disponibles/non assignées (file « disponible »), villes/montants variés MAD.
const ORDERS = [
  { tag: `${TAG}_ASSIGNED_1`, city: 'Casablanca', total: 250.0, commission: 45.0, quantity: 1, name: 'Sara Amrani', phone: '0661223301', assign: true },
  { tag: `${TAG}_AVAILABLE_1`, city: 'Rabat', total: 380.0, commission: 65.0, quantity: 1, name: 'Yassine Berrada', phone: '0661223302', assign: false },
  { tag: `${TAG}_AVAILABLE_2`, city: 'Casablanca', total: 500.0, commission: 80.0, quantity: 2, name: 'Fatima Ezzahra', phone: '0661223303', assign: false },
  { tag: `${TAG}_AVAILABLE_3`, city: 'Rabat', total: 320.0, commission: 55.0, quantity: 1, name: 'Omar Tazi', phone: '0661223304', assign: false },
]

async function seed() {
  console.log('\n[SEED] Démarrage seed portail livreur scan (captures FR/AR) — LOCAL UNIQUEMENT\n')

  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture Lot B')
  const productId = await ensureProduct()
  const courierId = await ensureCourier()

  const orderIds = []
  for (const spec of ORDERS) {
    const id = await ensureOrder(spec, affiliateId, productId, spec.assign ? courierId : null)
    orderIds.push(id)
  }

  const seedData = {
    affiliateId,
    productId,
    courierId,
    accessCode: ACCESS_CODE,
    orderIds,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Livreur : ${COURIER_NAME} (id=${courierId})`)
  console.log(`  Code d'accès (LOCAL uniquement) : ${ACCESS_CODE}`)
  console.log(`  1 commande assignée au livreur + 3 disponibles (status=confirmed)`)
  console.log(`  Portail à capturer : /courier/scan?code=${ACCESS_CODE}`)
  console.log('\n[SEED] FAIT.\n')
}

const mode = process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
