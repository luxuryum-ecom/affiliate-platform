/**
 * Migration 115 — Preuves RUNTIME : fermeture de 3 fuites de secrets financiers
 * INTER-ACTEURS (RLS row-level, pas column-level).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status` (getLocalSupabaseEnv).
 *
 * Couverture :
 *  (C1) Un grossiste (auth réelle) ne peut PLUS lire `unit_price_usd` via la table
 *       de base `supplier_product_moq_tiers` (policy "spmt: wholesaler read approved"
 *       retirée) — la requête ne renvoie AUCUNE ligne (RLS deny).
 *  (C1) La vue `supplier_product_moq_tiers_wholesaler_read` renvoie bien les paliers
 *       du produit approuvé (même NOMBRE que semé), avec SEULEMENT
 *       (supplier_product_id, min_quantity) — colonne prix absente de la forme.
 *  (C1) Le calcul d'affichage marketplace `hasTiers = tiers.length > 1` donne le
 *       MÊME résultat en lisant la vue redacted qu'avant (source de vérité = nombre
 *       de paliers, jamais le prix) — preuve que le repointage ne régresse pas le chip.
 *  (C2) Le grossiste ne peut PLUS lire `supplier_product_variants` (donc plus
 *       `price_adjustment_usd`) via la table de base — AUCUNE ligne renvoyée.
 *  (E2) Le grossiste ne peut PLUS lire `products` en direct (table de base) —
 *       AUCUNE ligne renvoyée ; l'ADMIN, lui, continue de lire (pas de régression staff).
 *
 * RÈGLES ABSOLUES (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 *  - Auth réelle (signInWithPassword) → auth.uid() réel → RLS exercée pour de vrai
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'

const TEST_PASSWORD = 'TestRls115-2026!X'
const testTag = `rls115-${Date.now()}`

let LOCAL_URL: string
let LOCAL_ANON_KEY: string
let sb: SupabaseClient // service_role — seed + assertions de référence

let wholesalerId: string
let adminId: string
let wholesalerEmail: string
let adminEmail: string

let supplierId: string
let supplierProductId: string
let productId: string
const seededTierQuantities = [10, 50, 100] // 3 paliers → hasTiers doit être vrai (>1)

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

describe('Migration 115 — fermeture fuites RLS financières inter-acteurs', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    console.log(`[guard] URL locale confirmée : ${env.url}`)
    assertLocalSupabase(env.url, 'rls115-integration-setup')

    LOCAL_URL = env.url
    LOCAL_ANON_KEY = env.anonKey

    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const wholesaler = await mkUser('twholesale', 'wholesaler', `TestWholesaler ${testTag}`)
    wholesalerId = wholesaler.id
    wholesalerEmail = wholesaler.email

    const admin = await mkUser('tadmin', 'admin', `TestAdmin ${testTag}`)
    adminId = admin.id
    adminEmail = admin.email

    const supplier = await mkUser('tsupplier', 'supplier', `TestSupplier ${testTag}`)
    supplierId = supplier.id

    // ── Produit fournisseur APPROUVÉ + paliers source USD (C1) ─────────────────
    const { data: sp, error: spErr } = await sb
      .from('supplier_products')
      .insert({
        supplier_id: supplierId,
        product_name: `[${testTag}] Produit paliers`,
        category: 'test',
        unit: 'pcs',
        supplier_type: 'international',
        availability_type: 'import_on_demand',
        source_currency: 'USD',
        min_quantity: seededTierQuantities[0],
        approval_status: 'approved',
      })
      .select('id')
      .single()
    if (spErr || !sp) throw new Error(`supplier_products: ${spErr?.message}`)
    supplierProductId = sp.id

    const { error: tierErr } = await sb.from('supplier_product_moq_tiers').insert(
      seededTierQuantities.map((q, i) => ({
        supplier_product_id: supplierProductId,
        min_quantity: q,
        unit_price_usd: 20 - i, // valeur SECRÈTE — ne doit jamais être lisible par le grossiste
      })),
    )
    if (tierErr) throw new Error(`supplier_product_moq_tiers: ${tierErr.message}`)

    // ── Variante fournisseur (C2) ────────────────────────────────────────────
    const { error: variantErr } = await sb.from('supplier_product_variants').insert({
      supplier_product_id: supplierProductId,
      color: 'rouge',
      price_adjustment_usd: 5, // valeur SECRÈTE
    })
    if (variantErr) throw new Error(`supplier_product_variants: ${variantErr.message}`)

    // ── Produit catalogue (E2) ──────────────────────────────────────────────
    const { data: prod, error: prodErr } = await sb
      .from('products')
      .insert({
        name: `[${testTag}] Produit catalogue`,
        sell_price: 10000,
        factory_cost_mad: 4000, // coût SECRET — ne doit jamais être lisible par le grossiste
      })
      .select('id')
      .single()
    if (prodErr || !prod) throw new Error(`products: ${prodErr?.message}`)
    productId = prod.id

    console.log(`[seed] supplierProductId=${supplierProductId} | productId=${productId}`)
  }, 120_000)

  afterAll(async () => {
    if (!sb) return
    if (productId) await sb.from('products').delete().eq('id', productId)
    if (supplierProductId) {
      await sb.from('supplier_product_variants').delete().eq('supplier_product_id', supplierProductId)
      await sb.from('supplier_product_moq_tiers').delete().eq('supplier_product_id', supplierProductId)
      await sb.from('supplier_products').delete().eq('id', supplierProductId)
    }
    for (const uid of [wholesalerId, adminId, supplierId].filter(Boolean)) {
      await sb.auth.admin.deleteUser(uid)
    }
    console.log('[cleanup] données de test supprimées')
  }, 60_000)

  it('(C1) grossiste : table de base supplier_product_moq_tiers → 0 ligne (RLS deny)', async () => {
    const client = await signedInClient(wholesalerEmail)
    const { data, error } = await client
      .from('supplier_product_moq_tiers')
      .select('supplier_product_id, min_quantity, unit_price_usd')
      .eq('supplier_product_id', supplierProductId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(C1) grossiste : vue redacted renvoie les paliers, SANS colonne prix', async () => {
    const client = await signedInClient(wholesalerEmail)
    const { data, error } = await client
      .from('supplier_product_moq_tiers_wholesaler_read')
      .select('supplier_product_id, min_quantity')
      .eq('supplier_product_id', supplierProductId)
    expect(error).toBeNull()
    expect(data).toHaveLength(seededTierQuantities.length)
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(['min_quantity', 'supplier_product_id'])
      expect(row).not.toHaveProperty('unit_price_usd')
    }
    // Sélectionner explicitement unit_price_usd sur la vue doit échouer (colonne absente
    // de la vue — le client Supabase local n'est pas typé strictement <Database>, donc
    // ceci compile mais échoue à l'exécution : preuve runtime que la colonne n'existe pas).
    const { error: colErr } = await client
      .from('supplier_product_moq_tiers_wholesaler_read')
      .select('unit_price_usd')
      .eq('supplier_product_id', supplierProductId)
    expect(colErr).not.toBeNull()
  })

  it('(C1) marketplace — hasTiers dérivé de la vue redacted == comportement attendu (>1 palier)', async () => {
    // Reproduit exactement la dérivation de src/app/(wholesale)/wholesale/marketplace/page.tsx :
    // hasTiers = (product.supplier_product_moq_tiers ?? []).length > 1
    const client = await signedInClient(wholesalerEmail)
    const { data } = await client
      .from('supplier_product_moq_tiers_wholesaler_read')
      .select('supplier_product_id, min_quantity')
      .eq('supplier_product_id', supplierProductId)
    const moqTiers = data ?? []
    const hasTiers = moqTiers.length > 1
    expect(hasTiers).toBe(true) // 3 paliers semés → chip "paliers dispo" affiché, identique à avant
  })

  it('(C2) grossiste : table de base supplier_product_variants → 0 ligne (RLS deny)', async () => {
    const client = await signedInClient(wholesalerEmail)
    const { data, error } = await client
      .from('supplier_product_variants')
      .select('supplier_product_id, color, price_adjustment_usd')
      .eq('supplier_product_id', supplierProductId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(E2) grossiste : table de base products → 0 ligne (RLS deny, staff-only)', async () => {
    const client = await signedInClient(wholesalerEmail)
    const { data, error } = await client
      .from('products')
      .select('id, sell_price, factory_cost_mad')
      .eq('id', productId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('(E2) régression staff : ADMIN lit toujours products en direct', async () => {
    const client = await signedInClient(adminEmail)
    const { data, error } = await client
      .from('products')
      .select('id')
      .eq('id', productId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
  })
})
