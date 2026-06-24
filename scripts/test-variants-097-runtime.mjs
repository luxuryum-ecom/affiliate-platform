#!/usr/bin/env node
/**
 * Test runtime migration 097 — statuts de stock sur le ledger + projection
 *
 * SCÉNARIOS :
 *   1. Seed         : 1 produit P1 + récupère/crée sa variante défaut V1
 *   2. Mouvements   : INSERT manuels dans stock_movements avec variant_id + statuts
 *      a) réception dépôt  : qty_delta=+10, from=NULL,         to='at_warehouse'
 *      b) réservation      : qty_delta=-3,  from='at_warehouse', to='reserved'
 *      c) départ transit   : qty_delta=-3,  from='reserved',     to='in_transit'
 *   3. Projection   : SELECT FROM variant_status_balance → vérifie 7/0/3/0/0/0/0
 *   4. CHECK invalide : to_status='xxx' → violation CHECK attendue
 *   5. RLS via vue  : admin/staff manage_stock voient la ligne ; lambda → 0 ligne
 *   6. Historique   : lignes pré-097 (from_status/to_status NULL) lisibles et intactes
 *
 * RÈGLE ABSOLUE : aucune clé/secret en dur — tout vient de process.env.
 * GARDE-FOU : assertLocalSupabase() refuse si l'URL n'est pas 127.0.0.1.
 *
 * Usage (via le wrapper run-variants-097-tests.sh) :
 *   LOCAL_SUPABASE_URL=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_ANON_KEY=... \
 *   node scripts/test-variants-097-runtime.mjs
 */

import { assertLocalSupabase } from './lib/assert-local-supabase.mjs'
import { execSync } from 'child_process'

// ── Lecture des clés depuis l'environnement (JAMAIS en dur) ──────────────────
const BASE_URL    = process.env.LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.LOCAL_SERVICE_ROLE_KEY
const ANON_KEY    = process.env.LOCAL_ANON_KEY

if (!BASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('ERREUR: LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, LOCAL_ANON_KEY requis.')
  console.error('Utilisez le wrapper: ./scripts/run-variants-097-tests.sh')
  process.exit(1)
}

// GARDE-FOU : ce script ÉCRIT en base — il REFUSE de tourner ailleurs qu'en local.
assertLocalSupabase(BASE_URL, 'test-variants-097-runtime')

const TEST_PASSWORD = 'TestPass097!'
const TAG = `v097-${Date.now()}`
const DOCKER_CONTAINER = 'supabase_db_affiliate-platform'

// ── Helpers psql ──────────────────────────────────────────────────────────────

