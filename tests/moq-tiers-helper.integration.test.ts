/**
 * LOT 2 — Preuves RUNTIME : refactor helper insertMoqTiers
 *
 * Vérifie que la factorisation du helper `insertMoqTiers` (src/lib/supplier/moq-tiers.ts)
 * n'a RIEN changé au comportement d'insertion des paliers par rapport aux 2 inserts
 * dupliqués d'origine (web : submitSupplierProduct / CSV : publishBulkImport).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Invariants prouvés :
 *  1. (no-op)        tiers = [] → 0 ligne insérée, error === null.
 *  2. (web/string)   prix chaîne décimale ('20.00', '18.50') → valeurs numériques exactes
 *                    en base (20, 18.5). Aucune reconversion (règle argent #4, zéro parseFloat).
 *  3. (csv/number)   prix nombre (16, 14) → valeurs correctes en base.
 *  4. (erreur)       supplier_product_id inexistant → { error: string }, jamais throw.
 *                    Prouve que le flux web peut remonter l'erreur et le flux CSV l'ignorer.
 *
 * Chaque test d'écriture nettoie les lignes insérées inline ; afterAll est le filet de
 * sécurité final. admin_audit_log (append-only immuable) n'est pas concerné ici.
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { insertMoqTiers } from '@/lib/supplier/moq-tiers'

// ── Suffixe unique pour isoler les données de ce run ─────────────────────────
const testTag = `lot2-moq-${Date.now()}`

// ── État partagé (peuplé dans beforeAll) ─────────────────────────────────────
let sb: SupabaseClient          // client service_role — LOCAL uniquement
let supplierId: string           // auth.users.id du fournisseur de test
let supplierProductId: string   // supplier_products.id du produit de test

// ─────────────────────────────────────────────────────────────────────────────
describe('LOT 2 — insertMoqTiers : refactor PUR (intégration LOCAL)', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────────────────────────────────────────
  beforeAll(async () => {
    // 1. Credentials locaux via supabase status — JAMAIS .env.local
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot2-moq-tiers-setup')
    console.log(`[guard] URL locale confirmée : ${env.url}`)

    // 2. Pointer createAdminClient() sur le LOCAL
    //    (lu à l'appel, pas à l'import → beforeAll suffit)
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    // 3. Client service_role (bypass RLS — local uniquement)
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 4. Utilisateur fournisseur de test
    const { data: userData, error: userErr } = await sb.auth.admin.createUser({
      email: `supplier-${testTag}@test.local`,
      password: 'TestLot2Moq2026!',
      email_confirm: true,
      user_metadata: { role: 'supplier', full_name: `Test Supplier ${testTag}` },
    })
    if (userErr || !userData.user) {
      throw new Error(`createUser supplier: ${userErr?.message ?? 'user null'}`)
    }
    supplierId = userData.user.id

    // 5. Produit fournisseur de test — champs minimum obligatoires (NOT NULL sans défaut)
    const { data: prodData, error: prodErr } = await sb
      .from('supplier_products')
      .insert({
        supplier_id: supplierId,
        product_name: `TestMoqProd ${testTag}`,
        category: 'test',
        unit: 'pcs',
      })
      .select('id')
      .single()
    if (prodErr || !prodData) {
      throw new Error(`supplier_products insert: ${prodErr?.message ?? 'data null'}`)
    }
    supplierProductId = (prodData as { id: string }).id
    console.log(`[setup] supplier_product seedé : ${supplierProductId}`)
  }, 60_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // Filet de sécurité : supprime le produit et l'utilisateur même si un test
  // n'a pas nettoyé ses propres lignes de paliers.
  // ─────────────────────────────────────────────────────────────────────────────
  afterAll(async () => {
    if (!sb) return
    if (supplierProductId) {
      // Paliers d'abord (FK supplier_product_id → supplier_products.id)
      await sb
        .from('supplier_product_moq_tiers')
        .delete()
        .eq('supplier_product_id', supplierProductId)
      await sb.from('supplier_products').delete().eq('id', supplierProductId)
    }
    if (supplierId) await sb.auth.admin.deleteUser(supplierId)
    console.log('[cleanup] données de test supprimées')
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // INVARIANT 1 — no-op : tiers vide → rien inséré, error null
  // Équivaut au garde `if (tiers.length > 0)` d'origine (supprimé, remplacé par
  // `if (tiers.length === 0) return { error: null }` dans le helper).
  // ─────────────────────────────────────────────────────────────────────────────
  it('(1-no-op) tiers=[] → 0 ligne insérée, error===null', async () => {
    const { error } = await insertMoqTiers(sb, supplierProductId, [])

    expect(error, 'error doit être null pour tableau vide').toBeNull()

    const { data, error: readErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('id')
      .eq('supplier_product_id', supplierProductId)
    expect(readErr, `Erreur de lecture : ${readErr?.message}`).toBeNull()
    expect(data, '0 ligne attendue en base après no-op').toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // INVARIANT 2 — flux web : prix chaîne décimale (money.ts, règle argent #4)
  // L'origine (supplier-products.ts) construisait les rows avec unit_price_usd
  // typé `string` depuis parseMoneyInput. Le helper accepte string | number et
  // passe verbatim sans reconversion (zéro parseFloat).
  // ─────────────────────────────────────────────────────────────────────────────
  it('(2-web/string) prix chaîne décimale → valeurs numériques exactes en base', async () => {
    const { error } = await insertMoqTiers(sb, supplierProductId, [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '18.50' },
    ])
    expect(error, `Erreur inattendue sur insert web/string : ${error}`).toBeNull()

    const { data, error: readErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('min_quantity, unit_price_usd')
      .eq('supplier_product_id', supplierProductId)
      .order('min_quantity', { ascending: true })
    expect(readErr, `Lecture échouée : ${readErr?.message}`).toBeNull()
    expect(data, '2 lignes attendues').toHaveLength(2)

    // La colonne numeric Postgres revient en JSON comme nombre (ou string selon pilote).
    // Number() normalise sans risque pour ces valeurs exactes.
    expect(data![0].min_quantity).toBe(10)
    expect(Number(data![0].unit_price_usd)).toBe(20)   // '20.00' verbatim → 20.0000 en base
    expect(data![1].min_quantity).toBe(50)
    expect(Number(data![1].unit_price_usd)).toBe(18.5) // '18.50' verbatim → 18.5000 en base

    // Nettoyage inline pour le test suivant
    await sb
      .from('supplier_product_moq_tiers')
      .delete()
      .eq('supplier_product_id', supplierProductId)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // INVARIANT 3 — flux CSV : prix nombre (comme publishBulkImport avant refactor)
  // L'origine (supplier-bulk.ts) construisait les rows avec unit_price_usd =
  // t.unit_price_usd (number via parseFloat dans le sanitizer CSV). Le helper
  // accepte number et l'envoie verbatim.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(3-csv/number) prix nombre → valeurs correctes en base', async () => {
    const { error } = await insertMoqTiers(sb, supplierProductId, [
      { min_quantity: 100, unit_price_usd: 16 },
      { min_quantity: 500, unit_price_usd: 14 },
    ])
    expect(error, `Erreur inattendue sur insert csv/number : ${error}`).toBeNull()

    const { data, error: readErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('min_quantity, unit_price_usd')
      .eq('supplier_product_id', supplierProductId)
      .order('min_quantity', { ascending: true })
    expect(readErr, `Lecture échouée : ${readErr?.message}`).toBeNull()
    expect(data, '2 lignes attendues').toHaveLength(2)

    expect(data![0].min_quantity).toBe(100)
    expect(Number(data![0].unit_price_usd)).toBe(16)
    expect(data![1].min_quantity).toBe(500)
    expect(Number(data![1].unit_price_usd)).toBe(14)

    // Nettoyage inline
    await sb
      .from('supplier_product_moq_tiers')
      .delete()
      .eq('supplier_product_id', supplierProductId)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // INVARIANT 4 — propagation d'erreur : FK violation → { error: string }
  // Prouve que le helper ne throw PAS, ce qui permet :
  //   - au flux web  : `const { error: tierErr } = await insertMoqTiers(...)`
  //     puis `if (tierErr) return { error: tierErr }` (remonter l'erreur à l'UI) ;
  //   - au flux CSV  : `await insertMoqTiers(...)` sans vérifier le retour
  //     (best-effort, l'erreur est ignorée comme avant le refactor).
  // ─────────────────────────────────────────────────────────────────────────────
  it('(4-erreur) supplier_product_id inexistant → { error: string }, jamais throw', async () => {
    // UUID valide mais absent de la table → violation FK
    const ghostProductId = 'ffffffff-0000-4000-8000-000000000001'

    // Si le helper throw, le test échoue automatiquement (unhandled rejection)
    const result = await insertMoqTiers(sb, ghostProductId, [
      { min_quantity: 10, unit_price_usd: '20.00' },
    ])

    expect(result.error, 'error doit être une string non-nulle sur FK violation').not.toBeNull()
    expect(typeof result.error).toBe('string')
    expect(result.error!.length, 'message d\'erreur non vide').toBeGreaterThan(0)
    console.log(`[invariant 4] message d'erreur DB : "${result.error}"`)
  })
})
