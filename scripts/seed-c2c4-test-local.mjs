#!/usr/bin/env node
/**
 * seed-c2c4-test-local.mjs — Seed LOCAL uniquement pour prouver C2 (3 paliers fraîcheur)
 * et C4 (stock propre séparé) sur /wholesale/marketplace/[id].
 *
 * RÈGLE ABSOLUE : cible EXCLUSIVEMENT le Supabase local (127.0.0.1:54321).
 * Utilise getLocalSupabaseEnv() (lit `supabase status`) — JAMAIS .env.local.
 *
 * Usage :
 *   node scripts/seed-c2c4-test-local.mjs --seed
 *   node scripts/seed-c2c4-test-local.mjs --teardown
 */
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SEEDS_FILE = resolve('/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/31af7ae6-1fb4-4f87-b3de-dcc3f79488c4/scratchpad/c2c4-seed-ids.json')

// ── Garde-fou local ──────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `REFUS: seed pointé sur une base NON-LOCALE (URL=${url || 'absente'}). ` +
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

const { url: U, serviceKey: K } = getLocalSupabaseEnv()
console.log(`[GARDE-FOU] URL locale confirmée : ${U}`)

// ── REST helper ──────────────────────────────────────────────────────────────
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
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

const TEST_PWD = 'C2C4Test2026!'
const WHOLESALER_EMAIL = 'c2c4-wholesaler@mozouna.test'
const SUPPLIER_EMAIL = 'c2c4-supplier@mozouna.test'

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

  // Upsert profile — s'assure que le wholesaler a bien accès (status=approved + wholesale_access=true)
  // sans quoi l'app redirige vers la page de validation au lieu du marketplace.
  const profileBody = role === 'wholesaler'
    ? { id: userId, role, full_name: fullName, status: 'approved', wholesale_access: true }
    : { id: userId, role, full_name: fullName, status: 'approved' }
  const p = await rest('POST', '/rest/v1/profiles',
    profileBody,
    'resolution=merge-duplicates,return=minimal')
  console.log(`[SEED] Profil ${role} upsert HTTP ${p.status}`)

  return userId
}

