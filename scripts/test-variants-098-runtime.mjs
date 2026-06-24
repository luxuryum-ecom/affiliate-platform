#!/usr/bin/env node
/**
 * Test runtime migration 098 — vue product_variants_read (branche feat/variants-step1)
 *
 * SCÉNARIOS :
 *   1. Seed :
 *        PA  — produit ACTIF + approval_status='approved' + sa variante défaut active
 *        PI  — produit INACTIF (active=false) + sa variante défaut active
 *        PNA — produit actif mais NON-APPROUVÉ (approval_status='draft') + variante
 *   2. Filtrage (psql service_role via docker) :
 *        SELECT * FROM product_variants_read → PA visible, PI et PNA absents
 *   3. Lecture client via REST + JWT :
 *        anon (sans JWT)        → voit la variante PA (lecture publique OK)
 *        affiliate (JWT)        → voit la variante PA
 *   4. Écriture bloquée :
 *        POST product_variants_read (anon)          → 405 / erreur
 *        PATCH product_variants_read (affiliate)    → 405 / erreur
 *        DELETE product_variants_read (affiliate)   → 405 / erreur
 *   5. Table de base staff-only :
 *        affiliate → GET /product_variants (table) → 0 ligne (RLS deny inchangée)
 *
 * Usage (via le wrapper run-variants-098-tests.sh) :
 *   LOCAL_SUPABASE_URL=... LOCAL_SERVICE_ROLE_KEY=... LOCAL_ANON_KEY=... \
 *   node scripts/test-variants-098-runtime.mjs
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
  console.error('Utilisez le wrapper: ./scripts/run-variants-098-tests.sh')
  process.exit(1)
}

// GARDE-FOU : ce script ÉCRIT en base — il REFUSE de tourner ailleurs qu'en local.
assertLocalSupabase(BASE_URL, 'test-variants-098-runtime')

const TEST_PASSWORD = 'TestPass098!'
const TAG = `v098-${Date.now()}`
const DOCKER_CONTAINER = 'supabase_db_affiliate-platform'

// ── Helpers SQL via docker exec ───────────────────────────────────────────────

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

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function headers(apikey, bearer) {
  return {
    apikey,
    Authorization: `Bearer ${bearer ?? apikey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

// rest() sans options → SERVICE_KEY (bypasse RLS) — usage interne / seed uniquement.
// Pour simuler anon (sans JWT), passer { asAnon: true }.
// Pour simuler un user authentifié, passer { token: jwtToken }.
async function rest(method, path, body, { token, asAnon } = {}) {
  let apikey, bearer
  if (asAnon) {
    // Simule une requête client anonyme (navigateur sans compte)
    apikey = ANON_KEY
    bearer = ANON_KEY
  } else if (token) {
    // Simule un user authentifié (JWT affilié, admin, etc.)
    apikey = ANON_KEY
    bearer = token
  } else {
    // Appel interne service_role (bypass RLS) — seed, setup, vérifications
    apikey = SERVICE_KEY
    bearer = SERVICE_KEY
  }
  const opts = { method, headers: headers(apikey, bearer) }
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
      id: data.id, role: roleName, full_name: `098 ${label}`, status: 'approved',
    })
    if (prof.status >= 400) throw new Error(`profile KO (${label}): ${JSON.stringify(prof.data)}`)
  } else {
    await rest('PATCH', `/profiles?id=eq.${data.id}`, { role: roleName, status: 'approved' })
  }
  console.log(`  [setup] ${label} créé: ${data.id} (${email})`)
  return { id: data.id, email }
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

// ── Scénario 1 : Seed ─────────────────────────────────────────────────────────

async function scenario1_seed() {
  console.log('\n=== 1. Seed — 3 produits (PA=actif+approved, PI=inactif, PNA=draft) ===')

  // PA : produit actif + approuvé (doit apparaître dans la vue)
  const rPA = await rest('POST', '/products', {
    name: `${TAG}-PA`,
    sell_price: 1500,
    commission_amount: 150,
    stock_count: 10,
    images: [],
    active: true,
    // approval_status doit être forcé en 'approved' — INSERT via service_role
  })
  if (rPA.status >= 400) {
    fail('1-seed-PA', `INSERT produit KO status=${rPA.status} ${JSON.stringify(rPA.data)}`)
    return null
  }
  const PA = Array.isArray(rPA.data) ? rPA.data[0] : rPA.data
  // Forcer approval_status='approved' via service_role (valeur par défaut = 'draft')
  const patchPA = await rest('PATCH', `/products?id=eq.${PA.id}`, { approval_status: 'approved' })
  if (patchPA.status >= 400) {
    fail('1-seed-PA-approve', `PATCH approval_status KO: ${JSON.stringify(patchPA.data)}`)
    return null
  }
  pass('1-seed-PA', `id=${PA.id} active=true approval_status=approved`)

  // PI : produit INACTIF (doit être absent de la vue)
  const rPI = await rest('POST', '/products', {
    name: `${TAG}-PI`,
    sell_price: 1500,
    commission_amount: 150,
    stock_count: 5,
    images: [],
    active: false,
    // approval_status='draft' par défaut — mais c'est active=false qui filtre
  })
  if (rPI.status >= 400) {
    fail('1-seed-PI', `INSERT produit KO status=${rPI.status} ${JSON.stringify(rPI.data)}`)
    return null
  }
  const PI = Array.isArray(rPI.data) ? rPI.data[0] : rPI.data
  // On met aussi approved pour s'assurer que c'est bien active=false qui filtre (pas approval_status)
  await rest('PATCH', `/products?id=eq.${PI.id}`, { approval_status: 'approved' })
  pass('1-seed-PI', `id=${PI.id} active=false approval_status=approved (filtré par active=false)`)

  // PNA : produit actif mais NON-APPROUVÉ (approval_status='draft') (doit être absent)
  const rPNA = await rest('POST', '/products', {
    name: `${TAG}-PNA`,
    sell_price: 1500,
    commission_amount: 150,
    stock_count: 8,
    images: [],
    active: true,
    // approval_status = 'draft' par défaut
  })
  if (rPNA.status >= 400) {
    fail('1-seed-PNA', `INSERT produit KO status=${rPNA.status} ${JSON.stringify(rPNA.data)}`)
    return null
  }
  const PNA = Array.isArray(rPNA.data) ? rPNA.data[0] : rPNA.data
  pass('1-seed-PNA', `id=${PNA.id} active=true approval_status=draft (filtré par approval_status)`)

  // Créer variantes par défaut pour chacun (bloc retro migration 096)
  const idList = [PA.id, PI.id, PNA.id].map(id => `'${id}'`).join(',')
  const sqlVariants = `
    INSERT INTO public.product_variants (product_id, attributes, sku, is_default, stock_count, active)
    SELECT p.id, '{}'::jsonb, NULL, true, p.stock_count, COALESCE(p.active, true)
    FROM public.products p
    WHERE p.id IN (${idList})
      AND NOT EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.product_id = p.id AND v.is_default
      )
  `
  const rVariants = psql(sqlVariants)
  if (!rVariants.ok) {
    fail('1-seed-variantes', `INSERT variantes KO: ${rVariants.error}`)
    return null
  }
  console.log(`  [seed] variantes INSERT retour: "${rVariants.output}"`)
  pass('1-seed-variantes', `variantes créées: ${rVariants.output}`)

  return { PA: PA.id, PI: PI.id, PNA: PNA.id }
}

// ── Scénario 2 : Filtrage des lignes (psql service_role) ─────────────────────

async function scenario2_filtrage(ids) {
  console.log('\n=== 2. Filtrage des lignes — product_variants_read (via psql service_role) ===')

  const rPA = psqlJSON(`
    SELECT v.id, v.product_id, v.is_default, v.active
    FROM public.product_variants_read v
    WHERE v.product_id = '${ids.PA}'
  `)
  if (!rPA.ok) {
    fail('2-PA-vue', `psql KO: ${rPA.error}`)
  } else {
    const count = rPA.data.length
    console.log(`  PA → vue retourne ${count} ligne(s): ${JSON.stringify(rPA.data)}`)
    check('2-PA-vue-presente', count === 1,
      `PA (actif+approuvé) doit être présent dans la vue: attendu=1 observé=${count}`)
  }

  const rPI = psqlJSON(`
    SELECT v.id, v.product_id
    FROM public.product_variants_read v
    WHERE v.product_id = '${ids.PI}'
  `)
  if (!rPI.ok) {
    fail('2-PI-vue', `psql KO: ${rPI.error}`)
  } else {
    const count = rPI.data.length
    console.log(`  PI (inactif) → vue retourne ${count} ligne(s): ${JSON.stringify(rPI.data)}`)
    check('2-PI-absent', count === 0,
      `PI (produit inactif) doit être ABSENT de la vue: attendu=0 observé=${count}`)
  }

  const rPNA = psqlJSON(`
    SELECT v.id, v.product_id
    FROM public.product_variants_read v
    WHERE v.product_id = '${ids.PNA}'
  `)
  if (!rPNA.ok) {
    fail('2-PNA-vue', `psql KO: ${rPNA.error}`)
  } else {
    const count = rPNA.data.length
    console.log(`  PNA (draft) → vue retourne ${count} ligne(s): ${JSON.stringify(rPNA.data)}`)
    check('2-PNA-absent', count === 0,
      `PNA (approval_status=draft) doit être ABSENT de la vue: attendu=0 observé=${count}`)
  }

  // Vérifier les colonnes exposées (whitelist)
  const rCols = psqlJSON(`
    SELECT v.id, v.product_id, v.attributes, v.is_default, v.stock_count, v.active
    FROM public.product_variants_read v
    WHERE v.product_id = '${ids.PA}'
  `)
  if (!rCols.ok) {
    fail('2-PA-colonnes', `psql colonnes KO: ${rCols.error}`)
  } else if (rCols.data.length > 0) {
    const row = rCols.data[0]
    const hasAll = 'id' in row && 'product_id' in row && 'attributes' in row
      && 'is_default' in row && 'stock_count' in row && 'active' in row
    check('2-PA-colonnes-whitelist', hasAll,
      `colonnes whitelistées présentes: ${Object.keys(row).join(', ')}`)
    check('2-PA-stock-count-valeur', row.stock_count === 10,
      `stock_count attendu=10 observé=${row.stock_count}`)
  }
}

// ── Scénario 3 : Lecture client (REST + JWT) ──────────────────────────────────

async function scenario3_lectureClient(ids, affiliateToken) {
  console.log('\n=== 3. Lecture client via REST ===')

  // 3a. anon (clé anon sans JWT) → doit voir la variante de PA
  const asAnon = await rest('GET',
    `/product_variants_read?product_id=eq.${ids.PA}&select=id,product_id,is_default,stock_count,active`,
    null, { asAnon: true })
  console.log(`  anon → status=${asAnon.status} count=${Array.isArray(asAnon.data) ? asAnon.data.length : '?'}`)
  console.log(`  anon data: ${JSON.stringify(asAnon.data).slice(0, 200)}`)
  check('3a-anon-voit-PA',
    asAnon.status === 200 && Array.isArray(asAnon.data) && asAnon.data.length === 1,
    `anon doit voir 1 variante PA: status=${asAnon.status} count=${Array.isArray(asAnon.data) ? asAnon.data.length : 'err'}`)

  // 3b. affiliate (JWT) → doit voir la variante de PA
  const asAffiliate = await rest('GET',
    `/product_variants_read?product_id=eq.${ids.PA}&select=id,product_id,is_default,stock_count,active`,
    null, { token: affiliateToken })
  console.log(`  affiliate → status=${asAffiliate.status} count=${Array.isArray(asAffiliate.data) ? asAffiliate.data.length : '?'}`)
  check('3b-affiliate-voit-PA',
    asAffiliate.status === 200 && Array.isArray(asAffiliate.data) && asAffiliate.data.length === 1,
    `affiliate doit voir 1 variante PA: status=${asAffiliate.status} count=${Array.isArray(asAffiliate.data) ? asAffiliate.data.length : 'err'}`)

  // 3c. Confirmer que anon ne voit PAS PI (inactif) via la vue
  const anonPI = await rest('GET',
    `/product_variants_read?product_id=eq.${ids.PI}&select=id`,
    null, { asAnon: true })
  console.log(`  anon → PI inactif → status=${anonPI.status} count=${Array.isArray(anonPI.data) ? anonPI.data.length : '?'}`)
  check('3c-anon-PI-absent',
    anonPI.status === 200 && Array.isArray(anonPI.data) && anonPI.data.length === 0,
    `anon ne doit pas voir PI: count=${Array.isArray(anonPI.data) ? anonPI.data.length : 'err'}`)
}

// ── Scénario 4 : Écriture bloquée ────────────────────────────────────────────

async function scenario4_ecritureBloquee(ids, affiliateToken) {
  console.log('\n=== 4. Écriture bloquée sur product_variants_read ===')

  // 4a. POST (anon) — INSERT via la vue
  const postAnon = await rest('POST', '/product_variants_read', {
    product_id: ids.PA,
    attributes: '{}',
    is_default: false,
    stock_count: 999,
    active: true,
  }, { asAnon: true })
  console.log(`  POST anon → status=${postAnon.status} data=${JSON.stringify(postAnon.data).slice(0, 150)}`)
  check('4a-post-anon-refuse',
    postAnon.status >= 400,
    `POST anon doit être refusé: status=${postAnon.status}`)

  // 4b. PATCH (affiliate) — UPDATE via la vue
  const patchAffiliate = await rest('PATCH',
    `/product_variants_read?product_id=eq.${ids.PA}`,
    { stock_count: 9999 },
    { token: affiliateToken })
  console.log(`  PATCH affiliate → status=${patchAffiliate.status} data=${JSON.stringify(patchAffiliate.data).slice(0, 150)}`)
  check('4b-patch-affiliate-refuse',
    patchAffiliate.status >= 400,
    `PATCH affiliate doit être refusé: status=${patchAffiliate.status}`)

  // 4c. DELETE (affiliate) — DELETE via la vue
  const delAffiliate = await rest('DELETE',
    `/product_variants_read?product_id=eq.${ids.PA}`,
    null,
    { token: affiliateToken })
  console.log(`  DELETE affiliate → status=${delAffiliate.status} data=${JSON.stringify(delAffiliate.data).slice(0, 150)}`)
  check('4c-delete-affiliate-refuse',
    delAffiliate.status >= 400,
    `DELETE affiliate doit être refusé: status=${delAffiliate.status}`)

  // Confirmer que le stock n'a pas changé malgré les tentatives d'écriture
  const rVerif = psqlJSON(`
    SELECT stock_count FROM public.product_variants
    WHERE product_id = '${ids.PA}' AND is_default = true
  `)
  if (rVerif.ok && rVerif.data.length > 0) {
    const sc = rVerif.data[0].stock_count
    check('4d-stock-inchange-apres-tentatives',
      sc === 10,
      `stock_count PA inchangé après tentatives d'écriture: attendu=10 observé=${sc}`)
  } else {
    fail('4d-stock-inchange-apres-tentatives', `impossible de vérifier: ${rVerif.error ?? 'aucune ligne'}`)
  }
}

// ── Scénario 5 : Table de base toujours staff-only ───────────────────────────

async function scenario5_tableBaseStaffOnly(ids, affiliateToken) {
  console.log('\n=== 5. Table de base product_variants — toujours staff-only (RLS 096 inchangée) ===')

  // affiliate lit product_variants (table) → doit avoir 0 ligne (RLS deny)
  const asAffiliate = await rest('GET',
    `/product_variants?product_id=eq.${ids.PA}&select=id`,
    null, { token: affiliateToken })
  console.log(`  affiliate → /product_variants (table) → status=${asAffiliate.status} count=${Array.isArray(asAffiliate.data) ? asAffiliate.data.length : '?'}`)
  check('5-affiliate-table-zero',
    asAffiliate.status === 200 && Array.isArray(asAffiliate.data) && asAffiliate.data.length === 0,
    `affiliate ne doit voir 0 ligne de la table: observé count=${Array.isArray(asAffiliate.data) ? asAffiliate.data.length : 'err'} status=${asAffiliate.status}`)

  // anon lit product_variants (table) → doit avoir 0 ligne (RLS deny)
  // On utilise { asAnon: true } pour utiliser ANON_KEY (pas SERVICE_KEY qui bypasse RLS)
  const asAnon = await rest('GET',
    `/product_variants?select=id&limit=5`,
    null, { asAnon: true })
  console.log(`  anon → /product_variants (table) → status=${asAnon.status} count=${Array.isArray(asAnon.data) ? asAnon.data.length : '?'}`)
  check('5-anon-table-zero',
    asAnon.status === 200 && Array.isArray(asAnon.data) && asAnon.data.length === 0,
    `anon ne doit voir 0 ligne de la table: observé count=${Array.isArray(asAnon.data) ? asAnon.data.length : 'err'} status=${asAnon.status}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================')
  console.log('  TEST RUNTIME — MIGRATION 098 (product_variants_read)')
  console.log('  branche: feat/variants-step1')
  console.log('========================================')
  console.log(`  URL: ${BASE_URL}`)
  console.log(`  TAG: ${TAG}`)

  // Vérification préalable : vue existe
  const viewCheck = psql(`SELECT to_regclass('public.product_variants_read')::text`)
  if (!viewCheck.ok || !viewCheck.output || viewCheck.output.trim() === '') {
    console.error('FATAL: vue product_variants_read introuvable — migration 098 non appliquée ?')
    process.exit(1)
  }
  console.log(`  Vue product_variants_read: ${viewCheck.output.trim()}`)

  // Vérification que la table de base existe
  const tableCheck = psql(`SELECT to_regclass('public.product_variants')::text`)
  if (!tableCheck.ok || !tableCheck.output || tableCheck.output.trim() === '') {
    console.error('FATAL: table product_variants introuvable — migration 096 non appliquée ?')
    process.exit(1)
  }
  console.log(`  Table product_variants: ${tableCheck.output.trim()}`)

  let ids = null
  let affiliateToken = null

  try {
    // Seed + utilisateur affiliate pour les tests REST
    ids = await scenario1_seed()
    if (!ids) throw new Error('seed KO — arrêt')

    const affiliate = await createAuthUser('affiliate', 'aff-098')
    affiliateToken = await signIn(affiliate.email)

    await scenario2_filtrage(ids)
    await scenario3_lectureClient(ids, affiliateToken)
    await scenario4_ecritureBloquee(ids, affiliateToken)
    await scenario5_tableBaseStaffOnly(ids, affiliateToken)
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
    const icon = r.verdict === 'PASS' ? 'PASS' : 'FAIL'
    console.log(`  ${icon} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
  }
  console.log(`\n  TOTAL: ${passed} PASS / ${failed} FAIL (sur ${results.length})`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
