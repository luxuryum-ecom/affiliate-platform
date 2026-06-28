#!/usr/bin/env node
/**
 * seed-7a-test-local.mjs — Seed LOCAL uniquement pour les tests Étape 7-A
 * (badge/texte dispo par variante) et les réserves R1/R2/R3.
 *
 * Crée :
 *   - 1 produit "7A" avec 3 variantes (S=50, M=3, L=0) pour la R2
 *   - 1 utilisateur affilié + 1 utilisateur grossiste
 *   - Sauvegarde les IDs dans un fichier JSON lu par le spec 7a
 *
 * RÈGLES ABSOLUES :
 *   #7 — Aucun secret en dur. Clés lues via supabase status.
 *   #8 — assertLocalSupabase() refuse de tourner hors 127.0.0.1:54321.
 *
 * Usage :
 *   node scripts/seed-7a-test-local.mjs --seed
 *   node scripts/seed-7a-test-local.mjs --teardown
 */
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Garde-fou local ──────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `REFUS: seed 7a pointé sur une base NON-LOCALE (URL=${url || 'absente'}). ` +
      `Lance « supabase start » et utilise les clés LOCALES.`
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

const { url: BASE_URL, serviceKey: SERVICE_KEY } = getLocalSupabaseEnv()
console.log(`[GARDE-FOU 7A] URL locale confirmée : ${BASE_URL}`)

// ── Seeds file path (courant de la session) ──────────────────────────────────
const SEEDS_FILE = resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/74b95942-f54a-4423-b77d-2c4d74835ef1/scratchpad/7a-seed-ids.json'
)

