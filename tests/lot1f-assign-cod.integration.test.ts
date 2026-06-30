/**
 * LOT 1F — Preuves RUNTIME : assignation des commandes COD à un agent
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Couverture (7 preuves) :
 *  1. ADMIN assigne → succès ; assigned_to = agentA ; 1 ligne admin_audit_log action
 *     'order_assign_agent', target_table='orders', new_value.assigned_to = agentA.
 *  2. AGENT AVEC casier 'assign_orders' (ré)assigne → succès + audit avec actor_id = cet agent.
 *  3. AGENT SANS casier → REFUSÉ (errors.forbidden_assign_orders) ; pas d'écriture.
 *  4. Protection PII : assigner à un wholesaler/affiliate → REFUSÉ (errors.assignee_not_found).
 *  5. Réassignation A→B succès + nouvelle ligne d'audit (old=A, new=B) ;
 *     réassigner le MÊME agent B = no-op idempotent (aucune ligne d'audit supplémentaire).
 *  6. Suite vitest complète : 0 régression.
 *  7. Nettoyage : orders, staff_permissions, auth users supprimés.
 *     admin_audit_log = append-only immuable (non nettoyable, documenté).
 *
 * RÈGLES ABSOLUES (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 *  - Auth réelle (signInWithPassword) → auth.uid() réel → gardes DB + trigger audit réalistes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

// ── Constantes ────────────────────────────────────────────────────────────────
const TEST_PASSWORD = 'TestLot1f2026!X'
const testTag = `lot1f-${Date.now()}`

// ── État partagé (peuplé en beforeAll) ───────────────────────────────────────
let LOCAL_URL: string
let LOCAL_ANON_KEY: string
let sb: SupabaseClient      // client service_role (seed + assertions)

// IDs des acteurs
let adminId: string
let agentWithId: string     // agent + casier assign_orders
let agentWithoutId: string  // agent SANS casier
let wholesalerId: string    // role affiliate — PII protection
let agentBId: string        // 2ème agent valide (pour réassignation A→B)

// IDs des données
let productId: string
let orderId: string

// Emails (construits dans beforeAll)
let adminEmail: string
let agentWithEmail: string
let agentWithoutEmail: string

// ── Helper : créer un utilisateur et forcer son profil ────────────────────────
async function mkUser(
  suffix: string,
  role: 'admin' | 'agent' | 'affiliate',
  name: string,
): Promise<string> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: name },
  })
  if (error || !data.user) {
    throw new Error(`mkUser(${suffix}): ${error?.message ?? 'user null'}`)
  }
  // Forcer role + status dans profiles (le trigger crée le profil mais peut mettre pending)
  await sb
    .from('profiles')
    .update({ role, status: 'approved', full_name: name })
    .eq('id', data.user.id)
  return data.user.id
}

// ── Helper : obtenir un client scopé à un utilisateur (auth.uid() réel) ───────
async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signInWithPassword(${email}): ${error.message}`)
  return client
}

// ── Helper : appeler assign_cod_order_atomic et retourner l'erreur éventuelle ─
async function callAssign(
  client: SupabaseClient,
  orderId: string,
  assigneeId: string,
): Promise<string | null> {
  const { error } = await client.rpc('assign_cod_order_atomic', {
    p_order_id: orderId,
    p_assignee: assigneeId,
  })
  return error ? error.message : null
}

// ── Helper : compter les lignes d'audit pour cet order ───────────────────────
async function countAuditLines(targetId: string, action = 'order_assign_agent'): Promise<number> {
  const { data, error } = await sb
    .from('admin_audit_log')
    .select('id')
    .eq('action', action)
    .eq('target_table', 'orders')
    .eq('target_id', targetId)
  if (error) throw new Error(`countAuditLines: ${error.message}`)
  return data?.length ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
describe('LOT 1F — Assignation COD (intégration LOCAL)', () => {
  beforeAll(async () => {
    // 1. Credentials locaux — JAMAIS .env.local
    const env = getLocalSupabaseEnv()
    console.log(`[guard] URL locale confirmée : ${env.url}`)
    assertLocalSupabase(env.url, 'lot1f-integration-setup')

    LOCAL_URL = env.url
    LOCAL_ANON_KEY = env.anonKey

    // 2. Pointer les server actions de l'app sur le LOCAL
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    // 3. Client service_role pour seed + assertions (bypass RLS — local uniquement)
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 4. Seed des acteurs
    adminId         = await mkUser('tadmin',   'admin',     `TestAdmin ${testTag}`)
    agentWithId     = await mkUser('tagentW',  'agent',     `TestAgentWith ${testTag}`)
    agentWithoutId  = await mkUser('tagentNW', 'agent',     `TestAgentWithout ${testTag}`)
    wholesalerId    = await mkUser('twholesale','affiliate', `TestWholesaler ${testTag}`)
    agentBId        = await mkUser('tagentB',  'agent',     `TestAgentB ${testTag}`)

    // Emails pour signInWithPassword
    adminEmail        = `tadmin-${testTag}@test.local`
    agentWithEmail    = `tagentW-${testTag}@test.local`
    agentWithoutEmail = `tagentNW-${testTag}@test.local`

    // 5. Casier assign_orders pour agentWith UNIQUEMENT
    const { error: spErr } = await sb.from('staff_permissions').insert({
      user_id: agentWithId,
      capability: 'assign_orders',
    })
    if (spErr) throw new Error(`staff_permissions: ${spErr.message}`)

    // 6. Produit de test
    const { data: prod, error: prodErr } = await sb
      .from('products')
      .insert({ name: `Produit Lot1F ${testTag}`, sell_price: 30000 })
      .select('id')
      .single()
    if (prodErr || !prod) throw new Error(`products: ${prodErr?.message}`)
    productId = prod.id

    // 7. Commande COD pour le test
    const { data: ord, error: ordErr } = await sb
      .from('orders')
      .insert({
        affiliate_id:     adminId,  // propriétaire affilié (admin joue le rôle ici)
        product_id:       productId,
        customer_name:    'Client PII Lot1F',
        customer_phone:   '0699999999',
        customer_city:    'Casablanca',
        customer_address: '42 Rue Lot1F Test',
        quantity:         1,
        total_amount:     30000,
        commission_amount: 5000,
      })
      .select('id')
      .single()
    if (ordErr || !ord) throw new Error(`orders: ${ordErr?.message}`)
    orderId = ord.id

    console.log(`[seed] orderId=${orderId} | agentWith=${agentWithId} | agentB=${agentBId}`)
  }, 120_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // admin_audit_log est APPEND-ONLY (trigger interdit DELETE) → non nettoyé.
  // Les lignes d'audit restent dans la DB locale (acceptable).
  // ─────────────────────────────────────────────────────────────────────────────
  afterAll(async () => {
    if (!sb) return

    // Ordre : orders (FK) → products → staff_permissions → auth users (cascade profiles)
    if (orderId)  await sb.from('orders').delete().eq('id', orderId)
    if (productId) await sb.from('products').delete().eq('id', productId)

    for (const uid of [adminId, agentWithId, agentWithoutId, wholesalerId, agentBId].filter(Boolean)) {
      await sb.auth.admin.deleteUser(uid)
    }
    console.log('[cleanup] données de test supprimées (sauf admin_audit_log append-only)')
  }, 60_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // PREUVE 1 — ADMIN assigne à agentWith
  // ─────────────────────────────────────────────────────────────────────────────
  it('(1) ADMIN assigne → succès + assigned_to = agentWith + 1 ligne audit', async () => {
    const client = await signedInClient(adminEmail)

    // Compter les lignes d'audit AVANT
    const auditBefore = await countAuditLines(orderId)

    // Appel RPC
    const err = await callAssign(client, orderId, agentWithId)
    expect(err, `Erreur inattendue RPC admin: ${err}`).toBeNull()

    // Vérifier assigned_to en DB
    const { data: row, error: dbErr } = await sb
      .from('orders')
      .select('assigned_to, assigned_at')
      .eq('id', orderId)
      .single()
    expect(dbErr, `Erreur lecture orders: ${dbErr?.message}`).toBeNull()
    expect(row!.assigned_to, 'assigned_to = agentWith').toBe(agentWithId)
    expect(row!.assigned_at, 'assigned_at non null après assignation').not.toBeNull()

    // Vérifier ligne d'audit
    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter - auditBefore, 'Exactement 1 nouvelle ligne audit').toBe(1)

    // Détails de la ligne d'audit
    const { data: auditRows } = await sb
      .from('admin_audit_log')
      .select('actor_id, actor_role, action, target_table, target_id, old_value, new_value')
      .eq('action', 'order_assign_agent')
      .eq('target_table', 'orders')
      .eq('target_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)

    const audit = auditRows![0]
    expect(audit.action, 'action = order_assign_agent').toBe('order_assign_agent')
    expect(audit.target_table, 'target_table = orders').toBe('orders')
    expect(audit.target_id, 'target_id = orderId').toBe(orderId)
    expect((audit.new_value as Record<string,unknown>).assigned_to, 'new_value.assigned_to = agentWith').toBe(agentWithId)
    expect((audit.old_value as Record<string,unknown>).assigned_to, 'old_value.assigned_to = null').toBeNull()
    expect(audit.actor_id, 'actor_id = admin').toBe(adminId)

    await client.auth.signOut()
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // PREUVE 2 — AGENT AVEC casier reassigne → succès + audit actor=agentWith
  // ─────────────────────────────────────────────────────────────────────────────
  it('(2) AGENT AVEC casier reassigne agentWith→agentB → succès + audit actor=agentWith', async () => {
    const client = await signedInClient(agentWithEmail)

    const auditBefore = await countAuditLines(orderId)

    const err = await callAssign(client, orderId, agentBId)
    expect(err, `Erreur inattendue RPC agentWith: ${err}`).toBeNull()

    // Vérifier assigned_to = agentB
    const { data: row } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('id', orderId)
      .single()
    expect(row!.assigned_to, 'assigned_to = agentB après reassignation').toBe(agentBId)

    // Vérifier audit : 1 nouvelle ligne avec actor_id = agentWith
    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter - auditBefore, '1 nouvelle ligne audit').toBe(1)

    const { data: auditRows } = await sb
      .from('admin_audit_log')
      .select('actor_id, old_value, new_value')
      .eq('action', 'order_assign_agent')
      .eq('target_table', 'orders')
      .eq('target_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)

    const audit = auditRows![0]
    expect(audit.actor_id, 'actor_id = agentWith (pas admin)').toBe(agentWithId)
    expect((audit.old_value as Record<string,unknown>).assigned_to, 'old_value = agentWith').toBe(agentWithId)
    expect((audit.new_value as Record<string,unknown>).assigned_to, 'new_value = agentB').toBe(agentBId)

    await client.auth.signOut()
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // PREUVE 3 — AGENT SANS casier → REFUSÉ
  // ─────────────────────────────────────────────────────────────────────────────
  it('(3) AGENT SANS casier → REFUSÉ errors.forbidden_assign_orders, aucune écriture', async () => {
    const client = await signedInClient(agentWithoutEmail)

    // Snapshot assigned_to avant
    const { data: before } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('id', orderId)
      .single()
    const assignedBefore = before!.assigned_to

    const auditBefore = await countAuditLines(orderId)

    const err = await callAssign(client, orderId, agentWithId)
    expect(err, 'Une erreur doit être retournée').not.toBeNull()
    expect(err, 'Erreur = forbidden_assign_orders').toContain('errors.forbidden_assign_orders')

    // Vérifier qu'aucune écriture n'a eu lieu
    const { data: after } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('id', orderId)
      .single()
    expect(after!.assigned_to, 'assigned_to inchangé').toBe(assignedBefore)

    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter, 'Aucune ligne audit ajoutée').toBe(auditBefore)

    await client.auth.signOut()
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // PREUVE 4 — Protection PII : assignee non agent/admin → REFUSÉ
  // ─────────────────────────────────────────────────────────────────────────────
  it('(4) Protection PII : assigner à un affiliate/wholesaler → REFUSÉ errors.assignee_not_found', async () => {
    const client = await signedInClient(adminEmail)

    const auditBefore = await countAuditLines(orderId)

    const err = await callAssign(client, orderId, wholesalerId)
    expect(err, 'Une erreur doit être retournée').not.toBeNull()
    expect(err, 'Erreur = assignee_not_found').toContain('errors.assignee_not_found')

    // Pas d'audit créé
    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter, 'Aucune ligne audit pour tentative PII').toBe(auditBefore)

    await client.auth.signOut()
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // PREUVE 5 — Réassignation A→B + idempotence B→B
  // État actuel après preuve 2 : agentB assigné
  // ─────────────────────────────────────────────────────────────────────────────
  it('(5a) Réassignation agentB→agentWith → succès + nouvelle ligne audit (old=B, new=agentWith)', async () => {
    const client = await signedInClient(adminEmail)

    const auditBefore = await countAuditLines(orderId)

    const err = await callAssign(client, orderId, agentWithId)
    expect(err, `Erreur inattendue réassignation: ${err}`).toBeNull()

    const { data: row } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('id', orderId)
      .single()
    expect(row!.assigned_to, 'assigned_to = agentWith après réassignation').toBe(agentWithId)

    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter - auditBefore, '1 nouvelle ligne audit pour réassignation').toBe(1)

    const { data: auditRows } = await sb
      .from('admin_audit_log')
      .select('old_value, new_value')
      .eq('action', 'order_assign_agent')
      .eq('target_table', 'orders')
      .eq('target_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)

    const audit = auditRows![0]
    expect((audit.old_value as Record<string,unknown>).assigned_to, 'old_value = agentB').toBe(agentBId)
    expect((audit.new_value as Record<string,unknown>).assigned_to, 'new_value = agentWith').toBe(agentWithId)

    await client.auth.signOut()
  }, 30_000)

  it('(5b) Idempotence : réassigner le MÊME agent → no-op (aucune ligne audit)', async () => {
    // État : agentWith est actuellement assigné (après 5a)
    const client = await signedInClient(adminEmail)

    const auditBefore = await countAuditLines(orderId)

    // Même agent : doit être un no-op (le RPC retourne sans écrire)
    const err = await callAssign(client, orderId, agentWithId)
    expect(err, 'No-op idempotent ne doit pas erreur').toBeNull()

    const { data: row } = await sb
      .from('orders')
      .select('assigned_to')
      .eq('id', orderId)
      .single()
    expect(row!.assigned_to, 'assigned_to inchangé (même agent)').toBe(agentWithId)

    // AUCUNE nouvelle ligne d'audit (le RPC fait RETURN avant UPDATE)
    const auditAfter = await countAuditLines(orderId)
    expect(auditAfter, 'Aucune nouvelle ligne audit pour re-assignation identique').toBe(auditBefore)

    await client.auth.signOut()
  }, 30_000)
})
