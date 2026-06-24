#!/usr/bin/env node
/**
 * Test runtime migration 100 — scan_events + record_scan
 *
 * SCÉNARIOS :
 *   1. Setup : staff manage_stock + produit P1 (stock=10) + variante défaut auto (trigger 099)
 *   2. inbound_reception : +4 via JWT staff → uuid retourné, double-écriture, 1 scan_events,
 *      ledger note=scan:inbound_reception, projection qty_at_warehouse+4
 *   3. Seed return_expected : INSERT psql mouvement reserved→return_expected qty=3 ;
 *      vérif projection qty_return_expected=3
 *   4. return_received sellable : +3 via JWT → uuid ; products+3, variant+3 ;
 *      ledger return_expected→at_warehouse ; projection return_expected-3, at_warehouse+3
 *   5. return_received damaged : seed return_expected qty=2 puis scan → products INCHANGÉ ;
 *      ledger return_expected→damaged ; projection damaged+2, return_expected-2
 *   6. Double-scan idempotence : ré-appelle exactement le scan #4 → NULL + aucun effet
 *   7. Gate manage_stock : user affiliate sans capacité → errors.forbidden (aucun effet)
 *   8. Append-only : UPDATE et DELETE sur scan_events (psql/service_role) → EXCEPTION
 *
 * RÈGLE ABSOLUE : aucune clé/secret en dur — tout vient de process.env.
 * GARDE-FOU : assertLocalSupabase() refuse si l'URL n'est pas 127.0.0.1.
 */

import { assertLocalSupabase } from './lib/assert-local-supabase.mjs'
import { execSync } from 'child_process'

// ── Lecture des clés depuis l'environnement (JAMAIS en dur) ──────────────────
const BASE_URL    = process.env.LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.LOCAL_SERVICE_ROLE_KEY
const ANON_KEY    = process.env.LOCAL_ANON_KEY

if (!BASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('ERREUR: LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, LOCAL_ANON_KEY requis.')
  console.error('Utilisez le wrapper: ./scripts/run-variants-100-tests.sh')
  process.exit(1)
}

// GARDE-FOU : ce script ÉCRIT en base — il REFUSE de tourner ailleurs qu'en local.
assertLocalSupabase(BASE_URL, 'test-variants-100-runtime')

const TEST_PASSWORD = 'TestPass100!'
const TAG = `v100-${Date.now()}`
const DOCKER_CONTAINER = 'supabase_db_affiliate-platform'

// ── Helpers psql ─────────────────────────────────────────────────────────────