// ── REST helpers ─────────────────────────────────────────────────────────────
async function rest(method, path, body, prefer = 'return=representation') {
  const res = await fetch(`${BASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

async function restAuth(method, path, body) {
  const res = await fetch(`${BASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

// ── User helpers ─────────────────────────────────────────────────────────────
const TEST_PWD = 'Test7a2026!'
const TAG = `7a-${Date.now()}`

async function findUserByEmail(email) {
  const r = await restAuth('GET', '/admin/users?per_page=200')
  const users = Array.isArray(r.body?.users) ? r.body.users : (Array.isArray(r.body) ? r.body : [])
  return users.find((u) => u.email === email) ?? null
}

async function ensureUser(email, role, extraProfile = {}) {
  const existing = await findUserByEmail(email)
  let userId
  if (existing) {
    userId = existing.id
    console.log(`  [SEED] Utilisateur ${email} déjà existant (${userId})`)
    // Mettre à jour le profil au cas où
    await rest('PATCH', `/profiles?id=eq.${userId}`, { role, status: 'approved', ...extraProfile }, 'return=minimal')
  } else {
    const r = await restAuth('POST', '/admin/users', { email, password: TEST_PWD, email_confirm: true })
    if (!r.body?.id) throw new Error(`Création user ${email} échouée : ${JSON.stringify(r.body)}`)
    userId = r.body.id
    console.log(`  [SEED] Utilisateur ${email} créé (${userId})`)
    // Insérer/mettre à jour le profil
    const existing2 = await rest('GET', `/profiles?id=eq.${userId}&select=id`)
    if (!existing2.body?.length) {
      const prof = await rest('POST', '/profiles', {
        id: userId,
        role,
        full_name: `Test 7A ${role}`,
        status: 'approved',
        ...extraProfile,
      })
      if (prof.status >= 400) throw new Error(`Profile ${role} KO : ${JSON.stringify(prof.body)}`)
    } else {
      await rest('PATCH', `/profiles?id=eq.${userId}`, { role, status: 'approved', ...extraProfile }, 'return=minimal')
    }
  }
  return { id: userId, email }
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n=== SEED 7A LOCAL ===')
  console.log(`  TAG : ${TAG}`)

  // 1. Créer le produit avec stock=0 (pas de mouvement ledger à l'INSERT)
  const prodR = await rest('POST', '/products', {
    name:                  `[7A] ${TAG}`,
    sell_price:            200,
    commission_amount:     45,
    stock_count:           0,   // => updated after variants
    images:                [],
    active:                true,
    affiliate_enabled:     true,
    approval_status:       'approved',
    availability_type:     'local_stock',
    factory_cost_mad:      100,
    platform_margin_type:  'percentage',
    platform_margin_value: 30,
    packaging_fee_mad:     10,
    confirmation_fee_mad:  10,
    delivery_fee_mad:      35,
    wholesale_min_qty:     10,
    wholesale_tiers:       [],  // pas de paliers → pas de badge "Paliers"
  })
  if (prodR.status >= 400) throw new Error(`Produit KO : HTTP ${prodR.status} ${JSON.stringify(prodR.body)}`)
  const product = Array.isArray(prodR.body) ? prodR.body[0] : prodR.body
  const productId = product.id
  console.log(`  [SEED] Produit créé : ${productId}`)

  // 2. Attendre que le trigger products_ensure_default_variant crée la variante défaut
  await new Promise((r) => setTimeout(r, 500))

  // 3. Récupérer la variante défaut auto-créée
  const vDefR = await rest('GET', `/product_variants?product_id=eq.${productId}&is_default=eq.true&select=id,stock_count`)
  const vDef = Array.isArray(vDefR.body) ? vDefR.body[0] : null
  if (!vDef) throw new Error('Variante défaut non créée par trigger')
  const variantSId = vDef.id
  console.log(`  [SEED] Variante défaut trouvée : ${variantSId}`)

  // 4. Mettre à jour la variante défaut : attributes={taille:S}, stock=50
  //    (UPDATE n'est pas tracé dans stock_movements — SANS mouvement ledger)
  //    IMPORTANT : passer un objet JavaScript brut (pas JSON.stringify) pour que
  //    PostgREST stocke un JSONB object, pas un JSONB string.
  const upS = await rest('PATCH', `/product_variants?id=eq.${variantSId}`,
    { attributes: { taille: 'S' }, stock_count: 50 }, 'return=minimal')
  if (upS.status >= 400) throw new Error(`Update variante S KO : ${JSON.stringify(upS.body)}`)
  console.log('  [SEED] Variante S (50) mise à jour')

  // 5. Insérer variante M : stock=3
  const vMR = await rest('POST', '/product_variants', {
    product_id:  productId,
    attributes:  { taille: 'M' },
    stock_count: 3,
    is_default:  false,
    active:      true,
  })
  if (vMR.status >= 400) throw new Error(`Variante M KO : ${JSON.stringify(vMR.body)}`)
  const vM = Array.isArray(vMR.body) ? vMR.body[0] : vMR.body
  const variantMId = vM.id
  console.log(`  [SEED] Variante M (3) créée : ${variantMId}`)

  // 6. Insérer variante L : stock=0
  const vLR = await rest('POST', '/product_variants', {
    product_id:  productId,
    attributes:  { taille: 'L' },
    stock_count: 0,
    is_default:  false,
    active:      true,
  })
  if (vLR.status >= 400) throw new Error(`Variante L KO : ${JSON.stringify(vLR.body)}`)
  const vL = Array.isArray(vLR.body) ? vLR.body[0] : vLR.body
  const variantLId = vL.id
  console.log(`  [SEED] Variante L (0) créée : ${variantLId}`)

  // 7. Mettre à jour product.stock_count = 50+3+0 = 53 (invariant I1)
  const upProd = await rest('PATCH', `/products?id=eq.${productId}`,
    { stock_count: 53 }, 'return=minimal')
  if (upProd.status >= 400) throw new Error(`Update product stock KO : ${JSON.stringify(upProd.body)}`)
  console.log('  [SEED] product.stock_count = 53 (I1 maintenu : 50+3+0)')

  // 8. Créer l'affilié
  const affiliateEmail = `7a-affiliate-${TAG}@test.local`
  const affiliate = await ensureUser(affiliateEmail, 'affiliate')
  console.log(`  [SEED] Affilié : ${affiliate.email}`)

  // 9. Créer le grossiste
  const wholesalerEmail = `7a-wholesaler-${TAG}@test.local`
  const wholesaler = await ensureUser(wholesalerEmail, 'wholesaler', { wholesale_access: true })
  console.log(`  [SEED] Grossiste : ${wholesaler.email}`)

  // 10. Vérifier I1
  const i1R = await rest('GET',
    `/products?id=eq.${productId}&select=stock_count`)
  const prodStock = Array.isArray(i1R.body) ? i1R.body[0]?.stock_count : null
  const vSumR = await rest('GET',
    `/product_variants?product_id=eq.${productId}&active=eq.true&select=stock_count`)
  const vSum = Array.isArray(vSumR.body)
    ? vSumR.body.reduce((s, v) => s + (v.stock_count ?? 0), 0)
    : null
  console.log(`  [I1] product.stock_count=${prodStock} SUM(variants.active)=${vSum} écart=${prodStock - vSum}`)
  if (prodStock !== vSum) {
    console.warn(`  [WARN] I1 écart=${prodStock - vSum} — stock_count produit ne reflète pas SUM des variantes actives`)
  }

  // 11. Sauvegarder les IDs
  const dir = SEEDS_FILE.substring(0, SEEDS_FILE.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })

  const seeds = {
    tag:               TAG,
    productId,
    variantIds: {
      S: variantSId,
      M: variantMId,
      L: variantLId,
    },
    affiliateEmail,
    affiliatePassword: TEST_PWD,
    wholesalerEmail,
    wholesalerPassword: TEST_PWD,
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seeds, null, 2), 'utf8')
  console.log(`\n  [SEED] Fichier seeds sauvegardé : ${SEEDS_FILE}`)
  console.log(`  [SEED] productId=${productId}`)
  console.log(`  [SEED] variantS=${variantSId} variantM=${variantMId} variantL=${variantLId}`)
  console.log('=== SEED 7A OK ===\n')
  return seeds
}

// ── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
  console.log('\n=== TEARDOWN 7A LOCAL ===')
  if (!existsSync(SEEDS_FILE)) {
    console.log('  Aucun fichier seeds — rien à nettoyer.')
    return
  }
  const seeds = JSON.parse(readFileSync(SEEDS_FILE, 'utf8'))

  // Supprimer product_variants (FK product_id)
  const pvR = await rest('DELETE', `/product_variants?product_id=eq.${seeds.productId}`, undefined, 'return=minimal')
  console.log(`  [TEARDOWN] product_variants DELETE HTTP ${pvR.status}`)

  // Supprimer le produit
  const pR = await rest('DELETE', `/products?id=eq.${seeds.productId}`, undefined, 'return=minimal')
  console.log(`  [TEARDOWN] products DELETE HTTP ${pR.status}`)

  // Supprimer les utilisateurs
  for (const email of [seeds.affiliateEmail, seeds.wholesalerEmail]) {
    const existing = await findUserByEmail(email)
    if (existing) {
      const delR = await restAuth('DELETE', `/admin/users/${existing.id}`)
      console.log(`  [TEARDOWN] user ${email} DELETE HTTP ${delR.status}`)
    }
  }

  console.log('=== TEARDOWN 7A OK ===\n')
}

// ── Main ─────────────────────────────────────────────────────────────────────
const arg = process.argv[2]
if (arg === '--seed') {
  seed().catch((e) => { console.error('[SEED ERROR]', e.message); process.exit(1) })
} else if (arg === '--teardown') {
  teardown().catch((e) => { console.error('[TEARDOWN ERROR]', e.message); process.exit(1) })
} else {
  console.error('Usage: node scripts/seed-7a-test-local.mjs --seed | --teardown')
  process.exit(1)
}
