#!/usr/bin/env node
/**
 * seed-niche-test-buyers.mjs — INFRA DE TEST (lot vitrine grossiste intelligente).
 *
 * Crée 2 grossistes de test JETABLES avec des niches DIFFÉRENTES (via panier seedé)
 * pour prouver en runtime l'isolation inter-grossistes + la personnalisation :
 *   - Buyer A → panier de produits "Textile"            → niche attendue = Textile
 *   - Buyer B → panier de produits "Cosmétique & hygiène" → niche attendue = Cosmétique & hygiène
 *   - (le compte smoke wholesale, non touché, reste en cold-start → bannière générique)
 *
 * SÉCURITÉ : clés via process.env (.env.local), jamais en dur. Les comptes créés sont
 * des comptes de TEST jetables (mozouna.test) supprimés par `--teardown`.
 *
 * Usage :
 *   node scripts/seed-niche-test-buyers.mjs --seed
 *   node scripts/seed-niche-test-buyers.mjs --teardown
 */
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) {
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

const U = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const K = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!U || !K) { console.error('FATAL : env manquant'); process.exit(1) }

// Mot de passe de TEST jetable (compte mozouna.test). Surchargable par env.
const TEST_PWD = process.env.NICHE_TEST_PASSWORD ?? 'NicheTest2026!'

const BUYERS = [
  { key: 'A', email: 'niche-test-a@mozouna.test', name: 'Test Niche A (Textile)',   category: 'Textile' },
  { key: 'B', email: 'niche-test-b@mozouna.test', name: 'Test Niche B (Cosmétique)', category: 'Cosmétique & hygiène' },
]

const mode = process.argv.includes('--teardown') ? 'teardown' : process.argv.includes('--seed') ? 'seed' : null
if (!mode) { console.error('Préciser --seed ou --teardown'); process.exit(1) }

async function rest(method, path, body, prefer) {
  const res = await fetch(`${U}${path}`, {
    method,
    headers: {
      apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json; try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: res.status, body: json }
}

async function findUserByEmail(email) {
  // admin list (paginated) → match email
  const r = await rest('GET', `/auth/v1/admin/users?per_page=200`)
  const users = Array.isArray(r.body?.users) ? r.body.users : (Array.isArray(r.body) ? r.body : [])
  return users.find((u) => u.email === email) ?? null
}

async function ensureUser(email) {
  const existing = await findUserByEmail(email)
  if (existing) return existing.id
  const r = await rest('POST', '/auth/v1/admin/users', { email, password: TEST_PWD, email_confirm: true })
  if (!r.body?.id) throw new Error(`création user ${email} échouée : HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
  return r.body.id
}

async function productIdsForCategory(category, limit = 3) {
  const r = await rest('GET', `/rest/v1/products_public_read?select=id,category&category=eq.${encodeURIComponent(category)}&limit=${limit}`)
  return Array.isArray(r.body) ? r.body.map((x) => x.id) : []
}

async function seed() {
  console.log(`\n[SEED] mot de passe test : ${TEST_PWD}\n`)
  for (const b of BUYERS) {
    const id = await ensureUser(b.email)
    // profil wholesaler
    const p = await rest('POST', '/rest/v1/profiles',
      { id, role: 'wholesaler', full_name: b.name },
      'resolution=merge-duplicates,return=minimal')
    // panier propre puis seed catégorie
    await rest('DELETE', `/rest/v1/wholesale_cart_items?buyer_id=eq.${id}`, undefined, 'return=minimal')
    const pids = await productIdsForCategory(b.category)
    for (const pid of pids) {
      await rest('POST', '/rest/v1/wholesale_cart_items',
        { buyer_id: id, product_id: pid, quantity: 10 }, 'return=minimal')
    }
    console.log(`[SEED] Buyer ${b.key}  ${b.email}  id=${id}  profil(HTTP ${p.status})  panier=${pids.length} produits "${b.category}"`)
  }
  console.log(`\n[SEED] FAIT. Identifiants runtime pour @tester :`)
  for (const b of BUYERS) console.log(`   Buyer ${b.key} (niche ${b.category}) : ${b.email} / ${TEST_PWD}`)
  console.log('')
}

async function teardown() {
  for (const b of BUYERS) {
    const u = await findUserByEmail(b.email)
    if (!u) { console.log(`[TEARDOWN] ${b.email} : absent`); continue }
    await rest('DELETE', `/rest/v1/wholesale_cart_items?buyer_id=eq.${u.id}`, undefined, 'return=minimal')
    await rest('DELETE', `/rest/v1/profiles?id=eq.${u.id}`, undefined, 'return=minimal')
    const d = await rest('DELETE', `/auth/v1/admin/users/${u.id}`)
    console.log(`[TEARDOWN] ${b.email} supprimé (auth HTTP ${d.status})`)
  }
  console.log('[TEARDOWN] FAIT.')
}

;(mode === 'seed' ? seed() : teardown()).catch((e) => { console.error('ERREUR :', e); process.exit(1) })