async function seed() {
  console.log('\n[SEED] Démarrage seed C2/C4 — LOCAL UNIQUEMENT\n')

  // 1. Créer supplier
  const supplierId = await ensureUser(SUPPLIER_EMAIL, 'supplier', 'Test Supplier C2C4')

  // 2. Créer wholesaler
  const wholesalerId = await ensureUser(WHOLESALER_EMAIL, 'wholesaler', 'Test Wholesaler C2C4')

  const now = new Date()
  const daysAgo = (d) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString()

  // 3. Seeder les supplier_products (7 produits)
  const productsToSeed = [
    // C2 — 3 paliers fraîcheur
    {
      key: 'p1_frais',
      product_name: 'Produit C2 Frais (1j)',
      stock_quantity_updated_at: daysAgo(1),
      stock_quantity: 150,
    },
    {
      key: 'p2_surveiller',
      product_name: 'Produit C2 Surveiller (7j)',
      stock_quantity_updated_at: daysAgo(7),
      stock_quantity: 150,
    },
    {
      key: 'p3_confirmer',
      product_name: 'Produit C2 Confirmer (20j)',
      stock_quantity_updated_at: daysAgo(20),
      stock_quantity: 150,
    },
    // C4 — 4 cas
    {
      key: 'c4_casA',
      product_name: 'Produit C4 Cas A (propre+fournisseur)',
      stock_quantity_updated_at: daysAgo(1),
      stock_quantity: 150,
    },
    {
      key: 'c4_casB',
      product_name: 'Produit C4 Cas B (fournisseur seul)',
      stock_quantity_updated_at: daysAgo(1),
      stock_quantity: 150,
    },
    {
      key: 'c4_casC',
      product_name: 'Produit C4 Cas C (deux dispos)',
      stock_quantity_updated_at: daysAgo(1),
      stock_quantity: 80,
    },
    {
      key: 'c4_casD',
      product_name: 'Produit C4 Cas D (deux épuisés)',
      stock_quantity_updated_at: daysAgo(1),
      stock_quantity: 0,
    },
  ]

  const supplierProductIds = {}

  for (const prod of productsToSeed) {
    const r = await rest('POST', '/rest/v1/supplier_products',
      {
        supplier_id: supplierId,
        product_name: prod.product_name,
        category: 'Test C2C4',
        description: `Produit de test automatisé pour C2/C4 — ${prod.key}`,
        photos: [],
        min_quantity: 10,
        origin_country: 'Maroc',
        availability_type: 'local_stock',
        target_buyer_type: 'wholesaler',
        suggested_wholesale_price_mad: 10000, // 100 MAD en centimes
        approval_status: 'approved',
        supplier_type: 'morocco',
        unit: 'pièce',
        stock_quantity: prod.stock_quantity,
        stock_mode: 'manuel',
        stock_quantity_updated_at: prod.stock_quantity_updated_at,
      },
      'return=representation')

    if (!Array.isArray(r.body) || !r.body[0]?.id) {
      throw new Error(`Création supplier_product ${prod.key} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    }
    supplierProductIds[prod.key] = r.body[0].id
    console.log(`[SEED] supplier_product ${prod.key} créé : ${supplierProductIds[prod.key]}`)
  }

  // 4. Seeder les miroirs products pour C4 cas A, C, D
  const mirrorProductIds = {}

  const mirrorsToSeed = [
    {
      key: 'c4_casA',
      source_supplier_product_id: supplierProductIds['c4_casA'],
      stock_count: 50,
    },
    {
      key: 'c4_casC',
      source_supplier_product_id: supplierProductIds['c4_casC'],
      stock_count: 30,
    },
    {
      key: 'c4_casD',
      source_supplier_product_id: supplierProductIds['c4_casD'],
      stock_count: 0,
    },
  ]

  for (const mirror of mirrorsToSeed) {
    // Insert with stock_count=0 to avoid triggering stock_movements (append-only ledger
    // which would block teardown). Then PATCH to the real value.
    const r = await rest('POST', '/rest/v1/products',
      {
        name: `Miroir C4 ${mirror.key}`,
        description: `Produit miroir de test pour C4 ${mirror.key}`,
        sell_price: 15000,
        commission_amount: 2000,
        wholesale_tiers: [],
        wholesale_min_qty: 1,
        stock_count: 0,
        images: [],
        media: [],
        active: true,
        source_type: 'local_production',
        submitted_via: 'admin_dashboard',
        supplier_id: supplierId,
        supplier_name: 'Test Supplier C2C4',
        origin_country: 'Maroc',
        availability_type: 'local_stock',
        affiliate_enabled: false,
        approval_status: 'approved',
        confirmation_fee_mad: 500,
        packaging_fee_mad: 300,
        delivery_fee_mad: 2000,
        delivery_fee_config: {},
        purchase_price_mad: 8000,
        margin_percentage: 0,
        platform_margin_type: 'fixed',
        tariff_mode: 'global',
        category: 'Test C2C4',
        subcategory: 'Test',
        source_supplier_product_id: mirror.source_supplier_product_id,
      },
      'return=representation')

    if (!Array.isArray(r.body) || !r.body[0]?.id) {
      throw new Error(`Création mirror product ${mirror.key} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    }
    mirrorProductIds[mirror.key] = r.body[0].id

    // Now UPDATE stock_count to the real value (no trigger on UPDATE → no stock_movement → clean teardown)
    if (mirror.stock_count > 0) {
      const upd = await rest('PATCH', `/rest/v1/products?id=eq.${mirrorProductIds[mirror.key]}`,
        { stock_count: mirror.stock_count },
        'return=minimal')
      if (upd.status >= 300) {
        throw new Error(`Update stock_count ${mirror.key} échoué : HTTP ${upd.status} ${JSON.stringify(upd.body).slice(0, 200)}`)
      }
    }
    console.log(`[SEED] mirror product ${mirror.key} créé : ${mirrorProductIds[mirror.key]} (stock_count=${mirror.stock_count})`)
  }

  // C4 casB : PAS de miroir (stock propre absent → Sur commande)
  console.log('[SEED] C4 casB : aucun miroir créé (propre=absent → Sur commande attendu)')

  // 5. Sauvegarder les IDs
  const seedData = {
    supplierId,
    wholesalerId,
    wholesalerEmail: WHOLESALER_EMAIL,
    wholesalerPassword: TEST_PWD,
    supplierProductIds,
    mirrorProductIds,
    seededAt: now.toISOString(),
  }
  writeFileSync(SEEDS_FILE, JSON.stringify(seedData, null, 2))
  console.log(`\n[SEED] IDs sauvegardés dans ${SEEDS_FILE}`)
  console.log('\n[SEED] RÉSUMÉ :')
  console.log(`  Wholesaler : ${WHOLESALER_EMAIL} / ${TEST_PWD}`)
  console.log(`  C2 P1 frais (1j)      : /wholesale/marketplace/${supplierProductIds['p1_frais']}`)
  console.log(`  C2 P2 surveiller (7j) : /wholesale/marketplace/${supplierProductIds['p2_surveiller']}`)
  console.log(`  C2 P3 confirmer (20j) : /wholesale/marketplace/${supplierProductIds['p3_confirmer']}`)
  console.log(`  C4 casA (propre=50, fournisseur=150) : /wholesale/marketplace/${supplierProductIds['c4_casA']}`)
  console.log(`  C4 casB (propre=absent, fournisseur=150) : /wholesale/marketplace/${supplierProductIds['c4_casB']}`)
  console.log(`  C4 casC (propre=30, fournisseur=80) : /wholesale/marketplace/${supplierProductIds['c4_casC']}`)
  console.log(`  C4 casD (propre=0, fournisseur=0) : /wholesale/marketplace/${supplierProductIds['c4_casD']}`)
  console.log('\n[SEED] FAIT.\n')
}

async function teardown() {
  if (!existsSync(SEEDS_FILE)) {
    console.log('[TEARDOWN] Fichier de seeds introuvable — rien à nettoyer')
    return
  }
  const data = JSON.parse(readFileSync(SEEDS_FILE, 'utf8'))

  // Supprimer les mirror products (avec leurs product_variants — la FK cascade)
  // Note: si stock_count=0 au moment de l'INSERT, pas de stock_movement créé → delete OK
  for (const [key, id] of Object.entries(data.mirrorProductIds ?? {})) {
    // D'abord les product_variants liés (FK sur product_id)
    const pv = await rest('DELETE', `/rest/v1/product_variants?product_id=eq.${id}`, undefined, 'return=minimal')
    console.log(`[TEARDOWN] product_variants for ${key} HTTP ${pv.status}`)
    const r = await rest('DELETE', `/rest/v1/products?id=eq.${id}`, undefined, 'return=minimal')
    if (r.status >= 300 && r.body?.code === '23503') {
      console.log(`[TEARDOWN] mirror product ${key} non supprimé (FK constraint — stock_movements) : marqué inactif`)
      await rest('PATCH', `/rest/v1/products?id=eq.${id}`, { active: false, approval_status: 'rejected' }, 'return=minimal')
    } else {
      console.log(`[TEARDOWN] mirror product ${key} (${id}) supprimé HTTP ${r.status}`)
    }
  }

  // Supprimer les supplier_products
  for (const [key, id] of Object.entries(data.supplierProductIds ?? {})) {
    const r = await rest('DELETE', `/rest/v1/supplier_products?id=eq.${id}`, undefined, 'return=minimal')
    console.log(`[TEARDOWN] supplier_product ${key} (${id}) supprimé HTTP ${r.status}`)
  }

  // Supprimer les users
  for (const email of [WHOLESALER_EMAIL, SUPPLIER_EMAIL]) {
    const u = await findUserByEmail(email)
    if (!u) { console.log(`[TEARDOWN] ${email} : absent`); continue }
    await rest('DELETE', `/rest/v1/profiles?id=eq.${u.id}`, undefined, 'return=minimal')
    const d = await rest('DELETE', `/auth/v1/admin/users/${u.id}`)
    console.log(`[TEARDOWN] ${email} supprimé (HTTP ${d.status})`)
  }

  // Supprimer le fichier de seeds
  const { unlinkSync } = await import('node:fs')
  unlinkSync(SEEDS_FILE)
  console.log('[TEARDOWN] FAIT.')
}

const mode = process.argv.includes('--teardown') ? 'teardown' : process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed ou --teardown'); process.exit(1) }
;(mode === 'seed' ? seed() : teardown()).catch((e) => { console.error('ERREUR :', e.message); process.exit(1) })
