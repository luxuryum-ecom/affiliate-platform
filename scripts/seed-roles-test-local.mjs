#!/usr/bin/env node
/**
 * seed-roles-test-local.mjs — Seed LOCAL pour les specs roles-2-etages-v2
 * et sourcing-affectation (préconditions de données).
 *
 * RÈGLE ABSOLUE #8 : cible EXCLUSIVEMENT le Supabase LOCAL (127.0.0.1:54321).
 * Clés lues via `supabase status` — JAMAIS .env.local (prod).
 * RÈGLE #7 : mots de passe LOCAL JETABLE uniquement (comptes non-prod).
 *
 * Ce script crée/garantit :
 *   1. Admin local (pour scénarios A/B/C/H/I/SC3/SC4)
 *   2. Agent "Agent Démo" (full_name attendu par le test A)
 *   3. Produit avec UUID fixe (pour ensureCodOrderExists dans D/G)
 *   4. Commande affiliée avec UUID fixe (pour tests E/F)
 *   5. Données sourcing (Lunettes test-CN, Tapis test-TR, ti shirt en maille)
 *
 * Usage :
 *   node scripts/seed-roles-test-local.mjs            # setup
 *   node scripts/seed-roles-test-local.mjs --teardown # cleanup
 */
import { execSync } from 'node:child_process'

// ── Identités de test LOCAL ───────────────────────────────────────────────────
const ADMIN_EMAIL      = 'smoke-admin@test.local'
const ADMIN_PWD        = 'SmokeAdmin2026!'
const SMOKE_AGENT_ID   = 'e0a39509-a546-46e6-b5f6-7d5009ce2851' // déjà seedé
// ID du staff-100 pré-existant (v100 smoke) — status mis à 'pending' pour ne pas
// parasiter /admin/permissions et /admin/sourcing/agents (qui filtrent status='approved').
// Restauré en teardown.
const STAFF_100_ID = '45b2e119-8e64-496f-8295-3b4295e7bdec'

// UUIDs FIXES attendus par les specs (ne pas changer)
const PRODUCT_COD_ID      = '44507d4e-9fef-4dd9-b77f-c2a3a217011d'
const AFFILIATE_ORDER_ID  = '88c25be9-e69b-42cc-b44f-fba9a7dd6d7b'

// ── Garde-fou local (incident 2026-06-24) ────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`REFUS: seed pointé sur une base NON-LOCALE (URL=${url || 'absente'}).`)
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
  const pick = (key) => (out.match(new RegExp(`^${key}="?(.*?)"?$`, 'm'))?.[1] ?? '').trim()
  return { url: pick('API_URL'), serviceKey: pick('SERVICE_ROLE_KEY') }
}

const { url: BASE, serviceKey: KEY } = getLocalSupabaseEnv()
assertLocalSupabase(BASE)
if (!KEY) throw new Error('REFUS: SERVICE_ROLE_KEY local introuvable.')

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(method, path, body, prefer) {
  const headers = { ...H }
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await r.text()
  let json = null
  try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: r.status, body: json }
}

async function findUserByEmail(email) {
  const r = await rest('GET', '/auth/v1/admin/users?per_page=200')
  const users = Array.isArray(r.body?.users) ? r.body.users : []
  return users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
}

async function ensureUser(email, pwd, role, fullName) {
  let user = await findUserByEmail(email)
  if (!user) {
    const c = await rest('POST', '/auth/v1/admin/users', {
      email, password: pwd, email_confirm: true,
    })
    if (!c.body?.id) throw new Error(`Création user ${email} échouée: HTTP ${c.status} ${JSON.stringify(c.body).slice(0, 200)}`)
    user = c.body
    console.log(`[SEED] User créé : ${email} (${user.id})`)
  } else {
    await rest('PUT', `/auth/v1/admin/users/${user.id}`, {
      password: pwd, ban_duration: 'none', email_confirm: true,
    })
    console.log(`[SEED] User déjà présent : ${email} (réactivé)`)
  }
  // Upsert profil
  const p = await rest('POST', '/rest/v1/profiles',
    { id: user.id, role, full_name: fullName, status: 'approved' },
    'resolution=merge-duplicates,return=minimal')
  if (p.status >= 300) throw new Error(`Profil ${email} échoué: HTTP ${p.status} ${JSON.stringify(p.body).slice(0, 200)}`)
  console.log(`[SEED] Profil ${role} upsert OK (HTTP ${p.status})`)
  return user
}

