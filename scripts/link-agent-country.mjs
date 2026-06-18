#!/usr/bin/env node
// ─── Lier un agent (commercial) à un/des pays — admin/service_role ───────────
// Crée des lignes agent_countries (LOT 7). À utiliser tant que l'UI admin n'existe
// pas encore. Idempotent (UNIQUE agent_id,country_code). Valide rôle agent + pays.
//
// Usage :
//   node scripts/link-agent-country.mjs <agent_id> <CC> [<CC> ...]
//   node scripts/link-agent-country.mjs --list <agent_id>          # voir ses pays
//   node scripts/link-agent-country.mjs --agents                   # lister les agents
//   node scripts/link-agent-country.mjs --unlink <agent_id> <CC>   # retirer un lien
// Ex. node scripts/link-agent-country.mjs 11111111-... MA CN
//
// Lit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY depuis .env.local.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const URL = pick('NEXT_PUBLIC_SUPABASE_URL')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const api = async (path, init = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t}`)
  return t ? JSON.parse(t) : null
}

const args = process.argv.slice(2)

if (args[0] === '--agents') {
  const rows = await api(`profiles?role=eq.agent&select=id,full_name`)
  console.log('Agents (role=agent) :')
  rows.forEach((a) => console.log(`  ${a.id}  ${a.full_name}`))
  process.exit(0)
}

if (args[0] === '--list') {
  const id = args[1]
  const rows = await api(`agent_countries?agent_id=eq.${id}&select=country_code,created_at`)
  console.log(`Pays de l'agent ${id} :`, rows.length ? rows.map((r) => r.country_code).join(', ') : '(aucun)')
  process.exit(0)
}

if (args[0] === '--unlink') {
  const [, id, cc] = args
  const del = await api(`agent_countries?agent_id=eq.${id}&country_code=eq.${cc}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  console.log(del.length ? `🗑️  lien retiré : ${id} ✗ ${cc}` : 'aucun lien correspondant')
  process.exit(0)
}

const [agentId, ...codes] = args
if (!agentId || codes.length === 0) {
  console.error('Usage: node scripts/link-agent-country.mjs <agent_id> <CC> [<CC> ...]')
  console.error('       (--agents | --list <id> | --unlink <id> <CC>)')
  process.exit(1)
}

// 1) Vérifier que c'est bien un agent
const prof = await api(`profiles?id=eq.${agentId}&select=id,full_name,role`)
if (!prof.length) { console.error(`❌ profil introuvable : ${agentId}`); process.exit(1) }
if (prof[0].role !== 'agent') { console.error(`❌ ${prof[0].full_name} a le rôle "${prof[0].role}", pas "agent"`); process.exit(1) }

// 2) Vérifier que les pays existent
const allCountries = await api(`countries?select=code`)
const known = new Set(allCountries.map((c) => c.code))
const bad = codes.filter((c) => !known.has(c))
if (bad.length) { console.error(`❌ code(s) pays inconnu(s) : ${bad.join(', ')}`); process.exit(1) }

// 3) Insert idempotent (ignore les doublons)
const payload = codes.map((country_code) => ({ agent_id: agentId, country_code }))
await api(`agent_countries?on_conflict=agent_id,country_code`, {
  method: 'POST',
  headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  body: JSON.stringify(payload),
})

const after = await api(`agent_countries?agent_id=eq.${agentId}&select=country_code`)
console.log(`✅ ${prof[0].full_name} → pays liés : ${after.map((r) => r.country_code).sort().join(', ')}`)