function psql(sql) {
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

// ── Helpers HTTP REST ─────────────────────────────────────────────────────────

function headers(apikey, bearer) {
  return {
    apikey,
    Authorization: `Bearer ${bearer ?? apikey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

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

async function signIn(email, password) {
  const res = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`signIn KO (${email}): ${JSON.stringify(data)}`)
  return data.access_token
}

async function createAuthUser(roleName, label, password) {
  const email = `${TAG}-${label}@test.local`
  const res = await fetch(`${BASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`auth user KO (${label}): ${JSON.stringify(data)}`)
  const existing = await rest('GET', `/profiles?id=eq.${data.id}&select=id`)
  if (!existing.data?.length) {
    const prof = await rest('POST', '/profiles', {
      id: data.id, role: roleName, full_name: `097 ${label}`, status: 'approved',
    })
    if (prof.status >= 400) throw new Error(`profile KO (${label}): ${JSON.stringify(prof.data)}`)
  } else {
    await rest('PATCH', `/profiles?id=eq.${data.id}`, { role: roleName, status: 'approved' })
  }
  console.log(`  [setup] ${label} créé: ${data.id} (${email})`)
  return { id: data.id, email }
}

async function grantManageStock(userId) {
  const res = await rest('POST', '/staff_permissions', { user_id: userId, capability: 'manage_stock' })
  if (res.status >= 400 && !JSON.stringify(res.data).includes('duplicate')) {
    throw new Error(`grant manage_stock KO: ${JSON.stringify(res.data)}`)
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

// ── Scénario 1 : Seed P1 + récupère variante défaut V1 ───────────────────────

async function scenario1_seed() {
  console.log('\n=== 1. Seed — produit P1 + variante défaut V1 ===')

  // Crée le produit P1
  const rProd = await rest('POST', '/products', {
    name: `${TAG}-P1`,
    sell_price: 2000,
    commission_amount: 200,
    stock_count: 50,
    images: [],
    active: true,
  })
  if (rProd.status >= 400) {
    fail('1-seed-product', `INSERT produit KO status=${rProd.status} ${JSON.stringify(rProd.data)}`)
    return null
  }
  const p1 = Array.isArray(rProd.data) ? rProd.data[0] : rProd.data
  pass('1-seed-product', `product_id=${p1.id}`)

  // Récupère ou crée la variante défaut
  const rVar = psqlJSON(`
    SELECT id FROM public.product_variants
    WHERE product_id = '${p1.id}' AND is_default = true
    LIMIT 1
  `)
  if (!rVar.ok) {
    fail('1-seed-variant-lookup', `psql KO: ${rVar.error}`)
    return null
  }

  let variantId
  if (rVar.data.length > 0) {
    variantId = rVar.data[0].id
    pass('1-seed-variant-found', `variant_id=${variantId} (créée par rétro-remplissage 096)`)
  } else {
    // La variante défaut n'existe pas encore → on la crée
    // psql() pour INSERT, puis relecture de l'id via psqlJSON
    const rIns = psql(`
      INSERT INTO public.product_variants (product_id, attributes, sku, is_default, stock_count, active)
      VALUES ('${p1.id}', '{}'::jsonb, NULL, true, 50, true)
    `)
    if (!rIns.ok) {
      fail('1-seed-variant-insert', `INSERT variante KO: ${rIns.error}`)
      return null
    }
    // Récupère l'id de la variante qu'on vient de créer
    const rId = psqlJSON(`
      SELECT id FROM public.product_variants
      WHERE product_id = '${p1.id}' AND is_default = true
      LIMIT 1
    `)
    if (!rId.ok || rId.data.length === 0) {
      fail('1-seed-variant-insert', `INSERT OK mais variante non trouvée: ${rId.error ?? '?'}`)
      return null
    }
    variantId = rId.data[0].id
    pass('1-seed-variant-created', `variant_id=${variantId} (créée manuellement)`)
  }

  console.log(`  product_id=${p1.id}`)
  console.log(`  variant_id=${variantId}`)
  return { productId: p1.id, variantId }
}

// ── Scénario 2 : INSERT mouvements avec statuts ───────────────────────────────
// Convention qty_delta :
//   réception (entrée pure) : qty_delta=+10 (positif)
//   réservation (at_warehouse → reserved) : qty_delta=-3 (le stock dispo diminue)
//   départ (reserved → in_transit) : qty_delta=-3 (cohérent avec le flux)
// balance_after = valeur arbitraire non testée ici (la projection ne l'utilise pas).
// On passe par psql direct (service_role) pour bypasser la RLS — autorisé LOCAL uniquement.

async function scenario2_insertMovements({ productId, variantId }) {
  console.log('\n=== 2. INSERT mouvements de statut (psql service_role) ===')

  const mouvements = [
    {
      label: '2a-reception-warehouse',
      desc: 'réception dépôt qty=+10, to=at_warehouse',
      sql: `
        INSERT INTO public.stock_movements
          (product_id, variant_id, channel, qty_delta, reason, balance_after, from_status, to_status)
        VALUES
          ('${productId}', '${variantId}', 'manual_adjust', 10, 'reappro', 10, NULL, 'at_warehouse')
      `,
    },
    {
      label: '2b-reservation',
      desc: 'réservation qty=-3, from=at_warehouse to=reserved',
      sql: `
        INSERT INTO public.stock_movements
          (product_id, variant_id, channel, qty_delta, reason, balance_after, from_status, to_status)
        VALUES
          ('${productId}', '${variantId}', 'affiliate', -3, 'vente_affilie', 7, 'at_warehouse', 'reserved')
      `,
    },
    {
      label: '2c-depart-transit',
      desc: 'départ transit qty=-3, from=reserved to=in_transit',
      sql: `
        INSERT INTO public.stock_movements
          (product_id, variant_id, channel, qty_delta, reason, balance_after, from_status, to_status)
        VALUES
          ('${productId}', '${variantId}', 'affiliate', -3, 'vente_affilie', 7, 'reserved', 'in_transit')
      `,
    },
  ]

  for (const { label, desc, sql } of mouvements) {
    const r = psql(sql)
    check(label, r.ok, r.ok ? desc : `FAIL: ${r.error?.slice(0, 200)}`)
  }
}

// ── Scénario 3 : Vérification de la projection ───────────────────────────────
// Attendu mathématique :
//   qty_at_warehouse = Σ|to=warehouse| − Σ|from=warehouse| = 10 − 3 = 7
//   qty_reserved     = Σ|to=reserved|  − Σ|from=reserved|  =  3 − 3 = 0
//   qty_in_transit   = Σ|to=in_transit|− Σ|from=in_transit|=  3 − 0 = 3
//   les 4 autres = 0

async function scenario3_projection({ variantId }) {
  console.log('\n=== 3. Projection variant_status_balance ===')
  console.log('  Attendu : at_warehouse=7, reserved=0, in_transit=3, autres=0')

  const r = psqlJSON(`
    SELECT
      qty_at_warehouse,
      qty_reserved,
      qty_in_transit,
      qty_delivered,
      qty_return_expected,
      qty_return_received,
      qty_damaged
    FROM public.variant_status_balance
    WHERE variant_id = '${variantId}'
  `)

  if (!r.ok) {
    fail('3-projection-query', `psql KO: ${r.error}`)
    return
  }

  if (r.data.length === 0) {
    fail('3-projection-ligne', `aucune ligne retournée pour variant_id=${variantId}`)
    return
  }

  const row = r.data[0]
  console.log(`  Valeurs observées: ${JSON.stringify(row)}`)

  check('3-qty-at_warehouse', Number(row.qty_at_warehouse) === 7,
    `attendu=7 observé=${row.qty_at_warehouse}`)
  check('3-qty-reserved', Number(row.qty_reserved) === 0,
    `attendu=0 observé=${row.qty_reserved}`)
  check('3-qty-in_transit', Number(row.qty_in_transit) === 3,
    `attendu=3 observé=${row.qty_in_transit}`)
  check('3-qty-delivered', Number(row.qty_delivered) === 0,
    `attendu=0 observé=${row.qty_delivered}`)
  check('3-qty-return_expected', Number(row.qty_return_expected) === 0,
    `attendu=0 observé=${row.qty_return_expected}`)
  check('3-qty-return_received', Number(row.qty_return_received) === 0,
    `attendu=0 observé=${row.qty_return_received}`)
  check('3-qty-damaged', Number(row.qty_damaged) === 0,
    `attendu=0 observé=${row.qty_damaged}`)
}

// ── Scénario 4 : CHECK rejette statut invalide ────────────────────────────────

async function scenario4_checkInvalid({ productId, variantId }) {
  console.log('\n=== 4. CHECK rejet to_status invalide (\'xxx\') ===')
  // On utilise reason='reappro' (valeur valide) pour isoler uniquement le CHECK to_status.
  // Si reason était invalide, son CHECK se déclencherait en premier et masquerait le test cible.

  const r = psql(`
    INSERT INTO public.stock_movements
      (product_id, variant_id, channel, qty_delta, reason, balance_after, to_status)
    VALUES
      ('${productId}', '${variantId}', 'manual_adjust', 1, 'reappro', 0, 'xxx')
  `)

  // Attendu : KO (violation CHECK stock_movements_to_status_check)
  if (!r.ok) {
    const errStr = (r.error ?? '').toLowerCase()
    const isCheck = errStr.includes('check') || errStr.includes('23514') || errStr.includes('to_status')
    check('4-check-to_status-invalide', isCheck,
      `violation CHECK attendue — erreur observée: ${r.error?.slice(0, 250)}`)
  } else {
    fail('4-check-to_status-invalide',
      `INSERT to_status='xxx' a RÉUSSI alors qu'il devrait violer le CHECK. Output: ${r.output}`)
  }
}

// ── Scénario 5 : RLS via la vue (security_invoker) ───────────────────────────

async function scenario5_rls({ variantId }) {
  console.log('\n=== 5. RLS variant_status_balance (security_invoker) ===')

  // Crée les utilisateurs de test
  const admin  = await createAuthUser('admin',     'admin-097',  TEST_PASSWORD)
  const staff  = await createAuthUser('agent',     'staff-097',  TEST_PASSWORD)
  await grantManageStock(staff.id)
  const lambda = await createAuthUser('affiliate', 'lambda-097', TEST_PASSWORD)

  const adminTok  = await signIn(admin.email,  TEST_PASSWORD)
  const staffTok  = await signIn(staff.email,  TEST_PASSWORD)
  const lambdaTok = await signIn(lambda.email, TEST_PASSWORD)

  // 5a. admin → SELECT variant_status_balance → doit voir la ligne de V1
  const asAdmin = await rest(
    'GET',
    `/variant_status_balance?variant_id=eq.${variantId}&select=variant_id,qty_at_warehouse,qty_in_transit`,
    null,
    { token: adminTok }
  )
  console.log(`  admin SELECT → status=${asAdmin.status} count=${Array.isArray(asAdmin.data) ? asAdmin.data.length : '?'}`)
  check('5a-admin-voit-ligne',
    asAdmin.status === 200 && Array.isArray(asAdmin.data) && asAdmin.data.length >= 1,
    `admin observé ${Array.isArray(asAdmin.data) ? asAdmin.data.length : asAdmin.status} ligne(s)`)

  // 5b. staff(manage_stock) → SELECT variant_status_balance → doit voir la ligne de V1
  const asStaff = await rest(
    'GET',
    `/variant_status_balance?variant_id=eq.${variantId}&select=variant_id,qty_at_warehouse`,
    null,
    { token: staffTok }
  )
  console.log(`  staff(manage_stock) SELECT → status=${asStaff.status} count=${Array.isArray(asStaff.data) ? asStaff.data.length : '?'}`)
  check('5b-staff-manage_stock-voit-ligne',
    asStaff.status === 200 && Array.isArray(asStaff.data) && asStaff.data.length >= 1,
    `staff observé ${Array.isArray(asStaff.data) ? asStaff.data.length : asStaff.status} ligne(s)`)

  // 5c. user lambda (affiliate sans manage_stock) → SELECT → 0 ligne (deny via RLS stock_movements)
  const asLambda = await rest(
    'GET',
    `/variant_status_balance?variant_id=eq.${variantId}&select=variant_id`,
    null,
    { token: lambdaTok }
  )
  console.log(`  lambda SELECT → status=${asLambda.status} count=${Array.isArray(asLambda.data) ? asLambda.data.length : '?'} data=${JSON.stringify(asLambda.data).slice(0, 100)}`)
  check('5c-lambda-zero-ligne',
    asLambda.status === 200 && Array.isArray(asLambda.data) && asLambda.data.length === 0,
    `lambda observé ${Array.isArray(asLambda.data) ? asLambda.data.length : JSON.stringify(asLambda.data)} ligne(s) (attendu=0)`)
}

// ── Scénario 6 : Lignes historiques intactes ─────────────────────────────────

async function scenario6_historiqueIntact({ productId }) {
  console.log('\n=== 6. Lignes historiques — from_status/to_status NULL sur lignes pré-097 ===')

  // Compte les lignes sans variant_id (i.e. historiques pré-097 ou non câblées)
  const rCount = psqlJSON(`
    SELECT COUNT(*)::int AS total_sans_variant
    FROM public.stock_movements
    WHERE variant_id IS NULL
  `)
  if (!rCount.ok) {
    fail('6-historique-count', `psql KO: ${rCount.error}`)
    return
  }
  const totalSansVariant = rCount.data[0]?.total_sans_variant ?? 0
  console.log(`  Lignes sans variant_id (historiques): ${totalSansVariant}`)
  // On ne peut pas prédire le nombre exact mais elles doivent exister
  // (le cold reset a des données de fixture, et 096 a créé des variantes mais pas de stock_movements avec variant_id)
  pass('6-historique-lisibles',
    `${totalSansVariant} lignes sans variant_id lisibles via psql`)

  // Vérifie qu'aucune ligne pré-existante n'a été modifiée :
  // les lignes historiques (avant 097) ont variant_id=NULL et from_status=NULL et to_status=NULL
  const rNulls = psqlJSON(`
    SELECT COUNT(*)::int AS total_null_statuts
    FROM public.stock_movements
    WHERE variant_id IS NULL
      AND from_status IS NULL
      AND to_status IS NULL
  `)
  if (!rNulls.ok) {
    fail('6-historique-null-statuts', `psql KO: ${rNulls.error}`)
    return
  }
  const totalNullStatuts = rNulls.data[0]?.total_null_statuts ?? 0
  console.log(`  Lignes historiques (variant_id=NULL AND statuts NULL): ${totalNullStatuts}`)
  check('6-historique-statuts-null',
    totalNullStatuts === totalSansVariant,
    `toutes les lignes sans variant_id ont statuts NULL — total_sans_variant=${totalSansVariant} total_null_statuts=${totalNullStatuts}`)

  // Vérifie que les 3 mouvements 097 sont bien présents avec leurs statuts
  const rMov097 = psqlJSON(`
    SELECT COUNT(*)::int AS total_avec_statut
    FROM public.stock_movements
    WHERE variant_id IS NOT NULL
      AND (from_status IS NOT NULL OR to_status IS NOT NULL)
  `)
  if (!rMov097.ok) {
    fail('6-mouvements-097-count', `psql KO: ${rMov097.error}`)
    return
  }
  const total097 = rMov097.data[0]?.total_avec_statut ?? 0
  console.log(`  Mouvements avec variant_id + statuts (097): ${total097}`)
  check('6-mouvements-097-presents',
    total097 >= 3,
    `attendu >= 3 mouvements avec statuts observé=${total097}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================')
  console.log('  TEST RUNTIME — MIGRATION 097 (statuts stock ledger)')
  console.log('  branche: feat/variants-step1')
  console.log('========================================')
  console.log(`  URL: ${BASE_URL}`)
  console.log(`  TAG: ${TAG}`)

  // Pré-vérification : view et colonnes existent
  const viewCheck = psql(`SELECT to_regclass('public.variant_status_balance')::text`)
  if (!viewCheck.ok || !viewCheck.output || viewCheck.output === '') {
    console.error('FATAL: vue variant_status_balance introuvable — migration 097 non appliquée ?')
    process.exit(1)
  }
  console.log(`  Vue variant_status_balance: ${viewCheck.output}`)

  const colCheck = psqlJSON(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_movements'
      AND column_name IN ('variant_id','from_status','to_status')
    ORDER BY column_name
  `)
  if (!colCheck.ok || colCheck.data.length < 3) {
    console.error(`FATAL: colonnes 097 manquantes — ${JSON.stringify(colCheck.data ?? colCheck.error)}`)
    process.exit(1)
  }
  console.log(`  Colonnes 097 présentes: ${colCheck.data.map(c => c.column_name).join(', ')}`)

  let ctx = null
  try {
    ctx = await scenario1_seed()
    if (!ctx) throw new Error('seed KO — arrêt')

    await scenario2_insertMovements(ctx)
    await scenario3_projection(ctx)
    await scenario4_checkInvalid(ctx)
    await scenario5_rls(ctx)
    await scenario6_historiqueIntact(ctx)
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
    console.log(`  ${r.verdict === 'PASS' ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  }
  console.log(`\n  TOTAL: ${passed} PASS / ${failed} FAIL (sur ${results.length})`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
