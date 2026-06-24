#!/usr/bin/env node
/**
 * Test runtime WMS-1 migration 095 — taxonomie raisons + anomalies + socle Gardien
 *
 * Couvre les scénarios demandés (a..f) :
 *   a) Vente sans stock → la commande passe, mouvement tracé (reason métier + channel),
 *      record_anomaly déclenche une stock_anomalies 'oversell' + notification admin.
 *   b) adjust_stock_manual par un staff manage_stock, raison 'cadeau' → mouvement
 *      reason=cadeau, actor = auth.uid() (p_actor falsifié ignoré).
 *   c) adjust_stock_manual raison 'casse' → mouvement reason=casse.
 *   d) adjust_stock_manual par un user SANS manage_stock → refusé (errors.forbidden).
 *   e) Seuil casse anormale (>= 20 sur 24h) → anomalie 'abnormal_loss' + notif admin.
 *   f) RLS stock_anomalies : admin/manage_stock lisent, user lambda ne lit rien,
 *      INSERT direct refusé, record_anomaly non appelable (REVOKE authenticated).
 *
 * Usage (le wrapper run-wms1-095-tests.sh injecte les vars depuis `supabase status`) :
 *   LOCAL_SUPABASE_URL=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_ANON_KEY=... \
 *   node scripts/test-wms1-095-runtime.mjs
 *
 * RÈGLE ABSOLUE : aucune clé/secret n'est écrit en dur. Tout vient de process.env.
 */

// ── Lecture des clés depuis l'environnement (JAMAIS en dur) ──────────────────
import { assertLocalSupabase } from './lib/assert-local-supabase.mjs'

const BASE_URL = process.env.LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.LOCAL_SERVICE_ROLE_KEY
const ANON_KEY = process.env.LOCAL_ANON_KEY

if (!BASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('ERREUR: LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, LOCAL_ANON_KEY requis.')
  console.error('Utilisez le wrapper: ./scripts/run-wms1-095-tests.sh')
  process.exit(1)
}

// GARDE-FOU : ce script ÉCRIT en base — il REFUSE de tourner ailleurs qu'en local.
assertLocalSupabase(BASE_URL, 'test-wms1-095-runtime')

const TEST_PASSWORD = 'TestPassword123!'

// ── Helpers HTTP ─────────────────────────────────────────────────────────────

function headers(apikey, bearer) {
  return {
    apikey,
    Authorization: `Bearer ${bearer ?? apikey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

// Appel REST en service_role (bypass RLS) par défaut, ou en tant qu'utilisateur (token).
async function rest(method, path, body, { token } = {}) {
  const apikey = token ? ANON_KEY : SERVICE_KEY
  const opts = { method, headers: headers(apikey, token ?? SERVICE_KEY) }
  if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE_URL}/rest/v1${path}`, opts)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function rpc(fn, params, { token } = {}) {
  const apikey = token ? ANON_KEY : SERVICE_KEY
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(apikey, token ?? SERVICE_KEY),
    body: JSON.stringify(params),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function signIn(email) {
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`signIn KO (${email}): ${JSON.stringify(data)}`)
  return data.access_token
}

// ── État / reporting ──────────────────────────────────────────────────────────

const results = []
function pass(name, detail = '') {
  console.log(`\n✅ PASS [${name}]${detail ? ' — ' + detail : ''}`)
  results.push({ name, verdict: 'PASS', detail })
}
function fail(name, detail) {
  console.error(`\n❌ FAIL [${name}] — ${detail}`)
  results.push({ name, verdict: 'FAIL', detail })
}
function check(name, cond, detail) {
  if (cond) pass(name, detail)
  else fail(name, detail)
  return cond
}

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function createAuthUser(role) {
  const email = `wms1-095-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`
  const res = await fetch(`${BASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`auth user KO: ${JSON.stringify(data)}`)
  const existing = await rest('GET', `/profiles?id=eq.${data.id}&select=id`)
  if (!existing.data?.length) {
    const prof = await rest('POST', '/profiles', { id: data.id, role, full_name: `WMS1 095 ${role}`, status: 'approved' })
    if (prof.status >= 400) throw new Error(`profile KO: ${JSON.stringify(prof.data)}`)
  } else {
    await rest('PATCH', `/profiles?id=eq.${data.id}`, { role, status: 'approved' })
  }
  console.log(`  [setup] ${role} créé: ${data.id} (${email})`)
  return { id: data.id, email }
}

async function grantManageStock(userId) {
  const res = await rest('POST', '/staff_permissions', { user_id: userId, capability: 'manage_stock' })
  if (res.status >= 400 && !JSON.stringify(res.data).includes('duplicate')) {
    throw new Error(`grant manage_stock KO: ${JSON.stringify(res.data)}`)
  }
  console.log(`  [setup] manage_stock accordé à ${userId}`)
}

async function createProduct(stockCount) {
  const res = await rest('POST', '/products', {
    name: `WMS1-095-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sell_price: 100, commission_amount: 10, stock_count: stockCount, images: [], active: true,
  })
  if (res.status >= 400) throw new Error(`produit KO: ${JSON.stringify(res.data)}`)
  const p = Array.isArray(res.data) ? res.data[0] : res.data
  console.log(`  [setup] produit ${p.id} stock=${stockCount}`)
  return p.id
}

