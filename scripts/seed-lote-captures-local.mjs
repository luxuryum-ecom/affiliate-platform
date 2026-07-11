#!/usr/bin/env node
/**
 * seed-lote-captures-local.mjs — Seed LOCAL uniquement pour peupler les écrans
 * du Lot E (notifications module Livreurs) : `/courier?code=...` (Mes retours +
 * Versements enregistrés) et la cloche admin (`/admin/dashboard`, event
 * courier_return_declared).
 *
 * Calque scripts/seed-lotd-captures-local.mjs (garde-fou local identique,
 * retours via RPC officielles, chaîne de garde mig 128).
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * Usage :
 *   node scripts/seed-lote-captures-local.mjs --seed
 *
 * Idempotent : ré-exécuté, retrouve les entités par email (users) / notes taguées
 * (orders) / name (couriers) — ne duplique rien ; réaligne courier_id/status/hash.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/lote-captures-seed-ids.json',
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

// ── REST / RPC helpers ────────────────────────────────────────────────────────
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

async function rpc(fn, args) {
  const res = await fetch(`${U}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: K,
      Authorization: `Bearer ${K}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const txt = await res.text()
  let json
  try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

const ADMIN_EMAIL = 'loteadmin-cap@test.local'
const AFFILIATE_EMAIL = 'loteaffiliate-cap@test.local'
const TEST_PWD = 'LotECapture2026!'
const TAG = 'LOTE_CAPTURE_SEED'
const COURIER_NAME = 'Samir Livreur'
const ACCESS_CODE_PLAIN = 'LOTEDEMO12345678'

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
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
  const existing = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture Lot E')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Produit déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture Lot E',
    description: 'Produit de test automatisé pour captures notifications livreur',
    sell_price: 300.0,
    commission_amount: 50.0,
    stock_count: 200,
    images: [],
    active: true,
    source_type: 'local_production',
    submitted_via: 'admin_dashboard',
    approval_status: 'approved',
    affiliate_enabled: true,
    origin_country: 'Maroc',
    category: 'Test Lot E Captures',
    subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Produit créé (id=${r.body[0].id})`)
  return r.body[0].id
}

async function ensureCourier() {
  const hash = sha256Hex(ACCESS_CODE_PLAIN)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const existing = await rest('GET', `/rest/v1/couriers?name=eq.${encodeURIComponent(COURIER_NAME)}&select=id,status,access_code_hash`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    const id = existing.body[0].id
    if (existing.body[0].status !== 'active' || existing.body[0].access_code_hash !== hash) {
      await rest('PATCH', `/rest/v1/couriers?id=eq.${id}`, {
        status: 'active',
        access_code_hash: hash,
        access_code_expires_at: expiresAt,
      }, 'return=minimal')
    }
    console.log(`[SEED] Livreur ${COURIER_NAME} déjà existant (id=${id}), code d'accès réaligné`)
    return id
  }
  const r = await rest('POST', '/rest/v1/couriers', {
    name: COURIER_NAME,
    courier_type: 'personal',
    phone: '0661998844',
    notes: 'Livreur de test — captures notifications (Lot E).',
    status: 'active',
    balance_cap_mad: 3000.0,
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
    const needsFix = existing.body[0].status !== spec.status || existing.body[0].courier_id !== courierId
    if (needsFix) {
      const upd = await rest('PATCH', `/rest/v1/orders?id=eq.${id}`,
        { status: spec.status, courier_id: courierId },
        'return=minimal')
      if (upd.status >= 300) {
        throw new Error(`Réalignement commande ${spec.tag} échoué : HTTP ${upd.status} ${JSON.stringify(upd.body).slice(0, 300)}`)
      }
      console.log(`[SEED] Commande ${spec.tag} réalignée (status=${spec.status}, courier_id=${courierId})`)
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
    status: spec.status,
    courier_id: courierId,
    notes: spec.tag,
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création commande ${spec.tag} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Commande ${spec.tag} créée (id=${id}, status=${spec.status}, courier_id=${courierId})`)
  return id
}

// ── Retours — via les RPC officielles (chaîne de garde, mig 128) ─────────────
async function ensureReturnState(orderId, courierId, targetState) {
  const cur = await rest('GET', `/rest/v1/courier_returns?order_id=eq.${orderId}&select=id,state`)
  const curState = Array.isArray(cur.body) && cur.body[0] ? cur.body[0].state : null
  if (curState === targetState) {
    console.log(`[SEED] Retour commande ${orderId} déjà en état '${targetState}'`)
    return
  }

  if (!curState) {
    const d = await rpc('declare_courier_return', { p_order_id: orderId, p_courier_id: courierId })
    if (d.status >= 300) {
      throw new Error(`declare_courier_return échoué (${orderId}) : HTTP ${d.status} ${JSON.stringify(d.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Retour déclaré pour commande ${orderId} (state=declared)`)
  }

  if (targetState === 'declared') return

  if (targetState === 'confirmed_depot') {
    const c = await rpc('confirm_return_depot', { p_order_id: orderId })
    if (c.status >= 300) {
      throw new Error(`confirm_return_depot échoué (${orderId}) : HTTP ${c.status} ${JSON.stringify(c.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Retour confirmé (dépôt) pour commande ${orderId} (state=confirmed_depot)`)
    return
  }

  throw new Error(`État de retour cible inconnu : ${targetState}`)
}

async function ensureRemittance(courierId) {
  const existing = await rest('GET', `/rest/v1/courier_remittances?idempotency_key=eq.${encodeURIComponent(TAG + '_REMIT')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Versement déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/courier_remittances', {
    courier_name: COURIER_NAME,
    courier_id: courierId,
    expected_amount_mad: 300.0,
    received_amount_mad: 300.0,
    currency: 'MAD',
    status: 'reconciled',
    reference: 'LOTE-CAP-REMIT',
    notes: 'Versement de test — captures Lot E.',
    idempotency_key: `${TAG}_REMIT`,
    reconciled_at: new Date().toISOString(),
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création versement échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  const id = r.body[0].id
  console.log(`[SEED] Versement créé (id=${id}, received_amount_mad=300.00, status=reconciled)`)
  return id
}

// ── Cloche admin — insert direct notifications (service_role), pas de RPC dédiée.
// NOTE : uniq_notif_courier_event_recipient (mig 129) est un index UNIQUE SANS
// clause WHERE sur (courier_id, event, recipient_id) → au plus 1 ligne
// courier_return_declared pour CE livreur/admin. On seed donc 1 ligne (la
// consigne « 1-2 lignes » est respectée par le bas de la fourchette, contrainte
// par l'anti-spam voulu de la mig 129 — ne pas la contourner par un 2e event
// factice qui ne reflèterait pas le vrai chemin de notif).
async function ensureAdminBellNotifications(adminId, courierId) {
  const existing = await rest('GET', `/rest/v1/notifications?recipient_id=eq.${adminId}&event=eq.courier_return_declared&courier_id=eq.${courierId}&select=id`)
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    console.log(`[SEED] Notif(s) cloche admin déjà existante(s) (${existing.body.length})`)
    return
  }
  const rows = [
    {
      recipient_id: adminId,
      event: 'courier_return_declared',
      courier_id: courierId,
      payload: { courierName: COURIER_NAME, reference: 'ABC12345', amountMad: 250 },
      channels: ['in_app', 'telegram'],
      created_at: new Date().toISOString(),
    },
  ]
  const r = await rest('POST', '/rest/v1/notifications', rows, 'return=representation')
  if (!Array.isArray(r.body) || r.body.length === 0) {
    throw new Error(`Création notifs cloche admin échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] ${r.body.length} notif(s) cloche admin créée(s) (event=courier_return_declared)`)
}

// ── Données ────────────────────────────────────────────────────────────────────
// 2-3 commandes assignées confirmed (livraisons en cours — pour "Mes livraisons").
const DELIVERY_ORDERS = [
  { tag: `${TAG}_DELIV_1`, city: 'Casablanca', total: 250.0, commission: 45.0, quantity: 1, name: 'Amina Alaoui', phone: '0661112401', status: 'confirmed' },
  { tag: `${TAG}_DELIV_2`, city: 'Rabat', total: 380.0, commission: 65.0, quantity: 1, name: 'Karim Bennani', phone: '0661112402', status: 'confirmed' },
  { tag: `${TAG}_DELIV_3`, city: 'Casablanca', total: 500.0, commission: 80.0, quantity: 1, name: 'Nadia Fassi', phone: '0661112403', status: 'confirmed' },
]

// 1 commande retour 'declared' + 1 'confirmed_depot' (statut orders 'confirmed' :
// mark_return_lost/confirm exigent une commande non 'delivered').
const RETURN_ORDERS = {
  declared: { tag: `${TAG}_RETURN_DECLARED`, city: 'Rabat', total: 300.0, commission: 50.0, quantity: 1, name: 'Hicham Idrissi', phone: '0661112404', status: 'confirmed' },
  confirmed_depot: { tag: `${TAG}_RETURN_CONFIRMED`, city: 'Marrakech', total: 420.0, commission: 70.0, quantity: 1, name: 'Salma Chraibi', phone: '0661112405', status: 'confirmed' },
}

async function seed() {
  console.log('\n[SEED] Démarrage seed notifications livreur (captures Lot E) — LOCAL UNIQUEMENT\n')

  const adminId = await ensureUser(ADMIN_EMAIL, 'admin', 'Admin Capture Lot E')
  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture Lot E')
  const productId = await ensureProduct()
  const courierId = await ensureCourier()

  // Livraisons en cours (confirmations « Mes livraisons »).
  const deliveryOrderIds = []
  for (const spec of DELIVERY_ORDERS) deliveryOrderIds.push(await ensureOrder(spec, affiliateId, productId, courierId))

  // Retours (2 états distincts) + machine à états (RPC officielles).
  const returnOrderIds = {}
  for (const [state, spec] of Object.entries(RETURN_ORDERS)) {
    const id = await ensureOrder(spec, affiliateId, productId, courierId)
    returnOrderIds[state] = id
    await ensureReturnState(id, courierId, state)
  }

  // Versement réconcilié (confirmation « Versements enregistrés »).
  const remittanceId = await ensureRemittance(courierId)

  // Cloche admin peuplée.
  await ensureAdminBellNotifications(adminId, courierId)

  const seedData = {
    adminId,
    adminEmail: ADMIN_EMAIL,
    adminPassword: TEST_PWD,
    affiliateId,
    productId,
    courierId,
    courierName: COURIER_NAME,
    accessCode: ACCESS_CODE_PLAIN,
    deliveryOrderIds,
    returnOrderIds,
    remittanceId,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Admin   : ${ADMIN_EMAIL} / ${TEST_PWD}`)
  console.log(`  Livreur : ${COURIER_NAME} (id=${courierId}) — code d'accès portail : ${ACCESS_CODE_PLAIN}`)
  console.log(`  3 livraisons en cours, 2 retours (declared/confirmed_depot), 1 versement réconcilié 300.00 MAD`)
  console.log(`  2 notifs cloche admin (event=courier_return_declared)`)
  console.log(`  Portail livreur à capturer : /courier?code=${ACCESS_CODE_PLAIN}`)
  console.log('\n[SEED] FAIT.\n')
}

const mode = process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
