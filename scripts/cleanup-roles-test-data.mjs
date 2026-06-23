#!/usr/bin/env node
/**
 * cleanup-roles-test-data.mjs
 * Nettoyage des données de test résiduelles du LOT "rôles 2 étages".
 *
 * SÉCURITÉ : aucune clé en dur. Tout via process.env (chargé depuis .env.local).
 * Mode par défaut = DIAGNOSTIC (lecture seule). Passer `--apply` pour exécuter
 * les suppressions ciblées.
 *
 * Cible :
 *   - Agent test cebd5f07… : retirer toute capacité AU-DELÀ de manage_country_sourcing
 *   - Commande COD de test 0986e5c7… (customer "TEST COD SUPERVISEUR") : SUPPRIMER
 *   - Commande affiliée test 88c25be9… : remettre à pending_confirmation si confirmée par le test
 *   - Balayage : toute autre commande "TEST COD SUPERVISEUR" résiduelle
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Chargement .env.local (parsing minimal, valeurs jamais loggées) ───────────
const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) {
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[m[1]] = v
  }
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!SUPA_URL || !SERVICE_KEY) {
  console.error('FATAL : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

const AGENT_ID = 'cebd5f07-55a7-44ee-9638-43348d4de75c'
const BASELINE_CAP = 'manage_country_sourcing'
const COD_ORDER_ID = '0986e5c7-cb2f-4b36-bf67-3e5a4f1f6965'
const AFFILIATE_ORDER_ID = '88c25be9-e69b-42cc-b44f-fba9a7dd6d7b'
const TEST_CUSTOMER = 'TEST COD SUPERVISEUR'

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: extra.prefer ?? 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, body: json }
}

function line() { console.log('─'.repeat(70)) }

async function main() {
  console.log(`\n[MODE] ${APPLY ? '🔴 APPLY (suppressions ciblées)' : '🟢 DIAGNOSTIC (lecture seule)'}\n`)

  // ── 1. Capacités de l'agent test ────────────────────────────────────────────
  line()
  console.log('1. CAPACITÉS DE L\'AGENT TEST (cebd5f07…)')
  const caps = await rest('GET',
    `/rest/v1/staff_permissions?user_id=eq.${AGENT_ID}&select=capability,granted_by,granted_at`)
  if (!Array.isArray(caps.body)) {
    console.error('   ⚠️ Requête capacités en ERREUR:', JSON.stringify(caps.body))
    process.exit(1)
  }
  const capList = caps.body
  console.log(`   ${capList.length} capacité(s) :`, capList.map(c => c.capability).join(', ') || '(aucune)')
  const residueCaps = capList.map(c => c.capability).filter(c => c !== BASELINE_CAP)
  console.log(`   → RÉSIDU à retirer : ${residueCaps.join(', ') || '(aucun)'}`)
  console.log(`   → baseline conservée : ${capList.some(c => c.capability === BASELINE_CAP) ? BASELINE_CAP : '⚠️ baseline ABSENTE'}`)

  // ── 2. Audit des grants récents sur l'agent ─────────────────────────────────
  line()
  console.log('2. JOURNAL D\'AUDIT (grants/revokes sur l\'agent test)')
  const audit = await rest('GET',
    `/rest/v1/staff_permission_audit?user_id=eq.${AGENT_ID}&select=action,capability,changed_at&order=changed_at.desc&limit=15`)
  const auditList = Array.isArray(audit.body) ? audit.body : []
  for (const a of auditList) console.log(`   ${a.changed_at}  ${a.action.toUpperCase()}  ${a.capability}`)
  if (!auditList.length) console.log('   (aucune entrée)')

  // ── 3. Commande COD de test (créée par le tester) ───────────────────────────
  line()
  console.log('3. COMMANDE COD DE TEST (0986e5c7…)')
  const cod = await rest('GET',
    `/rest/v1/orders?id=eq.${COD_ORDER_ID}&select=id,status,customer_name,affiliate_id,total_amount,cod_received,confirmed_at`)
  const codRows = Array.isArray(cod.body) ? cod.body : []
  console.log(codRows.length ? JSON.stringify(codRows[0], null, 2) : '   (absente — déjà nettoyée)')

  // ── 4. Commande affiliée de test (pré-existante) ────────────────────────────
  line()
  console.log('4. COMMANDE AFFILIÉE DE TEST (88c25be9…)')
  const aff = await rest('GET',
    `/rest/v1/orders?id=eq.${AFFILIATE_ORDER_ID}&select=id,status,customer_name,affiliate_id,total_amount,cod_received,confirmed_at`)
  const affRows = Array.isArray(aff.body) ? aff.body : []
  console.log(affRows.length ? JSON.stringify(affRows[0], null, 2) : '   (absente)')

  // ── 5. Balayage : toute commande "TEST COD SUPERVISEUR" résiduelle ──────────
  line()
  console.log('5. BALAYAGE commandes "TEST COD SUPERVISEUR"')
  const scan = await rest('GET',
    `/rest/v1/orders?customer_name=eq.${encodeURIComponent(TEST_CUSTOMER)}&select=id,status,customer_name,created_at`)
  const scanRows = Array.isArray(scan.body) ? scan.body : []
  for (const r of scanRows) console.log(`   ${r.id}  status=${r.status}  ${r.created_at}`)
  if (!scanRows.length) console.log('   (aucune)')

  if (!APPLY) {
    line()
    console.log('\n🟢 DIAGNOSTIC terminé. Relancer avec --apply pour exécuter le nettoyage.\n')
    return
  }

  // ════════════════════════════════════════════════════════════════════════════
  // APPLY — suppressions ciblées
  // ════════════════════════════════════════════════════════════════════════════
  line()
  console.log('\n🔴 EXÉCUTION DU NETTOYAGE\n')
  const report = []

  // 5a. Retirer les capacités résidu.
  // NB : la RPC revoke_staff_permission gate sur my_role()='admin' (inopérante
  // via service_role sans auth.uid()). On supprime donc en direct — service_role
  // bypass RLS — exactement comme l'afterAll des specs e2e.
  for (const cap of residueCaps) {
    const r = await rest('DELETE',
      `/rest/v1/staff_permissions?user_id=eq.${AGENT_ID}&capability=eq.${cap}`,
      undefined, { prefer: 'return=minimal' })
    report.push(`DELETE capability ${cap} → HTTP ${r.status}`)
  }

  // 5b. Supprimer toutes les commandes COD de test (par ID + par balayage nom)
  const codIdsToDelete = new Set()
  if (codRows.length) codIdsToDelete.add(COD_ORDER_ID)
  for (const r of scanRows) codIdsToDelete.add(r.id)
  for (const oid of codIdsToDelete) {
    const r = await rest('DELETE', `/rest/v1/orders?id=eq.${oid}`, undefined, { prefer: 'return=minimal' })
    report.push(`DELETE order COD ${oid} → HTTP ${r.status}`)
  }

  // 5c. Commande affiliée pré-existante : reset à pending_confirmation si confirmée par le test
  if (affRows.length && affRows[0].status === 'confirmed') {
    const r = await rest('PATCH', `/rest/v1/orders?id=eq.${AFFILIATE_ORDER_ID}`,
      { status: 'pending_confirmation', confirmed_at: null }, { prefer: 'return=minimal' })
    report.push(`RESET affiliate order ${AFFILIATE_ORDER_ID} → pending_confirmation (HTTP ${r.status})`)
  } else {
    report.push(`affiliate order : status=${affRows[0]?.status ?? 'absente'} → pas de reset nécessaire`)
  }

  console.log('RÉSULTAT :')
  for (const l of report) console.log('   ✓ ' + l)

  // ── Vérification post-nettoyage ─────────────────────────────────────────────
  line()
  console.log('\n✅ VÉRIFICATION POST-NETTOYAGE\n')
  const capsAfter = await rest('GET',
    `/rest/v1/staff_permissions?user_id=eq.${AGENT_ID}&select=capability`)
  console.log('   Capacités agent restantes :',
    (Array.isArray(capsAfter.body) ? capsAfter.body : []).map(c => c.capability).join(', ') || '(aucune)')
  const codAfter = await rest('GET', `/rest/v1/orders?id=eq.${COD_ORDER_ID}&select=id`)
  console.log('   Commande COD test :', (Array.isArray(codAfter.body) && codAfter.body.length) ? '⚠️ TOUJOURS PRÉSENTE' : '✓ supprimée')
  const affAfter = await rest('GET', `/rest/v1/orders?id=eq.${AFFILIATE_ORDER_ID}&select=status`)
  console.log('   Commande affiliée test :', JSON.stringify(Array.isArray(affAfter.body) ? affAfter.body[0] : affAfter.body))
  console.log('')
}

main().catch(e => { console.error('ERREUR :', e); process.exit(1) })