async function getStock(productId) {
  const r = await rest('GET', `/products?id=eq.${productId}&select=stock_count`)
  return r.data[0]?.stock_count
}
async function getMovements(productId) {
  const r = await rest('GET', `/stock_movements?product_id=eq.${productId}&order=created_at.asc`)
  return r.data
}
async function getAnomalies({ type, productId, actorId } = {}) {
  let path = `/stock_anomalies?order=created_at.desc`
  if (type) path += `&anomaly_type=eq.${type}`
  if (productId) path += `&product_id=eq.${productId}`
  if (actorId) path += `&actor_id=eq.${actorId}`
  const r = await rest('GET', path)
  return Array.isArray(r.data) ? r.data : []
}
async function getAnomalyNotifs() {
  const r = await rest('GET', `/notifications?event=eq.stock_anomaly&order=created_at.desc`)
  return Array.isArray(r.data) ? r.data : []
}

// ── Scénarios ─────────────────────────────────────────────────────────────────

// a) Vente sans stock : never-refuse + reason métier + anomalie oversell + notif admin
async function scenarioA(adminId) {
  console.log('\n=== a) Vente sans stock → never-refuse + oversell tracé + notif ===')
  const productId = await createProduct(2)
  const orderId = '00000000-0000-0000-0000-0000000000aa'
  const r = await rpc('reserve_stock', {
    p_product_id: productId, p_qty: 5, p_channel: 'affiliate',
    p_order_id: orderId, p_order_type: 'affiliate', p_actor: adminId,
  })
  console.log(`  reserve_stock(stock=2, qty=5, affiliate) → status=${r.status} retour=${JSON.stringify(r.data)}`)

  check('a-never-refuse', r.status === 200 && r.data === -3, `retour attendu=-3 observé=${JSON.stringify(r.data)}`)
  const stock = await getStock(productId)
  check('a-stock-negatif', stock === -3, `stock_count attendu=-3 observé=${stock}`)

  const mvts = await getMovements(productId)
  const m = mvts[0]
  check('a-1-mouvement', mvts.length === 1, `nb mvts=${mvts.length}`)
  check('a-reason-metier', m?.reason === 'vente_affilie', `reason attendu=vente_affilie observé=${m?.reason}`)
  check('a-channel', m?.channel === 'affiliate', `channel=${m?.channel}`)
  check('a-qty_delta', m?.qty_delta === -5, `qty_delta attendu=-5 observé=${m?.qty_delta}`)
  check('a-balance_after', m?.balance_after === -3, `balance_after=${m?.balance_after}`)

  const anomalies = await getAnomalies({ type: 'oversell', productId })
  const an = anomalies[0]
  check('a-anomalie-oversell', anomalies.length === 1, `nb anomalies oversell=${anomalies.length}`)
  check('a-anomalie-channel', an?.channel === 'affiliate', `channel=${an?.channel}`)
  check('a-anomalie-qty', an?.qty === 5, `qty=${an?.qty}`)
  check('a-anomalie-stock_before', an?.stock_before === 2, `stock_before=${an?.stock_before}`)
  check('a-anomalie-shortfall', an?.shortfall === 3, `shortfall attendu=3 observé=${an?.shortfall}`)

  const notifs = await getAnomalyNotifs()
  const notifForAdmin = notifs.filter(n => n.recipient_id === adminId && n.payload?.product_id === productId)
  check('a-notif-admin', notifForAdmin.length >= 1, `notifs stock_anomaly admin=${notifForAdmin.length}`)
  check('a-notif-order_id-null', notifForAdmin[0]?.order_id === null, `order_id colonne=${notifForAdmin[0]?.order_id} (doit être NULL)`)
  check('a-notif-payload-type', notifForAdmin[0]?.payload?.anomaly_type === 'oversell',
    `payload.anomaly_type=${notifForAdmin[0]?.payload?.anomaly_type}`)
  return productId
}