function psql(sql) {
  // Escape single quotes inside the SQL for shell safety
  const escaped = sql.replace(/'/g, `'\\''`)
  const cmd = `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -t -A -c '${escaped}'`
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 15000 })
    return { ok: true, output: out.trim() }
  } catch (e) {
    return { ok: false, error: e.stderr ?? e.message ?? String(e) }
  }
}

function psqlJSON(sql) {
  const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t`
  const r = psql(wrapped)
  if (!r.ok) return { ok: false, error: r.error }
  try {
    return { ok: true, data: JSON.parse(r.output || '[]') }
  } catch (e) {
    return { ok: false, error: `parse JSON KO: ${r.output}` }
  }
}

// ── Helpers HTTP ─────────────────────────────────────────────────────────────

async function rest(method, path, body, { token } = {}) {
  const apikey = token ? ANON_KEY : SERVICE_KEY
  const bearer = token ?? SERVICE_KEY
  const opts = {
    method,
    headers: {
      apikey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  }
  if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE_URL}/rest/v1${path}`, opts)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function rpc(fnName, args, { token } = {}) {
  const apikey = token ? ANON_KEY : SERVICE_KEY
  const bearer = token ?? SERVICE_KEY
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
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

async function createAuthUser(roleName, label) {
  const email = `${TAG}-${label}@test.local`
  const res = await fetch(`${BASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`auth user KO (${label}): ${JSON.stringify(data)}`)

  const existing = await rest('GET', `/profiles?id=eq.${data.id}&select=id`)
  if (!existing.data?.length) {
    const prof = await rest('POST', '/profiles', {
      id: data.id,
      role: roleName,
      full_name: `100 ${label}`,
      status: 'approved',
    })
    if (prof.status >= 400) throw new Error(`profile KO (${label}): ${JSON.stringify(prof.data)}`)
  } else {
    await rest('PATCH', `/profiles?id=eq.${data.id}`, { role: roleName, status: 'approved' })
  }
  console.log(`  [setup] ${label} créé: ${data.id} (${email})`)
  return { id: data.id, email }
}

async function grantManageStock(userId) {
  const r = await rest('POST', '/staff_permissions', {
    user_id: userId,
    capability: 'manage_stock',
  })
  if (r.status >= 400 && !JSON.stringify(r.data).includes('duplicate')) {
    throw new Error(`grant manage_stock KO: ${JSON.stringify(r.data)}`)
  }
  console.log(`  [setup] manage_stock accordé à ${userId}`)
}

// ── État / reporting ──────────────────────────────────────────────────────────

const results = []
function pass(name, detail = '') {
  console.log(`  PASS [${name}]${detail ? ' — ' + detail : ''}`)
  results.push({ name, verdict: 'PASS', detail })
}
function fail(name, detail) {
  console.error(`  FAIL [${name}] — ${detail}`)
  results.push({ name, verdict: 'FAIL', detail })
}
function check(name, cond, detail) {
  if (cond) pass(name, detail)
  else fail(name, detail)
  return cond
}

// ── Scénario 1 : Setup ────────────────────────────────────────────────────────

async function scenario1_setup() {
  console.log('\n=== 1. Setup : staff manage_stock + produit P1 (stock=10) ===')

  // Créer staff agent avec manage_stock
  const staff = await createAuthUser('agent', 'staff-100')
  await grantManageStock(staff.id)
  const staffToken = await signIn(staff.email)
  pass('1-staff-cree', `id=${staff.id}`)

  // Créer affiliate sans manage_stock
  const affiliate = await createAuthUser('affiliate', 'affiliate-100')
  const affiliateToken = await signIn(affiliate.email)
  pass('1-affiliate-cree', `id=${affiliate.id}`)

  // Créer produit P1 (stock=10) via service_role REST
  const r = await rest('POST', '/products', {
    name: `${TAG}-P1`,
    sell_price: 3000,
    commission_amount: 300,
    stock_count: 10,
    images: [],
    active: true,
  })
  if (r.status >= 400) {
    fail('1-insert-produit', `status=${r.status} ${JSON.stringify(r.data)}`)
    return null
  }
  const p = Array.isArray(r.data) ? r.data[0] : r.data
  const productId = p.id
  pass('1-insert-produit', `id=${productId}`)

  // Variante défaut créée par trigger 099
  const vR = psqlJSON(`
    SELECT id, stock_count, is_default
    FROM public.product_variants
    WHERE product_id = '${productId}' AND is_default
  `)
  if (!vR.ok) { fail('1-variante-defaut', vR.error); return null }
  const v = vR.data[0]
  console.log(`  variante défaut: ${JSON.stringify(v)}`)
  if (!check('1-variante-defaut-existe', !!v, `is_default non trouvée pour ${productId}`)) return null
  check('1-variante-stock-10', v.stock_count === 10, `stock_count attendu=10 observé=${v.stock_count}`)
  const variantId = v.id

  return { productId, variantId, staffToken, affiliateToken }
}

// ── Scénario 2 : inbound_reception ───────────────────────────────────────────

async function scenario2_inboundReception(ctx) {
  console.log('\n=== 2. inbound_reception : +4 via JWT staff ===')
  const { productId, variantId, staffToken } = ctx

  // Soldes avant
  const pBefore = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const vBefore = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const pStock0 = pBefore.data?.[0]?.stock_count ?? null
  const vStock0 = vBefore.data?.[0]?.stock_count ?? null
  console.log(`  avant scan: products=${pStock0} variant=${vStock0}`)

  // Appel record_scan via JWT staff
  const r = await rpc('record_scan', {
    p_scan_type:    'inbound_reception',
    p_scanned_qty:  4,
    p_product_id:   productId,
    p_variant_id:   null,
    p_order_id:     null,
    p_order_type:   null,
    p_carrier_name: 'TransX',
    p_tracking_ref: 'TRK-IN-1',
    p_condition:    null,
  }, { token: staffToken })

  console.log(`  record_scan → status=${r.status} data=${JSON.stringify(r.data)}`)

  // 2a. Retour = uuid valide
  const scanId = r.data
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  check('2a-retour-uuid', r.status === 200 && typeof scanId === 'string' && uuidRx.test(scanId),
    `attendu=uuid observé=${JSON.stringify(scanId)} status=${r.status}`)

  // 2b. products.stock_count = 14
  const pR = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  if (!pR.ok) { fail('2b-products', pR.error); return }
  const pStock = pR.data[0]?.stock_count
  check('2b-products-stock-14', pStock === (pStock0 + 4),
    `products.stock_count attendu=${pStock0 + 4} observé=${pStock}`)

  // 2c. variant défaut stock_count = 14 (double-écriture)
  const vR = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  if (!vR.ok) { fail('2c-variant', vR.error); return }
  const vStock = vR.data[0]?.stock_count
  check('2c-variant-stock-14', vStock === (vStock0 + 4),
    `variant.stock_count attendu=${vStock0 + 4} observé=${vStock}`)

  // 2d. Double-écriture égale
  check('2d-double-ecriture-egalite', pStock === vStock,
    `products=${pStock} != variant=${vStock}`)

  // 2e. 1 ligne dans scan_events avec scan_id
  const seR = psqlJSON(`
    SELECT id, scan_type, carrier_tracking_ref, scanned_qty
    FROM public.scan_events
    WHERE id = '${scanId}'
  `)
  if (!seR.ok) { fail('2e-scan-events', seR.error); return }
  const se = seR.data[0]
  console.log(`  scan_events: ${JSON.stringify(se)}`)
  check('2e-scan-events-existe', !!se, `scan_events ligne absente pour ${scanId}`)
  check('2e-scan-type-inbound', se?.scan_type === 'inbound_reception',
    `scan_type attendu=inbound_reception observé=${se?.scan_type}`)
  check('2e-scan-qty-4', se?.scanned_qty === 4, `scanned_qty attendu=4 observé=${se?.scanned_qty}`)

  // 2f. Ledger : note='scan:inbound_reception', to_status='at_warehouse'
  const mR = psqlJSON(`
    SELECT qty_delta, to_status, from_status, channel, reason, note, variant_id
    FROM public.stock_movements
    WHERE product_id = '${productId}' AND note = 'scan:inbound_reception'
    ORDER BY created_at DESC LIMIT 1
  `)
  if (!mR.ok) { fail('2f-ledger', mR.error); return }
  const m = mR.data[0]
  console.log(`  ledger: ${JSON.stringify(m)}`)
  check('2f-ledger-existe', !!m, 'mouvement scan:inbound_reception absent dans stock_movements')
  check('2f-ledger-to-at-warehouse', m?.to_status === 'at_warehouse',
    `to_status attendu=at_warehouse observé=${m?.to_status}`)
  check('2f-ledger-qty-4', m?.qty_delta === 4, `qty_delta attendu=4 observé=${m?.qty_delta}`)
  check('2f-ledger-variant-set', m?.variant_id === variantId,
    `variant_id attendu=${variantId} observé=${m?.variant_id}`)

  // 2g. Projection qty_at_warehouse doit avoir augmenté de 4
  // La projection est calculée depuis le ledger (vue variant_status_balance)
  const projR = psqlJSON(`
    SELECT qty_at_warehouse, qty_return_expected, qty_damaged
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  if (!projR.ok) { fail('2g-projection', projR.error); return }
  const proj = projR.data[0]
  console.log(`  projection: ${JSON.stringify(proj)}`)
  // Après opening_balance(10) + inbound(4) : qty_at_warehouse = 14
  check('2g-proj-at-warehouse-14', Number(proj?.qty_at_warehouse) === 14,
    `qty_at_warehouse attendu=14 observé=${proj?.qty_at_warehouse}`)
}

// ── Scénario 3 : Seed return_expected (qty=3) ─────────────────────────────────

async function scenario3_seedReturnExpected(ctx) {
  console.log('\n=== 3. Seed return_expected : INSERT psql mouvement reserved→return_expected qty=3 ===')
  const { productId, variantId } = ctx

  // Insérer directement un mouvement reserved→return_expected qty=3 via psql
  // (simulation d'une annulation qui marque le stock en retour attendu)
  // On utilise reason='retour' (valide), channel='affiliate', from=reserved, to=return_expected
  const ins = psql(`
    INSERT INTO public.stock_movements
      (product_id, variant_id, channel, qty_delta, reason, order_type, balance_after, from_status, to_status, note)
    VALUES
      ('${productId}', '${variantId}', 'affiliate', 3, 'retour', 'affiliate', 0, 'reserved', 'return_expected', 'seed:return_expected')
    RETURNING id
  `)
  if (!ins.ok) { fail('3-seed-insert', ins.error); return false }
  const movId = ins.output.match(/([0-9a-f-]{36})/)?.[1]
  pass('3-seed-mouvement-insere', `id=${movId}`)

  // Vérif projection qty_return_expected=3
  const projR = psqlJSON(`
    SELECT qty_return_expected, qty_at_warehouse
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  if (!projR.ok) { fail('3-proj-return-expected', projR.error); return false }
  const proj = projR.data[0]
  console.log(`  projection après seed: ${JSON.stringify(proj)}`)
  check('3-proj-return-expected-3', Number(proj?.qty_return_expected) === 3,
    `qty_return_expected attendu=3 observé=${proj?.qty_return_expected}`)

  return true
}

// ── Scénario 4 : return_received sellable ────────────────────────────────────

async function scenario4_returnSellable(ctx) {
  console.log('\n=== 4. return_received sellable : +3 — revient vendable ===')
  const { productId, variantId, staffToken } = ctx

  // Générer un ORDER_UUID pour cet ordre de retour
  const orderUuid = execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -t -A -c "SELECT gen_random_uuid()"`,
    { encoding: 'utf8', timeout: 10000 }
  ).trim()

  // Soldes avant
  const pBefore = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const vBefore = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const projBefore = psqlJSON(`
    SELECT qty_at_warehouse, qty_return_expected
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  const pStock0 = pBefore.data?.[0]?.stock_count ?? null
  const vStock0 = vBefore.data?.[0]?.stock_count ?? null
  const proj0AtWarehouse = Number(projBefore.data?.[0]?.qty_at_warehouse ?? 0)
  const proj0ReturnExpected = Number(projBefore.data?.[0]?.qty_return_expected ?? 0)
  console.log(`  avant scan: products=${pStock0} variant=${vStock0} proj_at_wh=${proj0AtWarehouse} proj_ret_exp=${proj0ReturnExpected}`)

  // Appel record_scan return_received sellable via JWT staff
  const r = await rpc('record_scan', {
    p_scan_type:    'return_received',
    p_scanned_qty:  3,
    p_product_id:   productId,
    p_variant_id:   variantId,
    p_order_id:     orderUuid,
    p_order_type:   'affiliate',
    p_carrier_name: 'TransX',
    p_tracking_ref: 'TRK-RET-1',
    p_condition:    'sellable',
  }, { token: staffToken })

  console.log(`  record_scan sellable → status=${r.status} data=${JSON.stringify(r.data)}`)

  const scanId = r.data
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  check('4a-retour-uuid', r.status === 200 && typeof scanId === 'string' && uuidRx.test(scanId),
    `attendu=uuid observé=${JSON.stringify(scanId)} status=${r.status}`)

  // 4b. products +3
  const pR = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const pStock = pR.data?.[0]?.stock_count
  check('4b-products-plus3', pStock === (pStock0 + 3),
    `products.stock_count attendu=${pStock0 + 3} observé=${pStock}`)

  // 4c. variant +3
  const vR = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const vStock = vR.data?.[0]?.stock_count
  check('4c-variant-plus3', vStock === (vStock0 + 3),
    `variant.stock_count attendu=${vStock0 + 3} observé=${vStock}`)

  // 4d. Ledger return_expected→at_warehouse
  const mR = psqlJSON(`
    SELECT qty_delta, from_status, to_status, reason, channel, note, variant_id
    FROM public.stock_movements
    WHERE product_id = '${productId}' AND note = 'scan:return_received'
    ORDER BY created_at DESC LIMIT 1
  `)
  if (!mR.ok) { fail('4d-ledger', mR.error); return null }
  const m = mR.data[0]
  console.log(`  ledger sellable: ${JSON.stringify(m)}`)
  check('4d-ledger-from-return-expected', m?.from_status === 'return_expected',
    `from_status attendu=return_expected observé=${m?.from_status}`)
  check('4d-ledger-to-at-warehouse', m?.to_status === 'at_warehouse',
    `to_status attendu=at_warehouse observé=${m?.to_status}`)
  check('4d-ledger-qty-3', m?.qty_delta === 3, `qty_delta attendu=3 observé=${m?.qty_delta}`)

  // 4e. Projection : return_expected diminue de 3, at_warehouse augmente de 3
  const projR = psqlJSON(`
    SELECT qty_at_warehouse, qty_return_expected
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  if (!projR.ok) { fail('4e-projection', projR.error); return null }
  const proj = projR.data[0]
  console.log(`  projection après sellable: ${JSON.stringify(proj)}`)
  check('4e-proj-return-expected-diminue', Number(proj?.qty_return_expected) === (proj0ReturnExpected - 3),
    `qty_return_expected attendu=${proj0ReturnExpected - 3} observé=${proj?.qty_return_expected}`)
  check('4e-proj-at-warehouse-augmente', Number(proj?.qty_at_warehouse) === (proj0AtWarehouse + 3),
    `qty_at_warehouse attendu=${proj0AtWarehouse + 3} observé=${proj?.qty_at_warehouse}`)

  return { orderUuid, scanId4: scanId }
}

// ── Scénario 5 : return_received damaged ─────────────────────────────────────

async function scenario5_returnDamaged(ctx) {
  console.log('\n=== 5. return_received damaged : products INCHANGÉ, ledger return_expected→damaged ===')
  const { productId, variantId, staffToken } = ctx

  // Seed return_expected qty=2 (pour le retour endommagé)
  const ins = psql(`
    INSERT INTO public.stock_movements
      (product_id, variant_id, channel, qty_delta, reason, order_type, balance_after, from_status, to_status, note)
    VALUES
      ('${productId}', '${variantId}', 'affiliate', 2, 'retour', 'affiliate', 0, 'reserved', 'return_expected', 'seed:return_expected_damaged')
    RETURNING id
  `)
  if (!ins.ok) { fail('5-seed-return-expected', ins.error); return }
  pass('5-seed-return-expected-ok', 'mouvement seed inséré')

  // Générer ORDER2_UUID distinct
  const order2Uuid = execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -t -A -c "SELECT gen_random_uuid()"`,
    { encoding: 'utf8', timeout: 10000 }
  ).trim()

  // Soldes avant
  const pBefore = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const vBefore = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const projBefore = psqlJSON(`
    SELECT qty_return_expected, qty_damaged
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  const pStock0 = pBefore.data?.[0]?.stock_count ?? null
  const vStock0 = vBefore.data?.[0]?.stock_count ?? null
  const proj0ReturnExpected = Number(projBefore.data?.[0]?.qty_return_expected ?? 0)
  const proj0Damaged = Number(projBefore.data?.[0]?.qty_damaged ?? 0)
  console.log(`  avant scan damaged: products=${pStock0} variant=${vStock0} proj_ret_exp=${proj0ReturnExpected} proj_damaged=${proj0Damaged}`)

  // Appel record_scan return_received damaged via JWT staff
  const r = await rpc('record_scan', {
    p_scan_type:    'return_received',
    p_scanned_qty:  2,
    p_product_id:   productId,
    p_variant_id:   variantId,
    p_order_id:     order2Uuid,
    p_order_type:   'affiliate',
    p_carrier_name: 'TransX',
    p_tracking_ref: 'TRK-RET-2',
    p_condition:    'damaged',
  }, { token: staffToken })

  console.log(`  record_scan damaged → status=${r.status} data=${JSON.stringify(r.data)}`)

  const scanId = r.data
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  check('5a-retour-uuid', r.status === 200 && typeof scanId === 'string' && uuidRx.test(scanId),
    `attendu=uuid observé=${JSON.stringify(scanId)} status=${r.status}`)

  // 5b. products INCHANGÉ (la pièce endommagée n'est PAS vendable)
  const pR = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const pStock = pR.data?.[0]?.stock_count
  check('5b-products-inchange', pStock === pStock0,
    `products.stock_count attendu=INCHANGÉ=${pStock0} observé=${pStock}`)

  // 5c. variant INCHANGÉ
  const vR = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const vStock = vR.data?.[0]?.stock_count
  check('5c-variant-inchange', vStock === vStock0,
    `variant.stock_count attendu=INCHANGÉ=${vStock0} observé=${vStock}`)

  // 5d. Ledger return_expected→damaged, reason=casse
  const mR = psqlJSON(`
    SELECT qty_delta, from_status, to_status, reason, channel, note, variant_id
    FROM public.stock_movements
    WHERE product_id = '${productId}' AND note = 'scan:return_damaged'
    ORDER BY created_at DESC LIMIT 1
  `)
  if (!mR.ok) { fail('5d-ledger', mR.error); return }
  const m = mR.data[0]
  console.log(`  ledger damaged: ${JSON.stringify(m)}`)
  check('5d-ledger-from-return-expected', m?.from_status === 'return_expected',
    `from_status attendu=return_expected observé=${m?.from_status}`)
  check('5d-ledger-to-damaged', m?.to_status === 'damaged',
    `to_status attendu=damaged observé=${m?.to_status}`)
  check('5d-ledger-qty-2', m?.qty_delta === 2, `qty_delta attendu=2 observé=${m?.qty_delta}`)

  // 5e. Projection : damaged+2, return_expected-2
  const projR = psqlJSON(`
    SELECT qty_return_expected, qty_damaged
    FROM public.variant_status_balance
    WHERE product_id = '${productId}' AND variant_id = '${variantId}'
  `)
  if (!projR.ok) { fail('5e-projection', projR.error); return }
  const proj = projR.data[0]
  console.log(`  projection après damaged: ${JSON.stringify(proj)}`)
  check('5e-proj-damaged-augmente', Number(proj?.qty_damaged) === (proj0Damaged + 2),
    `qty_damaged attendu=${proj0Damaged + 2} observé=${proj?.qty_damaged}`)
  check('5e-proj-return-expected-diminue', Number(proj?.qty_return_expected) === (proj0ReturnExpected - 2),
    `qty_return_expected attendu=${proj0ReturnExpected - 2} observé=${proj?.qty_return_expected}`)
}

// ── Scénario 6 : Double-scan idempotence anti-fraude ─────────────────────────

async function scenario6_doubleScanIdempotence(ctx, scanCtx) {
  console.log('\n=== 6. Double-scan idempotence anti-fraude — ré-appel identique scan #4 ===')
  const { productId, variantId, staffToken } = ctx
  const { orderUuid } = scanCtx

  // Soldes AVANT le double-scan
  const pBefore = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const vBefore = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const seCountBefore = psqlJSON(`
    SELECT COUNT(*) AS cnt
    FROM public.scan_events
    WHERE scan_type = 'return_received' AND carrier_tracking_ref = 'TRK-RET-1' AND order_id = '${orderUuid}'
  `)
  const pStock0 = pBefore.data?.[0]?.stock_count ?? null
  const vStock0 = vBefore.data?.[0]?.stock_count ?? null
  const countBefore = Number(seCountBefore.data?.[0]?.cnt ?? 0)
  console.log(`  avant double-scan: products=${pStock0} variant=${vStock0} scan_events.count(TRK-RET-1)=${countBefore}`)

  // Ré-appel IDENTIQUE au scénario 4 (même scan_type + tracking + order_id)
  const r = await rpc('record_scan', {
    p_scan_type:    'return_received',
    p_scanned_qty:  3,
    p_product_id:   productId,
    p_variant_id:   variantId,
    p_order_id:     orderUuid,
    p_order_type:   'affiliate',
    p_carrier_name: 'TransX',
    p_tracking_ref: 'TRK-RET-1',
    p_condition:    'sellable',
  }, { token: staffToken })

  console.log(`  double-scan → status=${r.status} data=${JSON.stringify(r.data)}`)

  // 6a. Retourne NULL (idempotence)
  check('6a-retour-null', r.status === 200 && r.data === null,
    `attendu=null observé=${JSON.stringify(r.data)} status=${r.status}`)

  // 6b. products INCHANGÉ
  const pR = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const pStock = pR.data?.[0]?.stock_count
  check('6b-products-inchange', pStock === pStock0,
    `products DOIT être inchangé: attendu=${pStock0} observé=${pStock}`)

  // 6c. variant INCHANGÉ
  const vR = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const vStock = vR.data?.[0]?.stock_count
  check('6c-variant-inchange', vStock === vStock0,
    `variant DOIT être inchangé: attendu=${vStock0} observé=${vStock}`)

  // 6d. scan_events : toujours 1 ligne pour TRK-RET-1 (pas de doublon)
  const seCountAfter = psqlJSON(`
    SELECT COUNT(*) AS cnt
    FROM public.scan_events
    WHERE scan_type = 'return_received' AND carrier_tracking_ref = 'TRK-RET-1' AND order_id = '${orderUuid}'
  `)
  const countAfter = Number(seCountAfter.data?.[0]?.cnt ?? 0)
  console.log(`  scan_events.count(TRK-RET-1) après double-scan: ${countAfter}`)
  check('6d-scan-events-toujours-1', countAfter === 1,
    `scan_events count attendu=1 observé=${countAfter} (doublon détecté si >1)`)
}

// ── Scénario 7 : Gate manage_stock ───────────────────────────────────────────

async function scenario7_gateManageStock(ctx) {
  console.log('\n=== 7. Gate manage_stock — affiliate sans capacité → errors.forbidden ===')
  const { productId, variantId, affiliateToken } = ctx

  // Soldes avant
  const pBefore = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const pStock0 = pBefore.data?.[0]?.stock_count ?? null
  const seBefore = psqlJSON(`SELECT COUNT(*) AS cnt FROM public.scan_events WHERE product_id = '${productId}'`)
  const seCount0 = Number(seBefore.data?.[0]?.cnt ?? 0)

  // Appel via JWT affiliate (sans manage_stock)
  const r = await rpc('record_scan', {
    p_scan_type:    'inbound_reception',
    p_scanned_qty:  1,
    p_product_id:   productId,
    p_variant_id:   null,
    p_order_id:     null,
    p_order_type:   null,
    p_carrier_name: 'TransX',
    p_tracking_ref: 'TRK-FORBIDDEN-1',
    p_condition:    null,
  }, { token: affiliateToken })

  console.log(`  affiliate scan → status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`)

  // 7a. Erreur forbidden
  const errMsg = JSON.stringify(r.data)
  check('7a-status-4xx', r.status >= 400 || errMsg.includes('forbidden'),
    `attendu>=400 ou 'forbidden', observé status=${r.status} data=${errMsg.slice(0, 150)}`)

  // 7b. products INCHANGÉ
  const pR = psqlJSON(`SELECT stock_count FROM public.products WHERE id = '${productId}'`)
  const pStock = pR.data?.[0]?.stock_count
  check('7b-products-inchange', pStock === pStock0,
    `products DOIT être inchangé: attendu=${pStock0} observé=${pStock}`)

  // 7c. Aucun scan_events créé
  const seAfter = psqlJSON(`SELECT COUNT(*) AS cnt FROM public.scan_events WHERE product_id = '${productId}'`)
  const seCountAfter = Number(seAfter.data?.[0]?.cnt ?? 0)
  check('7c-aucun-scan-events', seCountAfter === seCount0,
    `scan_events ne doit pas augmenter: attendu=${seCount0} observé=${seCountAfter}`)
}

// ── Scénario 8 : Append-only scan_events ─────────────────────────────────────

async function scenario8_appendOnly(ctx) {
  console.log('\n=== 8. Append-only scan_events — UPDATE et DELETE refusés ===')
  const { productId } = ctx

  // Récupérer un scan_id existant pour le test
  const seR = psqlJSON(`
    SELECT id FROM public.scan_events
    WHERE product_id = '${productId}'
    ORDER BY scanned_at DESC LIMIT 1
  `)
  if (!seR.ok || !seR.data?.[0]?.id) {
    fail('8-prep-scan-id', 'Aucun scan_events trouvé pour le test append-only')
    return
  }
  const scanId = seR.data[0].id
  console.log(`  scan_events id pour test: ${scanId}`)

  // 8a. UPDATE → doit lever EXCEPTION 'scan_events est append-only'
  const upd = psql(`UPDATE public.scan_events SET scanned_qty = 999 WHERE id = '${scanId}'`)
  console.log(`  UPDATE résultat: ok=${upd.ok} error=${upd.error?.slice(0, 200) ?? 'none'}`)
  check('8a-update-refuse', !upd.ok && (upd.error ?? '').includes('append-only'),
    `UPDATE attendu=EXCEPTION append-only, observé ok=${upd.ok} error=${upd.error?.slice(0, 100) ?? 'none'}`)

  // 8b. DELETE → doit lever EXCEPTION 'scan_events est append-only'
  const del = psql(`DELETE FROM public.scan_events WHERE id = '${scanId}'`)
  console.log(`  DELETE résultat: ok=${del.ok} error=${del.error?.slice(0, 200) ?? 'none'}`)
  check('8b-delete-refuse', !del.ok && (del.error ?? '').includes('append-only'),
    `DELETE attendu=EXCEPTION append-only, observé ok=${del.ok} error=${del.error?.slice(0, 100) ?? 'none'}`)

  // 8c. La ligne existe toujours (intégrité conservée)
  const seCheck = psqlJSON(`SELECT id FROM public.scan_events WHERE id = '${scanId}'`)
  check('8c-ligne-toujours-presente', seCheck.data?.[0]?.id === scanId,
    `ligne ${scanId} devrait toujours exister après UPDATE/DELETE refusés`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================')
  console.log('  TEST RUNTIME — MIGRATION 100 (scan_events + record_scan)')
  console.log('  branche: feat/variants-step1')
  console.log('========================================')
  console.log(`  URL: ${BASE_URL}`)

  // Vérification préalable : migration 100 appliquée (table scan_events + fonction record_scan)
  const tableCheck = psql(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'scan_events'
  `)
  if (!tableCheck.ok || !tableCheck.output) {
    console.error('FATAL: table scan_events absente — migration 100 non appliquée ?')
    process.exit(1)
  }
  console.log(`  table scan_events: OK`)

  const fnCheck = psql(`
    SELECT proname FROM pg_proc
    WHERE proname = 'record_scan'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `)
  if (!fnCheck.ok || !fnCheck.output) {
    console.error('FATAL: fonction record_scan absente — migration 100 non appliquée ?')
    process.exit(1)
  }
  console.log(`  fonction record_scan: OK`)

  const trigCheck = psql(`
    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_scan_events_immutable'
  `)
  if (!trigCheck.ok || !trigCheck.output) {
    console.error('FATAL: trigger trg_scan_events_immutable absent — migration 100 non appliquée ?')
    process.exit(1)
  }
  console.log(`  trigger scan_events_immutable: OK`)

  let ctx = null
  let scanCtx = null

  try {
    ctx = await scenario1_setup()
    if (!ctx) throw new Error('scenario1 KO — arrêt (contexte manquant)')

    await scenario2_inboundReception(ctx)

    const seedOk = await scenario3_seedReturnExpected(ctx)
    if (!seedOk) {
      fail('3-aborted', 'seed return_expected KO — scénarios 4 et 5 ignorés')
    } else {
      scanCtx = await scenario4_returnSellable(ctx)
      await scenario5_returnDamaged(ctx)
    }

    if (scanCtx?.orderUuid) {
      await scenario6_doubleScanIdempotence(ctx, scanCtx)
    } else {
      fail('6-skipped', 'scénario 4 non complété — orderUuid manquant pour test idempotence')
    }

    await scenario7_gateManageStock(ctx)
    await scenario8_appendOnly(ctx)

  } catch (e) {
    fail('exception', e.message)
    console.error(e)
  }

  // ── Rapport ──
  console.log('\n\n========================================')
  console.log('  RECAPITULATIF')
  console.log('========================================')
  const passed = results.filter(r => r.verdict === 'PASS').length
  const failed = results.filter(r => r.verdict === 'FAIL').length
  for (const r of results) {
    const tag = r.verdict === 'PASS' ? 'PASS' : 'FAIL'
    console.log(`  ${tag} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  }
  console.log(`\n  TOTAL: ${passed} PASS / ${failed} FAIL (sur ${results.length})`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