async function seed() {
  console.log('\n[SEED] Démarrage seed roles-test — LOCAL UNIQUEMENT\n')

  // ── 1. Admin ─────────────────────────────────────────────────────────────────
  const admin = await ensureUser(ADMIN_EMAIL, ADMIN_PWD, 'admin', 'Admin Test Local')
  console.log(`[SEED] Admin: ${ADMIN_EMAIL} / ${ADMIN_PWD} (id=${admin.id})`)

  // ── 2. Smoke agent → full_name='Agent Démo' (attendu par test A via text=Agent Démo) ──
  // On met à jour le full_name du smoke agent (déjà existant via seed-smoke-agent-local.mjs).
  // Cela lui donne le nom visible dans /admin/permissions et /admin/sourcing/agents.
  const agentNameUpdate = await rest('PATCH',
    `/rest/v1/profiles?id=eq.${SMOKE_AGENT_ID}`,
    { full_name: 'Agent Démo' },
    'return=minimal')
  if (agentNameUpdate.status >= 300) {
    console.warn(`[SEED] Mise à jour full_name smoke agent: HTTP ${agentNameUpdate.status} ${JSON.stringify(agentNameUpdate.body).slice(0, 200)}`)
  } else {
    console.log('[SEED] Smoke agent full_name → "Agent Démo"')
  }

  // ── 2b. staff-100 pré-existant → status='pending' pour ne PAS apparaître dans
  //        /admin/permissions et /admin/sourcing/agents (filtrent status='approved').
  //        Évite le strict-mode-violation (3 "Chine" checkboxes) dans SC3/SC4.
  const s100Update = await rest('PATCH',
    `/rest/v1/profiles?id=eq.${STAFF_100_ID}`,
    { status: 'pending' },
    'return=minimal')
  console.log(`[SEED] staff-100 status → 'pending' (HTTP ${s100Update.status}) [restauré en teardown]`)

  // ── 3. Produit avec UUID fixe (pour COD test D/G) ────────────────────────────
  // Vérifier s'il existe déjà
  const existP = await rest('GET', `/rest/v1/products?id=eq.${PRODUCT_COD_ID}&select=id,name,stock_count`)
  const productExists = Array.isArray(existP.body) && existP.body.length > 0
  if (productExists) {
    console.log(`[SEED] Produit COD déjà présent: ${existP.body[0].name} (stock=${existP.body[0].stock_count})`)
    // S'assurer que le stock est > 0 (confirm_cod_order appelle reserve_stock)
    if ((existP.body[0].stock_count ?? 0) < 5) {
      await rest('PATCH', `/rest/v1/products?id=eq.${PRODUCT_COD_ID}`,
        { stock_count: 100 }, 'return=minimal')
      console.log('[SEED] Stock product COD remonté à 100')
    }
  } else {
    // Créer le produit avec l'UUID exact
    const pCreate = await rest('POST', '/rest/v1/products',
      {
        id: PRODUCT_COD_ID,
        name: 'Produit Test COD (rôles)',
        description: 'Produit de test pour les specs roles-2-etages-v2',
        sell_price: 29900,        // 299 MAD en centimes
        commission_amount: 0,
        wholesale_tiers: [],
        wholesale_min_qty: 1,
        stock_count: 100,
        images: [],
        media: [],
        active: true,
        source_type: 'local_production',
        submitted_via: 'admin_dashboard',
        supplier_name: 'Test Local',
        origin_country: 'MA',
        availability_type: 'local_stock',
        affiliate_enabled: true,
        approval_status: 'approved',
        confirmation_fee_mad: 0,
        packaging_fee_mad: 0,
        delivery_fee_mad: 0,
        delivery_fee_config: {},
        purchase_price_mad: 0,
        margin_percentage: 0,
        platform_margin_type: 'fixed',
        tariff_mode: 'global',
        category: 'Test',
        subcategory: 'Test',
      },
      'return=representation')
    if (!Array.isArray(pCreate.body) || !pCreate.body[0]?.id) {
      throw new Error(`Création produit COD échouée: HTTP ${pCreate.status} ${JSON.stringify(pCreate.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Produit COD créé: ${PRODUCT_COD_ID}`)
  }

  // ── 4. Commande affiliée avec UUID fixe (pour tests E/F) ─────────────────────
  const existO = await rest('GET', `/rest/v1/orders?id=eq.${AFFILIATE_ORDER_ID}&select=id,status,affiliate_id`)
  const orderExists = Array.isArray(existO.body) && existO.body.length > 0
  if (orderExists) {
    console.log(`[SEED] Commande affiliée déjà présente: status=${existO.body[0].status}`)
    // La remettre en pending_confirmation si nécessaire
    if (existO.body[0].status !== 'pending_confirmation') {
      await rest('PATCH', `/rest/v1/orders?id=eq.${AFFILIATE_ORDER_ID}`,
        { status: 'pending_confirmation', confirmed_at: null }, 'return=minimal')
      console.log('[SEED] Commande affiliée remise en pending_confirmation')
    }
  } else {
    // Créer la commande affiliée avec l'UUID exact
    const oCreate = await rest('POST', '/rest/v1/orders',
      {
        id: AFFILIATE_ORDER_ID,
        affiliate_id: SMOKE_AGENT_ID, // smoke-agent@test.local comme "affilié"
        product_id: PRODUCT_COD_ID,
        customer_name: 'TEST AFFILIÉ SPECS',
        customer_phone: '0600000002',
        customer_city: 'Rabat',
        customer_address: '456 test avenue',
        quantity: 1,
        total_amount: 299,
        commission_amount: 0,
        status: 'pending_confirmation',
        affiliate_commission_mad_snapshot: 0,
      },
      'return=minimal')
    if (oCreate.status >= 300) {
      throw new Error(`Création commande affiliée échouée: HTTP ${oCreate.status} ${JSON.stringify(oCreate.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Commande affiliée créée: ${AFFILIATE_ORDER_ID}`)
  }

  // ── 5. Données sourcing (pour sourcing-affectation.spec.ts) ──────────────────
  // Wholesaler (pour FK wholesaler_id sur sourcing_requests)
  const wholesalerEmail = 'smoke-wholesaler@test.local'
  const wholesalerPwd   = 'SmokeWholesaler2026!'
  const wholesaler = await ensureUser(wholesalerEmail, wholesalerPwd, 'wholesaler', 'Wholesaler Test Local')
  // Mise à jour profil wholesaler avec wholesale_access=true
  await rest('PATCH', `/rest/v1/profiles?id=eq.${wholesaler.id}`,
    { wholesale_access: true }, 'return=minimal')
  console.log(`[SEED] Wholesaler: ${wholesalerEmail}`)

  // Vérifier/créer les sourcing_requests pour les tests
  const srExisting = await rest('GET', `/rest/v1/sourcing_requests?wholesaler_id=eq.${wholesaler.id}&select=id,product_name,target_country_code`)
  const existing = Array.isArray(srExisting.body) ? srExisting.body : []
  const existingNames = new Set(existing.map(r => r.product_name))

  const sourcing = [
    { product_name: 'Lunettes test-CN', target_country_code: 'CN', target_country: 'Chine' },
    { product_name: 'Tapis test-TR',    target_country_code: 'TR', target_country: 'Turquie' },
    { product_name: 'ti shirt en maille', target_country_code: 'TR', target_country: 'Turquie' },
  ]

  for (const sr of sourcing) {
    if (existingNames.has(sr.product_name)) {
      console.log(`[SEED] Sourcing "${sr.product_name}" déjà présent`)
      continue
    }
    const r = await rest('POST', '/rest/v1/sourcing_requests',
      {
        wholesaler_id:        wholesaler.id,
        product_name:         sr.product_name,
        category:             'Test',
        quantity:             10,
        target_budget_mad:    1000,
        target_country:       sr.target_country,
        target_country_code:  sr.target_country_code,
        status:               'pending',
      },
      'return=minimal')
    if (r.status >= 300) {
      throw new Error(`Création sourcing "${sr.product_name}" échouée: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    }
    console.log(`[SEED] Sourcing "${sr.product_name}" (${sr.target_country_code}) créé`)
  }

  console.log('\n──────────────────────────────────────────────────────────')
  console.log('Seed LOCAL terminé. Variables pour le run :')
  console.log(`  SMOKE_ADMIN_EMAIL=${ADMIN_EMAIL}`)
  console.log(`  SMOKE_ADMIN_PASSWORD=${ADMIN_PWD}`)
  console.log(`  SMOKE_AGENT_EMAIL=smoke-agent@test.local`)
  console.log(`  SMOKE_AGENT_PASSWORD=SmokeAgent2026!`)
  console.log(`  SMOKE_AGENT_ID=${SMOKE_AGENT_ID}`)
  console.log('──────────────────────────────────────────────────────────\n')
}

async function teardown() {
  console.log('\n[TEARDOWN] Nettoyage seed roles-test — LOCAL\n')

  // Supprimer les commandes de test
  for (const oid of [AFFILIATE_ORDER_ID]) {
    const r = await rest('DELETE', `/rest/v1/orders?id=eq.${oid}`, undefined, 'return=minimal')
    console.log(`[TEARDOWN] order ${oid}: HTTP ${r.status}`)
  }

  // Supprimer le produit de test (seulement si pas de commandes dessus)
  const r = await rest('DELETE', `/rest/v1/products?id=eq.${PRODUCT_COD_ID}`, undefined, 'return=minimal')
  if (r.status >= 300) {
    console.log(`[TEARDOWN] produit ${PRODUCT_COD_ID}: non supprimé (FK?) → désactivé`)
    await rest('PATCH', `/rest/v1/products?id=eq.${PRODUCT_COD_ID}`, { active: false }, 'return=minimal')
  } else {
    console.log(`[TEARDOWN] produit COD supprimé: HTTP ${r.status}`)
  }

  // Supprimer les sourcing_requests de test
  for (const email of ['smoke-wholesaler@test.local']) {
    const u = await findUserByEmail(email)
    if (u) {
      await rest('DELETE', `/rest/v1/sourcing_requests?wholesaler_id=eq.${u.id}`, undefined, 'return=minimal')
      await rest('DELETE', `/rest/v1/profiles?id=eq.${u.id}`, undefined, 'return=minimal')
      await rest('DELETE', `/auth/v1/admin/users/${u.id}`)
      console.log(`[TEARDOWN] ${email} supprimé`)
    }
  }

  // Restaurer staff-100 à status='approved'
  await rest('PATCH', `/rest/v1/profiles?id=eq.${STAFF_100_ID}`, { status: 'approved' }, 'return=minimal')
  console.log('[TEARDOWN] staff-100 status restauré → approved')

  // Restaurer smoke agent full_name à sa valeur d'origine
  await rest('PATCH', `/rest/v1/profiles?id=eq.${SMOKE_AGENT_ID}`, { full_name: 'Smoke Agent (test local)' }, 'return=minimal')
  console.log('[TEARDOWN] smoke agent full_name restauré → Smoke Agent (test local)')

  // Supprimer admin
  for (const email of [ADMIN_EMAIL]) {
    const u = await findUserByEmail(email)
    if (!u) { console.log(`[TEARDOWN] ${email}: absent`); continue }
    await rest('DELETE', `/rest/v1/staff_permissions?user_id=eq.${u.id}`, undefined, 'return=minimal')
    await rest('DELETE', `/rest/v1/profiles?id=eq.${u.id}`, undefined, 'return=minimal')
    await rest('DELETE', `/auth/v1/admin/users/${u.id}`)
    console.log(`[TEARDOWN] ${email} supprimé`)
  }

  console.log('[TEARDOWN] Terminé.\n')
}

const teardownMode = process.argv.includes('--teardown')
;(teardownMode ? teardown() : seed())
  .catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