// b) cadeau par staff manage_stock + actor non falsifiable
async function scenarioB(staff, adminId) {
  console.log('\n=== b) adjust_stock_manual cadeau (staff) + actor non falsifiable ===')
  const productId = await createProduct(10)
  const token = await signIn(staff.email)
  // p_actor falsifié = adminId : doit être IGNORÉ (acteur réel = staff via auth.uid()).
  const r = await rpc('adjust_stock_manual', {
    p_product_id: productId, p_qty_delta: -1, p_actor: adminId, p_note: 'cadeau client VIP', p_reason: 'cadeau',
  }, { token })
  console.log(`  adjust(cadeau, -1) staff → status=${r.status} retour=${JSON.stringify(r.data)}`)
  check('b-retour', r.status === 200 && r.data === 9, `nouveau solde attendu=9 observé=${JSON.stringify(r.data)}`)

  const mvts = await getMovements(productId)
  const m = mvts.find(x => x.reason === 'cadeau')
  check('b-reason-cadeau', !!m, `mouvement reason=cadeau présent=${!!m}`)
  check('b-channel-manual', m?.channel === 'manual_adjust', `channel=${m?.channel}`)
  check('b-actor-non-falsifiable', m?.actor_id === staff.id && m?.actor_id !== adminId,
    `actor attendu=staff(${staff.id}) observé=${m?.actor_id} (p_actor falsifié=${adminId} ignoré)`)
  check('b-note', m?.note === 'cadeau client VIP', `note=${m?.note}`)
  return productId
}

// c) casse par staff
async function scenarioC(staff) {
  console.log('\n=== c) adjust_stock_manual casse (staff) ===')
  const productId = await createProduct(10)
  const token = await signIn(staff.email)
  const r = await rpc('adjust_stock_manual', {
    p_product_id: productId, p_qty_delta: -1, p_note: 'unité cassée', p_reason: 'casse',
  }, { token })
  console.log(`  adjust(casse, -1) staff → status=${r.status} retour=${JSON.stringify(r.data)}`)
  check('c-retour', r.status === 200 && r.data === 9, `solde attendu=9 observé=${JSON.stringify(r.data)}`)
  const mvts = await getMovements(productId)
  const m = mvts.find(x => x.reason === 'casse')
  check('c-reason-casse', !!m, `mouvement reason=casse présent=${!!m}`)
  check('c-actor', m?.actor_id === staff.id, `actor=${m?.actor_id}`)
  return productId
}

// d) refus si pas manage_stock
async function scenarioD(regular) {
  console.log('\n=== d) adjust_stock_manual SANS manage_stock → refusé ===')
  const productId = await createProduct(10)
  const token = await signIn(regular.email)
  const r = await rpc('adjust_stock_manual', {
    p_product_id: productId, p_qty_delta: -1, p_reason: 'cadeau',
  }, { token })
  console.log(`  adjust user lambda → status=${r.status} retour=${JSON.stringify(r.data)}`)
  const blocked = r.status >= 400 && JSON.stringify(r.data).includes('errors.forbidden')
  check('d-refus-forbidden', blocked, `attendu erreur errors.forbidden, observé status=${r.status} ${JSON.stringify(r.data)}`)
  const stock = await getStock(productId)
  check('d-stock-inchange', stock === 10, `stock doit rester 10, observé=${stock}`)
}

