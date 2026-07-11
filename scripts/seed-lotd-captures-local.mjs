#!/usr/bin/env node
/**
 * seed-lotd-captures-local.mjs — Seed LOCAL uniquement pour peupler les 2 écrans
 * admin du module Livreurs Lot D (/admin/couriers/[id] avec Tournées + Retours,
 * /admin/couriers/pickup) en vue de captures d'écran FR/AR.
 *
 * Calque scripts/seed-couriers-captures-local.mjs + scripts/seed-lotc-captures-local.mjs
 * (garde-fou local identique).
 *
 * RÈGLE ABSOLUE #8 (CLAUDE.md) : cible EXCLUSIVEMENT le Supabase LOCAL
 * (127.0.0.1:54321). Clés lues via `supabase status` — JAMAIS .env.local / la prod.
 *
 * NOTE RETOURS (mig 128, chaîne de garde §🔒) : les 3 états de courier_returns
 * sont produits via les RPC OFFICIELS (declare_courier_return / confirm_return_depot /
 * mark_return_lost), appelés en service_role (auth.role() = 'service_role' passe la
 * garde des RPC) — ZÉRO écriture directe dans courier_returns/courier_product_debts
 * pour rester fidèle au chemin réel et ne rien doublonner.
 *   - declared        → declare_courier_return(order, courier)
 *   - confirmed_depot  → declare_courier_return(...) PUIS confirm_return_depot(order)
 *   - lost             → declare_courier_return(...) PUIS mark_return_lost(order, 150, 1)
 *     (crée automatiquement une ligne courier_product_debts reason='perte')
 * mark_return_lost REFUSE si orders.status='delivered' → ces 3 commandes restent
 * 'confirmed' (pas 'delivered').
 *
 * Usage :
 *   node scripts/seed-lotd-captures-local.mjs --seed
 *
 * Idempotent : ré-exécuté, retrouve les entités par email (users) / notes taguées
 * (orders) / name (couriers) — ne duplique rien ; réaligne courier_id/status.
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/lotd-captures-seed-ids.json',
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

const ADMIN_EMAIL = 'lotdadmin-cap@test.local'
const AFFILIATE_EMAIL = 'lotdaffiliate-cap@test.local'
const TEST_PWD = 'LotDCapture2026!'
const TAG = 'LOTD_CAPTURE_SEED'
const COURIER_NAME = 'Karim Transport'

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
  const existing = await rest('GET', `/rest/v1/products?name=eq.${encodeURIComponent('Produit Capture Lot D')}&select=id`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    console.log(`[SEED] Produit déjà existant (id=${existing.body[0].id})`)
    return existing.body[0].id
  }
  const r = await rest('POST', '/rest/v1/products', {
    name: 'Produit Capture Lot D',
    description: 'Produit de test automatisé pour captures tournées/retours livreur',
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
    category: 'Test Lot D Captures',
    subcategory: 'Test',
  }, 'return=representation')
  if (!Array.isArray(r.body) || !r.body[0]?.id) {
    throw new Error(`Création produit échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`[SEED] Produit créé (id=${r.body[0].id})`)
  return r.body[0].id
}

async function ensureCourier() {
  const existing = await rest('GET', `/rest/v1/couriers?name=eq.${encodeURIComponent(COURIER_NAME)}&select=id,access_code,status`)
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    const id = existing.body[0].id
    if (existing.body[0].status !== 'active') {
      await rest('PATCH', `/rest/v1/couriers?id=eq.${id}`, { status: 'active' }, 'return=minimal')
    }
    console.log(`[SEED] Livreur ${COURIER_NAME} déjà existant (id=${id})`)
    return id
  }
  const r = await rest('POST', '/rest/v1/couriers', {
    name: COURIER_NAME,
    courier_type: 'personal',
    phone: '0661998833',
    notes: 'Livreur de test — captures tournées/retours (Lot D).',
    status: 'active',
    balance_cap_mad: 3000.0,
    access_code: generateAccessCode(),
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

// ── Tournée (courier_tours / courier_tour_orders — écriture directe service_role,
// pas de RPC dédiée pour la création côté seed ; identique au chemin createTour) ──
async function ensureTour(courierId, orderIds) {
  const today = new Date().toISOString().slice(0, 10)
  const existing = await rest('GET', `/rest/v1/courier_tours?courier_id=eq.${courierId}&tour_date=eq.${today}&select=id,status`)
  let tourId
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    tourId = existing.body[0].id
    if (existing.body[0].status !== 'dispatched') {
      await rest('PATCH', `/rest/v1/courier_tours?id=eq.${tourId}`, { status: 'dispatched' }, 'return=minimal')
    }
    console.log(`[SEED] Tournée du ${today} déjà existante (id=${tourId})`)
  } else {
    const r = await rest('POST', '/rest/v1/courier_tours', {
      courier_id: courierId,
      tour_date: today,
      status: 'dispatched',
    }, 'return=representation')
    if (!Array.isArray(r.body) || !r.body[0]?.id) {
      throw new Error(`Création tournée échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    }
    tourId = r.body[0].id
    console.log(`[SEED] Tournée du ${today} créée (id=${tourId}, status=dispatched)`)
  }

  for (const orderId of orderIds) {
    const link = await rest('GET', `/rest/v1/courier_tour_orders?order_id=eq.${orderId}&select=id`)
    if (Array.isArray(link.body) && link.body[0]?.id) continue
    const r = await rest('POST', '/rest/v1/courier_tour_orders', { tour_id: tourId, order_id: orderId }, 'return=minimal')
    if (r.status >= 300) {
      throw new Error(`Lien tournée↔commande échoué : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    }
  }
  console.log(`[SEED] ${orderIds.length} commande(s) liée(s) à la tournée ${tourId}`)
  return tourId
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

  if (targetState === 'lost') {
    const l = await rpc('mark_return_lost', { p_order_id: orderId, p_amount_mad: 150.0, p_quantity: 1 })
    if (l.status >= 300) {
      throw new Error(`mark_return_lost échoué (${orderId}) : HTTP ${l.status} ${JSON.stringify(l.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Retour marqué PERTE pour commande ${orderId} (créance produit 150 MAD, reason=perte)`)
    return
  }

  throw new Error(`État de retour cible inconnu : ${targetState}`)
}

// ── Données ────────────────────────────────────────────────────────────────────
// 3 commandes de tournée (dispatched aujourd'hui).
const TOUR_ORDERS = [
  { tag: `${TAG}_TOUR_1`, city: 'Casablanca', total: 250.0, commission: 45.0, quantity: 1, name: 'Amina Alaoui', phone: '0661112301', status: 'confirmed' },
  { tag: `${TAG}_TOUR_2`, city: 'Rabat', total: 380.0, commission: 65.0, quantity: 1, name: 'Karim Bennani', phone: '0661112302', status: 'confirmed' },
  { tag: `${TAG}_TOUR_3`, city: 'Casablanca', total: 500.0, commission: 80.0, quantity: 1, name: 'Nadia Fassi', phone: '0661112303', status: 'confirmed' },
]

// 3 commandes retours (3 états distincts). Statut 'confirmed' (PAS 'delivered' :
// mark_return_lost REFUSE une commande delivered — cf. mig 128 §4.5).
const RETURN_ORDERS = {
  declared: { tag: `${TAG}_RETURN_DECLARED`, city: 'Rabat', total: 300.0, commission: 50.0, quantity: 1, name: 'Hicham Idrissi', phone: '0661112304', status: 'confirmed' },
  confirmed_depot: { tag: `${TAG}_RETURN_CONFIRMED`, city: 'Rabat', total: 420.0, commission: 70.0, quantity: 1, name: 'Salma Chraibi', phone: '0661112305', status: 'confirmed' },
  lost: { tag: `${TAG}_RETURN_LOST`, city: 'Marrakech', total: 350.0, commission: 55.0, quantity: 1, name: 'Youssef Naciri', phone: '0661112306', status: 'confirmed' },
}

async function seed() {
  console.log('\n[SEED] Démarrage seed tournées + retours livreur (captures FR/AR) — LOCAL UNIQUEMENT\n')

  const adminId = await ensureUser(ADMIN_EMAIL, 'admin', 'Admin Capture Lot D')
  const affiliateId = await ensureUser(AFFILIATE_EMAIL, 'affiliate', 'Affilié Capture Lot D')
  const productId = await ensureProduct()
  const courierId = await ensureCourier()

  // Commandes de tournée.
  const tourOrderIds = []
  for (const spec of TOUR_ORDERS) tourOrderIds.push(await ensureOrder(spec, affiliateId, productId, courierId))
  const tourId = await ensureTour(courierId, tourOrderIds)

  // Commandes retours + machine à états (RPC officielles).
  const returnOrderIds = {}
  for (const [state, spec] of Object.entries(RETURN_ORDERS)) {
    const id = await ensureOrder(spec, affiliateId, productId, courierId)
    returnOrderIds[state] = id
    await ensureReturnState(id, courierId, state)
  }

  const seedData = {
    adminId,
    adminEmail: ADMIN_EMAIL,
    adminPassword: TEST_PWD,
    affiliateId,
    productId,
    courierId,
    tourId,
    tourOrderIds,
    returnOrderIds,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Admin   : ${ADMIN_EMAIL} / ${TEST_PWD}`)
  console.log(`  Livreur : ${COURIER_NAME} (id=${courierId})`)
  console.log(`  Tournée dispatched aujourd'hui (id=${tourId}) — 3 commandes liées`)
  console.log(`  Retours : declared / confirmed_depot / lost (créance produit 150 MAD)`)
  console.log(`  Fiche à capturer : /admin/couriers/${courierId}`)
  console.log(`  Scan ramassage à capturer : /admin/couriers/pickup`)
  console.log('\n[SEED] FAIT.\n')
}

const mode = process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed'); process.exit(1) }
seed().catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
