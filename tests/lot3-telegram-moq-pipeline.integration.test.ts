/**
 * LOT 3 — Preuves RUNTIME : pipeline extraction paliers Telegram bout en bout
 *
 * Prouve : sortie IA brute (fabriquée) → buildCleanExtraction → insert supplier_product
 * (avec min_quantity calculé comme ingest.ts) → insertMoqTiers → relecture en base.
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Trois cas prouvés :
 *  (a) Paliers désordonnés "20 aed, 50=18, 100=16, min 50" → triés en base,
 *      supplier_products.min_quantity = 50, 2 lignes de paliers (unit_price_usd = 18/16).
 *  (b) Quantité seule "500" → stock, PAS palier. min_quantity = 1 (défaut), 0 palier.
 *  (c) Échelle CROISSANTE [10→20, 50→22] → rejetée par sanitizer. min_quantity = 1, 0 palier.
 *
 * L'IA Haiku n'est JAMAIS appelée — sortie IA brute fabriquée pour déterminisme.
 * Nettoyage inline + afterAll filet de sécurité.
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { buildCleanExtraction, type AiExtractionRaw } from '@/lib/telegram/schema'
import { insertMoqTiers } from '@/lib/supplier/moq-tiers'

// ── Suffixe unique pour isoler ce run ────────────────────────────────────────
const testTag = `lot3-moq-${Date.now()}`

// ── État partagé (peuplé dans beforeAll) ─────────────────────────────────────
let sb: SupabaseClient
let supplierId: string

// IDs des produits créés par chaque cas — pour le cleanup afterAll (filet)
const createdProductIds: string[] = []

// ── Fabrique une sortie IA brute minimale (champs non testés = valeurs neutres)
function fakeRaw(partial: Partial<AiExtractionRaw>): AiExtractionRaw {
  return {
    product_name: 'Maillot test',
    category: 'Autres',
    subcategory: '',
    description: '',
    price: null,
    stock_quantity: null,
    lead_time_days: null,
    unit: null,
    pack_size: null,
    pack_unit: null,
    suggested_category: null,
    moq_tiers: null,
    ...partial,
  }
}

/**
 * Réplique exactement ce que ingest.ts fait :
 *  1. buildCleanExtraction sur la sortie IA brute
 *  2. minQuantity = moqTiers[0]?.min_quantity ?? 1
 *  3. insert supplier_products avec min_quantity + stock_quantity
 *  4. insertMoqTiers best-effort (t.unit_price → unit_price_usd)
 * Retourne { productId, clean } pour que le test puisse vérifier.
 */