// e) seuil casse anormale (>= 20 sur 24h) → abnormal_loss
async function scenarioE(staff) {
  console.log('\n=== e) Seuil casse anormale (>= 20u / 24h) → anomalie abnormal_loss ===')
  const productId = await createProduct(50)
  const token = await signIn(staff.email)
  // Une grosse casse de 20 unités → avec les casses précédentes (test c) la somme 24h dépasse 20.
  const r = await rpc('adjust_stock_manual', {
    p_product_id: productId, p_qty_delta: -20, p_note: 'casse lot endommagé', p_reason: 'casse',
  }, { token })
  console.log(`  adjust(casse, -20) staff → status=${r.status} retour=${JSON.stringify(r.data)}`)
  check('e-ajustement-ok', r.status === 200, `status=${r.status}`)

  const anomalies = await getAnomalies({ type: 'abnormal_loss', actorId: staff.id })
  const an = anomalies[0]
  check('e-anomalie-abnormal_loss', anomalies.length >= 1, `nb anomalies abnormal_loss=${anomalies.length}`)
  check('e-anomalie-window>=20', (an?.detail?.window_24h_qty ?? 0) >= 20,
    `window_24h_qty=${an?.detail?.window_24h_qty} (seuil=20)`)
  check('e-anomalie-actor', an?.actor_id === staff.id, `actor=${an?.actor_id}`)

  const notifs = await getAnomalyNotifs()
  const n = notifs.filter(x => x.payload?.anomaly_type === 'abnormal_loss' && x.payload?.actor_id === staff.id)
  check('e-notif-abnormal_loss', n.length >= 1, `notifs abnormal_loss=${n.length}`)
}

// f) RLS stock_anomalies : isolation lecture + écriture impossible
async function scenarioF(admin, staff, regular) {
  console.log('\n=== f) RLS stock_anomalies (lecture isolée + écriture impossible) ===')
  const adminTok = await signIn(admin.email)
  const staffTok = await signIn(staff.email)
  const regTok = await signIn(regular.email)

  const asAdmin = await rest('GET', '/stock_anomalies?select=id', null, { token: adminTok })
  check('f-admin-lit', asAdmin.status === 200 && Array.isArray(asAdmin.data) && asAdmin.data.length > 0,
    `admin lit ${Array.isArray(asAdmin.data) ? asAdmin.data.length : '?'} lignes`)

  const asStaff = await rest('GET', '/stock_anomalies?select=id', null, { token: staffTok })
  check('f-staff-manage_stock-lit', asStaff.status === 200 && Array.isArray(asStaff.data) && asStaff.data.length > 0,
    `staff(manage_stock) lit ${Array.isArray(asStaff.data) ? asStaff.data.length : '?'} lignes`)

  const asReg = await rest('GET', '/stock_anomalies?select=id', null, { token: regTok })
  check('f-user-lambda-rien', asReg.status === 200 && Array.isArray(asReg.data) && asReg.data.length === 0,
    `user lambda lit ${Array.isArray(asReg.data) ? asReg.data.length : JSON.stringify(asReg.data)} lignes (doit=0 par RLS)`)

  // Écriture directe interdite (aucune policy INSERT).
  const insAttempt = await rest('POST', '/stock_anomalies',
    { anomaly_type: 'oversell', detail: {} }, { token: staffTok })
  check('f-insert-direct-refuse', insAttempt.status >= 400,
    `INSERT direct doit échouer, observé status=${insAttempt.status} ${JSON.stringify(insAttempt.data).slice(0, 120)}`)

  // record_anomaly non appelable (REVOKE authenticated).
  const rpcAttempt = await rpc('record_anomaly',
    { p_type: 'oversell', p_product_id: null }, { token: staffTok })
  check('f-record_anomaly-revoke', rpcAttempt.status >= 400,
    `record_anomaly via JWT doit échouer (REVOKE), observé status=${rpcAttempt.status} ${JSON.stringify(rpcAttempt.data).slice(0, 120)}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================')
  console.log('  TEST RUNTIME WMS-1 — MIGRATION 095')
  console.log('========================================')
  console.log(`  URL: ${BASE_URL}`)

  const admin = await createAuthUser('admin')
  const staff = await createAuthUser('agent')   // staff interne
  await grantManageStock(staff.id)
  const regular = await createAuthUser('affiliate')  // user lambda sans capacité

  try {
    await scenarioA(admin.id)
    await scenarioB(staff, admin.id)
    await scenarioC(staff)
    await scenarioD(regular)
    await scenarioE(staff)
    await scenarioF(admin, staff, regular)
  } catch (e) {
    fail('exception', e.message)
    console.error(e)
  }

  // ── Rapport ──
  console.log('\n\n========================================')
  console.log('  RÉCAPITULATIF')
  console.log('========================================')
  const passed = results.filter(r => r.verdict === 'PASS').length
  const failed = results.filter(r => r.verdict === 'FAIL').length
  for (const r of results) {
    console.log(`  ${r.verdict === 'PASS' ? '✅' : '❌'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  }
  console.log(`\n  TOTAL: ${passed} PASS / ${failed} FAIL (sur ${results.length})`)
  console.log('  Note: DB locale jetable (cold reset) — pas de cleanup des ledgers append-only.')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
