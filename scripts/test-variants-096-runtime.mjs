#!/usr/bin/env node
/**
 * Test runtime migration 096 — product_variants (branche feat/variants-step1)
 *
 * SCÉNARIOS :
 *   1. Seed         : 3 produits de test (stock 10 / 0 / -3 oversell)
 *   2. Rétro        : INSERT idempotent (bloc migration 096) sur les produits seedés
 *   3. Vérif copie  : chaque produit a exactement 1 variante is_default + stock miroir
 *   4. products inchangé : products.stock_count non modifié par la migration
 *   5. Idempotence  : 2ème INSERT → zéro doublon (3 variantes, toujours)
 *   6. Contrainte 1 défaut/produit : 2ème is_default=true pour P1 → FAIL attendu
 *   7. RLS :
 *        admin          → SELECT product_variants OK (lignes visibles)
 *        staff(manage_stock) → SELECT OK
 *        user lambda    → SELECT product_variants → 0 ligne (deny)
 *        user lambda    → INSERT direct → refusé (403/RLS)
 *
 * Usage (via le wrapper run-variants-096-tests.sh) :
 *   LOCAL_SUPABASE_URL=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_ANON_KEY=... \
 *   node scripts/test-variants-096-runtime.mjs
 *
 * RÈGLE ABSOLUE : aucune clé/secret en dur — tout vient de process.env.
 * GARDE-FOU : assertLocalSupabase() refuse si l'URL n'est pas 127.0.0.1.
 */

import { assertLocalSupabase } from './lib/assert-local-supabase.mjs'

// ── Lecture des clés depuis l'environnement (JAMAIS en dur) ──────────────────
const BASE_URL       = process.env.LOCAL_SUPABASE_URL
const SERVICE_KEY    = process.env.LOCAL_SERVICE_ROLE_KEY
const ANON_KEY       = process.env.LOCAL_ANON_KEY

if (!BASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('ERREUR: LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, LOCAL_ANON_KEY requis.')
  console.error('Utilisez le wrapper: ./scripts/run-variants-096-tests.sh')
  process.exit(1)
}

// GARDE-FOU : ce script ÉCRIT en base — il REFUSE de tourner ailleurs qu'en local.
assertLocalSupabase(BASE_URL, 'test-variants-096-runtime')

const TEST_PASSWORD = 'TestPass096!'
const TAG = `v096-${Date.now()}`