async function runIngestPipeline(
  rawAi: AiExtractionRaw,
  label: string,
): Promise<{ productId: string; clean: ReturnType<typeof buildCleanExtraction> }> {
  const clean = buildCleanExtraction(rawAi)
  const moqTiers = clean.moq_tiers
  const minQuantity = moqTiers[0]?.min_quantity ?? 1

  const { data: prodData, error: prodErr } = await sb
    .from('supplier_products')
    .insert({
      supplier_id: supplierId,
      product_name: `[lot3-test ${label}] ${testTag}`,
      category: clean.category,
      min_quantity: minQuantity,
      stock_quantity: clean.stock_quantity,
    })
    .select('id')
    .single()

  if (prodErr || !prodData) {
    throw new Error(`supplier_products insert (${label}): ${prodErr?.message ?? 'data null'}`)
  }
  const productId = (prodData as { id: string }).id
  createdProductIds.push(productId)

  // Réplique ingest.ts : best-effort, t.unit_price → unit_price_usd
  const { error: tierErr } = await insertMoqTiers(
    sb,
    productId,
    moqTiers.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: t.unit_price })),
  )
  if (tierErr) throw new Error(`insertMoqTiers (${label}): ${tierErr}`)

  return { productId, clean }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('LOT 3 — pipeline paliers Telegram (intégration LOCAL)', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────────────────────────────────────────
  beforeAll(async () => {
    // 1. Credentials locaux via supabase status — JAMAIS .env.local
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot3-moq-pipeline-setup')
    console.log(`[guard] URL locale confirmée : ${env.url}`)

    // 2. Injecter les env locaux pour createAdminClient() éventuel (lu à l'appel)
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    // 3. Client service_role (bypass RLS — local uniquement)
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 4. Utilisateur fournisseur de test
    const { data: userData, error: userErr } = await sb.auth.admin.createUser({
      email: `supplier-lot3-${testTag}@test.local`,
      password: 'TestLot3Moq2026!',
      email_confirm: true,
      user_metadata: { role: 'supplier', full_name: `Supplier Lot3 ${testTag}` },
    })
    if (userErr || !userData.user) {
      throw new Error(`createUser supplier: ${userErr?.message ?? 'user null'}`)
    }
    supplierId = userData.user.id
    console.log(`[setup] supplier seedé : ${supplierId}`)
  }, 60_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP — filet de sécurité final
  // ─────────────────────────────────────────────────────────────────────────────
  afterAll(async () => {
    if (!sb) return
    // Paliers d'abord (FK → supplier_products)
    for (const pid of createdProductIds) {
      await sb.from('supplier_product_moq_tiers').delete().eq('supplier_product_id', pid)
      await sb.from('supplier_products').delete().eq('id', pid)
    }
    if (supplierId) await sb.auth.admin.deleteUser(supplierId)
    console.log(`[cleanup] ${createdProductIds.length} produit(s) + supplier supprimés`)
  }, 30_000)

  // ─────────────────────────────────────────────────────────────────────────────
  // CAS (a) — paliers désordonnés : sortie IA "20 aed, 50=18, 100=16, min 50"
  //
  // Simulé : price=20 (headline), moq_tiers=[{100,16},{50,18}] (ordre inverse intentionnel).
  // Attendu après buildCleanExtraction : triés [{50,18},{100,16}].
  // Attendu en base : min_quantity=50, 2 lignes de paliers (18 puis 16).
  // Prouve : paliers extraits + TRIÉS + MINIMUM = 50.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(a) paliers désordonnés → triés, min_quantity=50, 2 lignes de paliers', async () => {
    const rawAi = fakeRaw({
      price: 20,
      moq_tiers: [
        { min_quantity: 100, unit_price: 16 },
        { min_quantity: 50, unit_price: 18 },
      ],
    })

    const { productId, clean } = await runIngestPipeline(rawAi, 'cas-a')

    // ── Vérification sanitizer AVANT écriture ──────────────────────────────────
    expect(clean.moq_tiers, 'clean.moq_tiers doit être trié').toEqual([
      { min_quantity: 50, unit_price: 18 },
      { min_quantity: 100, unit_price: 16 },
    ])
    expect(clean.price_source, 'prix headline indépendant des paliers').toBe(20)
    const expectedMinQty = clean.moq_tiers[0]?.min_quantity ?? 1
    expect(expectedMinQty, 'minQuantity calculé = 50').toBe(50)

    // ── Relecture supplier_products ────────────────────────────────────────────
    const { data: prodRow, error: prodErr } = await sb
      .from('supplier_products')
      .select('min_quantity, stock_quantity')
      .eq('id', productId)
      .single()
    expect(prodErr, `lecture supplier_products: ${prodErr?.message}`).toBeNull()
    expect(prodRow!.min_quantity, 'supplier_products.min_quantity doit être 50').toBe(50)

    // ── Relecture paliers ──────────────────────────────────────────────────────
    const { data: tiers, error: tiersErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('min_quantity, unit_price_usd')
      .eq('supplier_product_id', productId)
      .order('min_quantity', { ascending: true })
    expect(tiersErr, `lecture moq_tiers: ${tiersErr?.message}`).toBeNull()
    expect(tiers, '2 lignes de paliers attendues').toHaveLength(2)

    // 1er palier : min=50, prix=18
    expect(tiers![0].min_quantity, '1er palier min_quantity=50').toBe(50)
    expect(Number(tiers![0].unit_price_usd), '1er palier unit_price_usd=18').toBe(18)
    // 2e palier : min=100, prix=16
    expect(tiers![1].min_quantity, '2e palier min_quantity=100').toBe(100)
    expect(Number(tiers![1].unit_price_usd), '2e palier unit_price_usd=16').toBe(16)

    console.log(`[cas-a] ✓ min_quantity=${prodRow!.min_quantity}, tiers=[{50,${Number(tiers![0].unit_price_usd)}},{100,${Number(tiers![1].unit_price_usd)}}]`)

    // Nettoyage inline
    await sb.from('supplier_product_moq_tiers').delete().eq('supplier_product_id', productId)
    await sb.from('supplier_products').delete().eq('id', productId)
    createdProductIds.splice(createdProductIds.indexOf(productId), 1)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // CAS (b) — quantité seule "500" → STOCK, PAS un palier
  //
  // Simulé : stock_quantity=500, moq_tiers=[] (l'IA a mis la quantité dans stock).
  // Attendu en base : stock_quantity=500, min_quantity=1 (défaut), 0 palier.
  // Prouve : quantité seule = stock, sans palier parasitaire.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(b) quantité seule → stock=500, min_quantity=1 (défaut), 0 palier', async () => {
    const rawAi = fakeRaw({
      price: null,
      stock_quantity: 500,
      moq_tiers: [],
    })

    const { productId, clean } = await runIngestPipeline(rawAi, 'cas-b')

    // ── Vérification sanitizer AVANT écriture ──────────────────────────────────
    expect(clean.moq_tiers, 'aucun palier pour quantité seule').toEqual([])
    expect(clean.stock_quantity, 'stock_quantity=500').toBe(500)
    const expectedMinQty = clean.moq_tiers[0]?.min_quantity ?? 1
    expect(expectedMinQty, 'minQuantity défaut = 1').toBe(1)

    // ── Relecture supplier_products ────────────────────────────────────────────
    const { data: prodRow, error: prodErr } = await sb
      .from('supplier_products')
      .select('min_quantity, stock_quantity')
      .eq('id', productId)
      .single()
    expect(prodErr, `lecture supplier_products: ${prodErr?.message}`).toBeNull()
    expect(prodRow!.min_quantity, 'min_quantity doit être 1 (défaut)').toBe(1)
    expect(prodRow!.stock_quantity, 'stock_quantity doit être 500').toBe(500)

    // ── Relecture paliers — doit être vide ─────────────────────────────────────
    const { data: tiers, error: tiersErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('id')
      .eq('supplier_product_id', productId)
    expect(tiersErr, `lecture moq_tiers: ${tiersErr?.message}`).toBeNull()
    expect(tiers, '0 palier attendu pour quantité seule').toHaveLength(0)

    console.log(`[cas-b] ✓ stock_quantity=${prodRow!.stock_quantity}, min_quantity=${prodRow!.min_quantity}, tiers=[]`)

    // Nettoyage inline
    await sb.from('supplier_products').delete().eq('id', productId)
    createdProductIds.splice(createdProductIds.indexOf(productId), 1)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // CAS (c) — échelle CROISSANTE [10→20, 50→22] → rejetée par sanitizeMoqTiers
  //
  // Simulé : moq_tiers=[{10,20},{50,22}] (prix CROISSANT = incohérent → rejet).
  // Attendu : buildCleanExtraction renvoie moq_tiers=[], min_quantity=1, 0 palier en base.
  // Prouve : le garde-fou sanitizeMoqTiers empêche l'écriture d'une échelle aberrante.
  // ─────────────────────────────────────────────────────────────────────────────
  it('(c) échelle croissante → rejetée, min_quantity=1, 0 palier', async () => {
    const rawAi = fakeRaw({
      moq_tiers: [
        { min_quantity: 10, unit_price: 20 },
        { min_quantity: 50, unit_price: 22 }, // prix croissant = REJETÉ
      ],
    })

    const { productId, clean } = await runIngestPipeline(rawAi, 'cas-c')

    // ── Vérification sanitizer AVANT écriture ──────────────────────────────────
    expect(clean.moq_tiers, 'échelle croissante doit être rejetée en []').toEqual([])
    const expectedMinQty = clean.moq_tiers[0]?.min_quantity ?? 1
    expect(expectedMinQty, 'minQuantity défaut = 1 (set rejeté)').toBe(1)

    // ── Relecture supplier_products ────────────────────────────────────────────
    const { data: prodRow, error: prodErr } = await sb
      .from('supplier_products')
      .select('min_quantity, stock_quantity')
      .eq('id', productId)
      .single()
    expect(prodErr, `lecture supplier_products: ${prodErr?.message}`).toBeNull()
    expect(prodRow!.min_quantity, 'min_quantity doit être 1 (échelle rejetée)').toBe(1)

    // ── Relecture paliers — doit être vide ─────────────────────────────────────
    const { data: tiers, error: tiersErr } = await sb
      .from('supplier_product_moq_tiers')
      .select('id')
      .eq('supplier_product_id', productId)
    expect(tiersErr, `lecture moq_tiers: ${tiersErr?.message}`).toBeNull()
    expect(tiers, '0 palier attendu (échelle croissante rejetée)').toHaveLength(0)

    console.log(`[cas-c] ✓ min_quantity=${prodRow!.min_quantity}, tiers=[] (échelle croissante rejetée)`)

    // Nettoyage inline
    await sb.from('supplier_products').delete().eq('id', productId)
    createdProductIds.splice(createdProductIds.indexOf(productId), 1)
  })
})
