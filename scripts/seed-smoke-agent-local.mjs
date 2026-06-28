#!/usr/bin/env node
/**
 * seed-smoke-agent-local.mjs — Crée/garantit un AGENT de test LOCAL stable
 * (rôle agent, status approved, non banni) pour les specs opt-in :
 *   - e2e/roles-2-etages-v2.spec.ts   (playwright.roles.config.ts)
 *   - e2e/sourcing-affectation.spec.ts (playwright.sourcing.config.ts)
 *
 * Remplace l'ancien agent-demo@affipartner.ma banni par la mig 103.
 *
 * RÈGLE ABSOLUE #8 : cible EXCLUSIVEMENT le Supabase LOCAL (127.0.0.1:54321).
 * Lit les clés via `supabase status` — JAMAIS .env.local (qui pointe la prod).
 * RÈGLE #7 : le mot de passe ci-dessous est un identifiant LOCAL JETABLE (compte
 * de test qui ne peut atteindre la prod grâce au garde-fou), pas un vrai secret.
 *
 * Usage :
 *   node scripts/seed-smoke-agent-local.mjs            # crée/garantit l'agent
 *   node scripts/seed-smoke-agent-local.mjs --teardown # supprime l'agent de test
 *
 * En sortie : les 3 valeurs à coller dans .env.local (SMOKE_AGENT_*).
 */
import { execSync } from 'node:child_process'

// ── Identité de l'agent de test LOCAL ────────────────────────────────────────
const AGENT_EMAIL = 'smoke-agent@test.local'
const TEST_PWD = 'SmokeAgent2026!' // identifiant LOCAL jetable (cf. en-tête, règle #7)
const FULL_NAME = 'Smoke Agent (test local)'

// ── Garde-fou local (incident 2026-06-24) ───────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
function assertLocalSupabase(url) {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`REFUS: seed pointé sur une base NON-LOCALE (URL=${url || 'absente'}). Lance « supabase start ».`)
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

const { url: URL_BASE, serviceKey: SERVICE_KEY } = getLocalSupabaseEnv()
assertLocalSupabase(URL_BASE)
if (!SERVICE_KEY) throw new Error('REFUS: SERVICE_ROLE_KEY local introuvable via supabase status.')

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
async function rest(method, path, body, prefer) {
  const headers = { ...H }
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${URL_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const txt = await r.text()
  let json = null
  try { json = txt ? JSON.parse(txt) : null } catch { json = txt }
  return { status: r.status, body: json }
}

async function findUserByEmail(email) {
  const r = await rest('GET', `/auth/v1/admin/users?per_page=200`)
  const users = Array.isArray(r.body?.users) ? r.body.users : []
  return users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
}

const teardown = process.argv.includes('--teardown')

if (teardown) {
  const u = await findUserByEmail(AGENT_EMAIL)
  if (!u) { console.log(`[TEARDOWN] ${AGENT_EMAIL} absent — rien à faire.`); process.exit(0) }
  await rest('DELETE', `/rest/v1/agent_countries?agent_id=eq.${u.id}`, undefined, 'return=minimal')
  await rest('DELETE', `/rest/v1/staff_permissions?user_id=eq.${u.id}`, undefined, 'return=minimal')
  await rest('DELETE', `/rest/v1/profiles?id=eq.${u.id}`, undefined, 'return=minimal')
  const d = await rest('DELETE', `/auth/v1/admin/users/${u.id}`)
  console.log(`[TEARDOWN] ${AGENT_EMAIL} supprimé (HTTP ${d.status}).`)
  process.exit(0)
}

// ── Créer/garantir l'utilisateur auth ────────────────────────────────────────
let user = await findUserByEmail(AGENT_EMAIL)
if (!user) {
  const c = await rest('POST', '/auth/v1/admin/users', { email: AGENT_EMAIL, password: TEST_PWD, email_confirm: true })
  if (!c.body?.id) throw new Error(`Création user échouée : HTTP ${c.status} ${JSON.stringify(c.body).slice(0, 200)}`)
  user = c.body
  console.log(`[SEED] User agent créé : ${AGENT_EMAIL}`)
} else {
  // garantir non banni + mot de passe connu (idempotent)
  await rest('PUT', `/auth/v1/admin/users/${user.id}`, { password: TEST_PWD, ban_duration: 'none', email_confirm: true })
  console.log(`[SEED] User agent déjà présent : ${AGENT_EMAIL} (réactivé/non banni).`)
}

// ── Upsert profil rôle=agent, status=approved ────────────────────────────────
const p = await rest('POST', '/rest/v1/profiles',
  { id: user.id, role: 'agent', full_name: FULL_NAME, status: 'approved' },
  'resolution=merge-duplicates,return=minimal')
if (p.status >= 300) throw new Error(`Upsert profil échoué : HTTP ${p.status} ${JSON.stringify(p.body).slice(0, 200)}`)
console.log(`[SEED] Profil agent approved upsert (HTTP ${p.status}).`)

console.log('\n──────────────────────────────────────────────────────────')
console.log('Agent de test LOCAL prêt. À coller dans .env.local (par Abdou) :')
console.log(`  SMOKE_AGENT_EMAIL=${AGENT_EMAIL}`)
console.log(`  SMOKE_AGENT_PASSWORD=${TEST_PWD}`)
console.log(`  SMOKE_AGENT_ID=${user.id}`)
console.log('──────────────────────────────────────────────────────────')
