/**
 * Migration 116 — Preuves RUNTIME : fermeture des 2 fuites de marge OWNER-FACING
 * (E1 acheteur sur SA commande, M1 fournisseur sur SA fiche). RLS row-level, pas
 * column-level → on retire la branche owner de la policy base + vue redacted.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status` (getLocalSupabaseEnv).
 * Auth réelle (signInWithPassword) → auth.uid() réel → RLS exercée pour de vrai.
 *
 * Couverture :
 *  (E1) L'acheteur (auth réelle) ne peut PLUS lire ses colonnes de marge/coût
 *       (gross_profit_mad, gross_margin_percent, supplier_cost_mad) via la table de
 *       base `wholesale_orders` → AUCUNE ligne (RLS deny).
 *  (E1) La vue `wholesale_orders_buyer_read` renvoie bien SA commande (1 ligne),
 *       et la colonne gross_profit_mad y est ABSENTE (sélection → erreur runtime).
 *  (E1) Régression staff : l'ADMIN lit toujours `wholesale_orders` en direct.
 *  (M1) Le fournisseur ne peut PLUS lire sa marge (platform_margin_value,
 *       final_wholesale_price_mad) via la table de base `supplier_products` →
 *       AUCUNE ligne (RLS deny).
 *  (M1) La vue `supplier_products_owner_read` renvoie SA fiche (1 ligne), SANS
 *       colonne de marge (sélection de final_wholesale_price_mad → erreur runtime).
 *  (M1) Isolation : un 2ᵉ fournisseur ne voit PAS la fiche du 1ᵉʳ via la vue owner
 *       (filtre supplier_id = auth.uid() embarqué) → 0 ligne.
 *  (M1) Régression staff : l'ADMIN lit toujours `supplier_products` en direct.
 *
 * RÈGLES ABSOLUES (CLAUDE.md) : jamais la prod (assertLocalSupabase), clés via
 * getLocalSupabaseEnv (supabase status), aucun secret en dur.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const TEST_PASSWORD = 'TestRls116-2026!X'
const testTag = `rls116-${Date.now()}`

let LOCAL_URL: string
let LOCAL_ANON_KEY: string
let sb: SupabaseClient // service_role — seed + assertions de référence

let buyerId: string
let buyerEmail: string
let adminId: string
let adminEmail: string
let supplierAId: string
let supplierAEmail: string
let supplierBId: string
let supplierBEmail: string

let orderId: string
let supplierProductId: string

async function mkUser(
  suffix: string,
  role: 'admin' | 'wholesaler' | 'supplier',
  name: string,
): Promise<{ id: string; email: string }> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: name },
  })
  if (error || !data.user) throw new Error(`mkUser(${suffix}): ${error?.message ?? 'user null'}`)
  await sb.from('profiles').update({ role, status: 'approved', full_name: name }).eq('id', data.user.id)
  return { id: data.user.id, email }
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signInWithPassword(${email}): ${error.message}`)
  return client
}

describe('Migration 116 — fermeture fuites de marge owner-facing (E1 + M1)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    console.log(`[guard] URL locale confirmée : ${env.url}`)
    assertLocalSupabase(env.url, 'rls116-integration-setup')

    LOCAL_URL = env.url
    LOCAL_ANON_KEY = env.anonKey
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const buyer = await mkUser('tbuyer', 'wholesaler', `TestBuyer ${testTag}`)
    buyerId = buyer.id
    buyerEmail = buyer.email

    const admin = await mkUser('tadmin', 'admin', `TestAdmin ${testTag}`)
    adminId = admin.id
    adminEmail = admin.email

    const supplierA = await mkUser('tsuppA', 'supplier', `TestSupplierA ${testTag}`)
    supplierAId = supplierA.id
    supplierAEmail = supplierA.email

    const supplierB = await mkUser('tsuppB', 'supplier', `TestSupplierB ${testTag}`)
    supplierBId = supplierB.id
    supplierBEmail = supplierB.email

    // ── E1 : commande gros de l'acheteur, avec coût/marge (trigger 025) ─────────
    const { data: ord, error: ordErr } = await sb
      .from('wholesale_orders')
      .insert({
        buyer_id: buyerId,
        total_amount: 10000,
        total_cost_mad: 6000, // → trigger : gross_profit_mad = 4000, gross_margin_percent = 40
        supplier_cost_mad: 6000, // valeur SECRÈTE — jamais lisible par l'acheteur en base
        status: 'pending',
        delivery_preference: 'delivery',
      })
      .select('id')
      .single()
    if (ordErr || !ord) throw new Error(`wholesale_orders: ${ordErr?.message}`)
    orderId = ord.id

    // ── M1 : fiche fournisseur A, avec marge plateforme (secret) ────────────────
    const { data: sp, error: spErr } = await sb
      .from('supplier_products')
      .insert({
        supplier_id: supplierAId,
        product_name: `[${testTag}] Produit fournisseur A`,
        category: 'test',
        unit: 'pcs',
        supplier_type: 'international',
        availability_type: 'import_on_demand',
        source_currency: 'USD',
        min_quantity: 10,
        approval_status: 'approved',
        suggested_wholesale_price_mad: 100, // prix soumis par le fournisseur (non secret)
        apply_platform_margin: true,
        platform_margin_type: 'percentage',
        platform_margin_value: 20, // marge Mozouna — SECRÈTE
        final_wholesale_price_mad: 120, // prix final marge incluse — SECRET
      })
      .select('id')
      .single()
    if (spErr || !sp) throw new Error(`supplier_products: ${spErr?.message}`)
    supplierProductId = sp.id

    console.log(`[seed] orderId=${orderId} | supplierProductId=${supplierProductId}`)
  }, 120_000)

  afterAll(async () => {
    if (!sb) return
    if (supplierProductId) await sb.from('supplier_products').delete().eq('id', supplierProductId)
    if (orderId) await sb.from('wholesale_orders').delete().eq('id', orderId)
    for (const uid of [buyerId, adminId, supplierAId, supplierBId].filter(Boolean)) {
      await sb.auth.admin.deleteUser(uid)
    }
    console.log('[cleanup] données de test supprimées')
  }, 60_000)

  // ─────────────────────────── E1 — acheteur ────────────────────────────────
  it('(E1) acheteur : table de base wholesale_orders → 0 ligne (RLS deny)', async () => {
    const client = await signedInClient(buyerEmail)
    const { data, error } = await client
      .from('wholesale_orders')
      .select('id, gross_profit_mad, gross_margin_percent, supplier_cost_mad')
      .eq('id', orderId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(E1) acheteur : vue redacted renvoie SA commande, SANS colonne de marge', async () => {
    const client = await signedInClient(buyerEmail)
    const { data, error } = await client
      .from('wholesale_orders_buyer_read')
      .select('id, status, total_amount')
      .eq('id', orderId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // La colonne de marge est ABSENTE de la vue → sa sélection échoue à l'exécution.
    const { error: colErr } = await client
      .from('wholesale_orders_buyer_read')
      .select('gross_profit_mad')
      .eq('id', orderId)
    expect(colErr).not.toBeNull()
  })

  it('(E1) régression staff : ADMIN lit toujours wholesale_orders en direct', async () => {
    const client = await signedInClient(adminEmail)
    const { data, error } = await client
      .from('wholesale_orders')
      .select('id, gross_profit_mad')
      .eq('id', orderId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })

  // ─────────────────────────── M1 — fournisseur ─────────────────────────────
  it('(M1) fournisseur : table de base supplier_products → 0 ligne (RLS deny)', async () => {
    const client = await signedInClient(supplierAEmail)
    const { data, error } = await client
      .from('supplier_products')
      .select('id, platform_margin_value, final_wholesale_price_mad')
      .eq('id', supplierProductId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(M1) fournisseur : vue owner renvoie SA fiche, SANS colonne de marge', async () => {
    const client = await signedInClient(supplierAEmail)
    const { data, error } = await client
      .from('supplier_products_owner_read')
      .select('id, product_name, approval_status, suggested_wholesale_price_mad')
      .eq('id', supplierProductId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // Les colonnes de marge sont ABSENTES de la vue → leur sélection échoue à l'exécution.
    const { error: colErr } = await client
      .from('supplier_products_owner_read')
      .select('final_wholesale_price_mad')
      .eq('id', supplierProductId)
    expect(colErr).not.toBeNull()
  })

  it('(M1) isolation : un autre fournisseur ne voit PAS la fiche via la vue owner', async () => {
    const client = await signedInClient(supplierBEmail)
    const { data, error } = await client
      .from('supplier_products_owner_read')
      .select('id')
      .eq('id', supplierProductId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(M1) régression staff : ADMIN lit toujours supplier_products en direct', async () => {
    const client = await signedInClient(adminEmail)
    const { data, error } = await client
      .from('supplier_products')
      .select('id, final_wholesale_price_mad')
      .eq('id', supplierProductId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })
})