// ── Helpers HTTP ─────────────────────────────────────────────────────────────

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
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  })
  const data = await res.json()
  if (!data.id) throw new Error(`auth user KO (${label}): ${JSON.stringify(data)}`)
  const existing = await rest('GET', `/profiles?id=eq.${data.id}&select=id`)
  if (!existing.data?.length) {
    const prof = await rest('POST', '/profiles', {
      id: data.id, role: roleName, full_name: `096 ${label}`, status: 'approved',
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

// ── Helpers SQL via docker exec ───────────────────────────────────────────────
// Pour les opérations qui nécessitent du SQL pur (INSERT idempotent, requêtes
// de vérification fine) on passe par le conteneur postgres local.
// On utilise child_process.execSync pour avoir un retour synchrone propre.

import { execSync } from 'child_process'

const DOCKER_CONTAINER = 'supabase_db_affiliate-platform'

function psql(sql) {
  // Retourne le résultat en JSON via psql -c avec format csv/unaligned, puis parse.
  // On utilise --tuples-only pour éviter les headers.
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
  // Exécute une requête SELECT et retourne le résultat en tableau JSON via json_agg.
  const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t`
  const r = psql(wrapped)
  if (!r.ok) return { ok: false, error: r.error }
  try {
    return { ok: true, data: JSON.parse(r.output || '[]') }
  } catch (e) {
    return { ok: false, error: `parse JSON KO: ${r.output}` }
  }
}

// ── Scénario 1 : Seed ─────────────────────────────────────────────────────────

async function scenario1_seed() {
  console.log('\n=== 1. Seed — 3 produits (stock: P1=10, P2=0, P3=-3) ===')

  const tag = TAG
  const products = [
    { label: 'P1', stock_count: 10 },
    { label: 'P2', stock_count: 0  },
    { label: 'P3', stock_count: -3 },
  ]

  const ids = {}
  for (const { label, stock_count } of products) {
    const r = await rest('POST', '/products', {
      name: `${tag}-${label}`,
      sell_price: 1000,
      commission_amount: 100,
      stock_count,
      images: [],
      active: true,
    })
    if (r.status >= 400) {
      fail(`1-seed-${label}`, `INSERT produit KO status=${r.status} ${JSON.stringify(r.data)}`)
      return null
    }
    const p = Array.isArray(r.data) ? r.data[0] : r.data
    ids[label] = p.id
    pass(`1-seed-${label}`, `id=${p.id} stock_count=${p.stock_count}`)
  }
  return ids
}

// ── Scénario 2 : Rétro-remplissage ───────────────────────────────────────────

async function scenario2_retro(ids) {
  console.log('\n=== 2. Rétro-remplissage — INSERT idempotent bloc migration 096 ===')

  // On filtre sur nos 3 produits de test pour ne pas affecter des données tierces.
  const idList = Object.values(ids).map(id => `'${id}'`).join(',')

  const sql = `
    INSERT INTO public.product_variants (product_id, attributes, sku, is_default, stock_count, active)
    SELECT p.id, '{}'::jsonb, NULL, true, p.stock_count, COALESCE(p.active, true)
    FROM public.products p
    WHERE p.id IN (${idList})
      AND NOT EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.product_id = p.id AND v.is_default
      )
  `
  const r = psql(sql)
  if (!r.ok) {
    fail('2-retro-insert', `psql KO: ${r.error}`)
    return false
  }
  // psql retourne "INSERT 0 N" — les 3 produits ne devaient pas encore avoir de variante.
  const insertLine = r.output
  console.log(`  psql retour: "${insertLine}"`)
  // On accepte INSERT 0 N (N peut être 0 si déjà rétro-rempli par la migration à froid).
  pass('2-retro-insert', `psql OK: ${insertLine}`)
  return true
}

// ── Scénario 3 : Vérification de la copie ────────────────────────────────────

async function scenario3_verifCopie(ids) {
  console.log('\n=== 3. Vérif copie — 1 variante is_default, stock miroir, attributes={} ===')

  const expected = { P1: 10, P2: 0, P3: -3 }
  let allOk = true

  for (const [label, productId] of Object.entries(ids)) {
    const r = psqlJSON(`
      SELECT id, product_id, attributes::text, is_default, stock_count, active
      FROM public.product_variants
      WHERE product_id = '${productId}'
        AND is_default = true
    `)
    if (!r.ok) {
      fail(`3-copie-${label}`, `psql KO: ${r.error}`)
      allOk = false
      continue
    }
    const rows = r.data
    const count = rows.length
    const variant = rows[0]

    console.log(`  ${label} (${productId}): ${count} variante(s) is_default → ${JSON.stringify(variant)}`)

    check(`3-${label}-count-exactement-1`, count === 1,
      `nb variantes is_default attendu=1 observé=${count}`)
    if (count === 1) {
      check(`3-${label}-attributes-vide`, variant.attributes === '{}',
        `attributes attendu={} observé=${variant.attributes}`)
      check(`3-${label}-stock-miroir`, variant.stock_count === expected[label],
        `stock_count attendu=${expected[label]} observé=${variant.stock_count}`)
      check(`3-${label}-active-miroir`, variant.active === true,
        `active attendu=true observé=${variant.active}`)
    } else {
      allOk = false
    }
  }
  return allOk
}

// ── Scénario 4 : products inchangé ───────────────────────────────────────────

async function scenario4_productsInchangé(ids) {
  console.log('\n=== 4. products.stock_count INCHANGÉ après migration ===')

  const expected = { P1: 10, P2: 0, P3: -3 }
  for (const [label, productId] of Object.entries(ids)) {
    const r = psqlJSON(`
      SELECT stock_count FROM public.products WHERE id = '${productId}'
    `)
    if (!r.ok) {
      fail(`4-products-${label}`, `psql KO: ${r.error}`)
      continue
    }
    const sc = r.data[0]?.stock_count
    check(`4-products-${label}-inchangé`, sc === expected[label],
      `products.stock_count attendu=${expected[label]} observé=${sc}`)
  }
}

// ── Scénario 5 : Idempotence ─────────────────────────────────────────────────

async function scenario5_idempotence(ids) {
  console.log('\n=== 5. Idempotence — 2ème INSERT → zéro doublon ===')

  const idList = Object.values(ids).map(id => `'${id}'`).join(',')

  const sql = `
    INSERT INTO public.product_variants (product_id, attributes, sku, is_default, stock_count, active)
    SELECT p.id, '{}'::jsonb, NULL, true, p.stock_count, COALESCE(p.active, true)
    FROM public.products p
    WHERE p.id IN (${idList})
      AND NOT EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.product_id = p.id AND v.is_default
      )
  `
  const r = psql(sql)
  if (!r.ok) {
    fail('5-idempotence-insert', `psql KO: ${r.error}`)
    return
  }
  // INSERT 0 0 attendu (toutes les variantes existent déjà)
  const line = r.output
  console.log(`  2ème INSERT psql retour: "${line}"`)
  check('5-idempotence-insert-zero', line === 'INSERT 0 0',
    `attendu="INSERT 0 0" observé="${line}"`)

  // Compter les variantes totales pour nos 3 produits
  const countR = psqlJSON(`
    SELECT COUNT(*)::int AS total
    FROM public.product_variants
    WHERE product_id IN (${idList})
  `)
  if (!countR.ok) {
    fail('5-idempotence-count', `psql KO: ${countR.error}`)
    return
  }
  const total = countR.data[0]?.total
  check('5-idempotence-total-3', total === 3,
    `total variantes attendu=3 observé=${total} (zéro doublon)`)
}

// ── Scénario 6 : Contrainte 1 défaut/produit ─────────────────────────────────

async function scenario6_contrainte(ids) {
  console.log('\n=== 6. Contrainte unique — 2ème is_default=true pour P1 → FAIL attendu ===')

  const p1Id = ids['P1']
  const sql = `
    INSERT INTO public.product_variants (product_id, attributes, is_default, stock_count)
    VALUES ('${p1Id}', '{}'::jsonb, true, 99)
  `
  const r = psql(sql)
  // Si ok=false → erreur psql (contrainte violée) = comportement attendu
  if (!r.ok) {
    const errStr = (r.error ?? '').toLowerCase()
    const isUniqueViolation = errStr.includes('unique') || errStr.includes('23505') || errStr.includes('duplic')
    check('6-contrainte-unique-default', isUniqueViolation,
      `erreur unique-index attendue observée: ${r.error?.slice(0, 150)}`)
  } else {
    // Si psql retourne OK, c'est un FAIL : la contrainte n'a pas bloqué
    fail('6-contrainte-unique-default',
      `L'INSERT a réussi alors qu'il devrait échouer (unique index partiel absent ?). Output: ${r.output}`)
  }
}

// ── Scénario 7 : RLS ─────────────────────────────────────────────────────────

async function scenario7_rls(ids) {
  console.log('\n=== 7. RLS product_variants ===')

  // Créer les utilisateurs de test
  const admin  = await createAuthUser('admin',     'admin-096')
  const staff  = await createAuthUser('agent',     'staff-096')
  await grantManageStock(staff.id)
  const lambda = await createAuthUser('affiliate', 'lambda-096')

  const adminTok  = await signIn(admin.email)
  const staffTok  = await signIn(staff.email)
  const lambdaTok = await signIn(lambda.email)

  // 7a. admin → SELECT → voit des lignes
  const asAdmin = await rest('GET', '/product_variants?select=id,product_id,is_default', null, { token: adminTok })
  console.log(`  admin SELECT → status=${asAdmin.status} count=${Array.isArray(asAdmin.data) ? asAdmin.data.length : '?'}`)
  check('7a-admin-select-ok',
    asAdmin.status === 200 && Array.isArray(asAdmin.data) && asAdmin.data.length >= 3,
    `admin voit ${Array.isArray(asAdmin.data) ? asAdmin.data.length : asAdmin.status} lignes (attendu >= 3)`)

  // 7b. staff(manage_stock) → SELECT → voit des lignes
  const asStaff = await rest('GET', '/product_variants?select=id,product_id,is_default', null, { token: staffTok })
  console.log(`  staff(manage_stock) SELECT → status=${asStaff.status} count=${Array.isArray(asStaff.data) ? asStaff.data.length : '?'}`)
  check('7b-staff-manage_stock-select-ok',
    asStaff.status === 200 && Array.isArray(asStaff.data) && asStaff.data.length >= 3,
    `staff voit ${Array.isArray(asStaff.data) ? asStaff.data.length : asStaff.status} lignes (attendu >= 3)`)

  // 7c. user lambda → SELECT → 0 ligne (deny RLS)
  const asLambda = await rest('GET', '/product_variants?select=id', null, { token: lambdaTok })
  console.log(`  lambda SELECT → status=${asLambda.status} count=${Array.isArray(asLambda.data) ? asLambda.data.length : '?'}`)
  check('7c-lambda-select-zero',
    asLambda.status === 200 && Array.isArray(asLambda.data) && asLambda.data.length === 0,
    `lambda voit ${Array.isArray(asLambda.data) ? asLambda.data.length : JSON.stringify(asLambda.data)} lignes (attendu=0)`)

  // 7d. user lambda → INSERT direct → refusé
  const insAttempt = await rest('POST', '/product_variants',
    { product_id: ids['P1'], attributes: '{}', is_default: false, stock_count: 0 },
    { token: lambdaTok })
  console.log(`  lambda INSERT → status=${insAttempt.status}`)
  check('7d-lambda-insert-refuse',
    insAttempt.status >= 400,
    `INSERT lambda doit échouer, observé status=${insAttempt.status} ${JSON.stringify(insAttempt.data).slice(0, 120)}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================')
  console.log('  TEST RUNTIME — MIGRATION 096 (product_variants)')
  console.log('  branche: feat/variants-step1')
  console.log('========================================')
  console.log(`  URL: ${BASE_URL}`)

  // Vérifie que la table existe
  const tableCheck = psql(`
    SELECT to_regclass('public.product_variants')::text
  `)
  if (!tableCheck.ok || !tableCheck.output || tableCheck.output === '') {
    console.error('FATAL: table product_variants introuvable — migration 096 non appliquée ?')
    process.exit(1)
  }
  console.log(`  Table product_variants: ${tableCheck.output}`)

  let ids = null
  try {
    ids = await scenario1_seed()
    if (!ids) throw new Error('seed KO — arrêt')
    await scenario2_retro(ids)
    await scenario3_verifCopie(ids)
    await scenario4_productsInchangé(ids)
    await scenario5_idempotence(ids)
    await scenario6_contrainte(ids)
    await scenario7_rls(ids)
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
