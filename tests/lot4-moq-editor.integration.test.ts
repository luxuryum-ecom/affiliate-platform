/**
 * LOT 4 — Preuves RUNTIME : séquence d'écriture de l'éditeur MOQ + paliers en
 * modération admin (approveSupplierProduct, src/app/actions/supplier-products.ts)
 *
 * La server action exige une auth admin (requireAdmin) — non simulable proprement
 * ici. On teste donc la SÉQUENCE D'ÉCRITURE qu'elle exécute, exactement dans l'ORDRE
 * réel, contre la vraie base LOCAL :
 *   1. judgeEditedTiers (module pur, déjà couvert par lot4-moq-editor.test.ts)
 *   2. DELETE scopé  supplier_product_moq_tiers .eq('supplier_product_id', id)
 *   3. insertMoqTiers(tiersToInsert)
 *   4. buildMirrorTiers(nouveaux paliers, fx, marge) → paliers MAD entiers du miroir
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 *
 * Cas prouvés :
 *  (f-1) ROUND-TRIP 6 paliers : ré-approbation SANS changement → 6 lignes identiques,
 *        zéro troncature, zéro wipe.
 *  (f-2) IDEMPOTENCE : rejouer la séquence 2× → toujours N lignes (pas de doublon).
 *  (b/f-3) ÉDITION : un prix change (décroissance conservée) → base reflète le
 *        nouveau set ; buildMirrorTiers produit des paliers MAD ENTIERS cohérents.
 *  (a) CLEAR : set vide (éditeur vidé) → delete puis 0 insert → 0 palier restant.
 *  (scope) DELETE scopé : le delete du produit A ne touche PAS les paliers du B.
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { judgeEditedTiers, type EditedTier } from '@/lib/supplier/moq-editor'
import { insertMoqTiers } from '@/lib/supplier/moq-tiers'
import { buildMirrorTiers } from '@/lib/supplier-pricing'

// ── Suffixe unique pour isoler ce run ────────────────────────────────────────
const testTag = `lot4-moq-editor-${Date.now()}`

// ── État partagé (peuplé dans beforeAll) ─────────────────────────────────────
let sb: SupabaseClient
let supplierId: string
const createdProductIds: string[] = []

// FX figé : 1 USD = 10 MAD (numeric arrondi, cohérent avec le seed 050 exchange_rates).
const FX_RATE = 10

/**
 * Réplique EXACTEMENT la séquence d'écriture LOT 4 de approveSupplierProduct
 * (src/app/actions/supplier-products.ts, lignes ~344-361) : DELETE scopé PUIS
 * insertMoqTiers — SEULEMENT si le jugement est OK (garde-fou anti-wipe : on
 * n'appelle cette fonction qu'après un judgeEditedTiers ok:true côté appelant).
 */
async function runWriteSequence(productId: string, tiersToInsert: EditedTier[]): Promise<void> {
  const { error: delErr } = await sb.from('supplier_product_moq_tiers').delete().eq('supplier_product_id', productId)
  if (delErr) throw new Error(`delete scopé: ${delErr.message}`)
  const { error: insErr } = await insertMoqTiers(sb, productId, tiersToInsert)
  if (insErr) throw new Error(`insertMoqTiers: ${insErr}`)
}

async function readTiers(productId: string): Promise<{ min_quantity: number; unit_price_usd: string }[]> {
  const { data, error } = await sb
    .from('supplier_product_moq_tiers')
    .select('min_quantity, unit_price_usd')
    .eq('supplier_product_id', productId)
    .order('min_quantity', { ascending: true })
  if (error) throw new Error(`lecture paliers: ${error.message}`)
  return (data ?? []) as { min_quantity: number; unit_price_usd: string }[]
}

async function seedSupplierProduct(label: string, minQuantity: number, priceSource: number): Promise<string> {
  const { data, error } = await sb
    .from('supplier_products')
    .insert({
      supplier_id: supplierId,
      product_name: `[${testTag}] ${label}`,
      category: 'test',
      unit: 'pcs',
      min_quantity: minQuantity,
      source_currency: 'USD',
      price_source: priceSource,
      fx_rate_source_to_mad: FX_RATE,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed supplier_products (${label}): ${error?.message ?? 'data null'}`)
  const id = (data as { id: string }).id
  createdProductIds.push(id)
  return id
}

// ─────────────────────────────────────────────────────────────────────────────
describe('LOT 4 — séquence d\'écriture paliers MOQ éditeur admin (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'lot4-moq-editor-setup')
    console.log(`[guard] URL locale confirmée : ${env.url}`)

    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userErr } = await sb.auth.admin.createUser({
      email: `supplier-${testTag}@test.local`,
      password: 'TestLot4Editor2026!',
      email_confirm: true,
      user_metadata: { role: 'supplier', full_name: `Supplier Lot4 ${testTag}` },
    })
    if (userErr || !userData.user) throw new Error(`createUser supplier: ${userErr?.message ?? 'user null'}`)
    supplierId = userData.user.id
    console.log(`[setup] supplier seedé : ${supplierId}`)
  }, 60_000)

  afterAll(async () => {
    if (!sb) return
    for (const pid of createdProductIds) {
      await sb.from('supplier_product_moq_tiers').delete().eq('supplier_product_id', pid)
      await sb.from('supplier_products').delete().eq('id', pid)
    }
    if (supplierId) await sb.auth.admin.deleteUser(supplierId)
    console.log(`[cleanup] ${createdProductIds.length} produit(s) + supplier supprimés`)
  }, 30_000)

  // ───────────────────────────────────────────────────────────────────────────
  it('(f-1) ROUND-TRIP 6 paliers : ré-approbation SANS changement → 6 lignes identiques, zéro troncature', async () => {
    const productId = await seedSupplierProduct('roundtrip-6', 10, 20)

    const sixTiers: EditedTier[] = [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 20, unit_price_usd: '18.50' },
      { min_quantity: 50, unit_price_usd: '16.00' },
      { min_quantity: 100, unit_price_usd: '14.50' },
      { min_quantity: 200, unit_price_usd: '13.00' },
      { min_quantity: 500, unit_price_usd: '11.50' },
    ]

    // Seed initial (comme le flux web à la soumission)
    const seeded = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: sixTiers, basePriceSource: 20 })
    expect(seeded.ok, `jugement initial doit passer: ${!seeded.ok ? seeded.error : ''}`).toBe(true)
    if (!seeded.ok) return
    await runWriteSequence(productId, seeded.tiersToInsert)

    const afterSeed = await readTiers(productId)
    expect(afterSeed, '6 lignes après seed').toHaveLength(6)
    console.log(`[f-1] seed initial: ${afterSeed.length} lignes`)

    // Ré-approbation SANS changement : mêmes 6 lignes rejugées
    const rejudged = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: sixTiers, basePriceSource: 20 })
    expect(rejudged.ok).toBe(true)
    if (!rejudged.ok) return
    await runWriteSequence(productId, rejudged.tiersToInsert)

    const afterReapproval = await readTiers(productId)
    expect(afterReapproval, 'exactement 6 paliers après ré-approbation (zéro troncature, zéro wipe)').toHaveLength(6)
    expect(afterReapproval.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: Number(t.unit_price_usd) }))).toEqual(
      sixTiers.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: Number(t.unit_price_usd) })),
    )
    console.log(`[f-1] ✓ round-trip: ${afterReapproval.length} lignes, valeurs identiques au seed`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(f-2) IDEMPOTENCE : rejouer la séquence 2× → toujours exactement N lignes (pas de doublon)', async () => {
    const productId = await seedSupplierProduct('idempotence', 10, 20)
    const tiers: EditedTier[] = [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '16.00' },
      { min_quantity: 100, unit_price_usd: '14.00' },
    ]
    const judged = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: tiers, basePriceSource: 20 })
    expect(judged.ok).toBe(true)
    if (!judged.ok) return

    await runWriteSequence(productId, judged.tiersToInsert)
    const after1 = await readTiers(productId)
    expect(after1, 'après 1er passage: 3 lignes').toHaveLength(3)

    await runWriteSequence(productId, judged.tiersToInsert)
    const after2 = await readTiers(productId)
    expect(after2, 'après 2e passage: toujours 3 lignes (pas 6)').toHaveLength(3)

    await runWriteSequence(productId, judged.tiersToInsert)
    const after3 = await readTiers(productId)
    expect(after3, 'après 3e passage: toujours 3 lignes').toHaveLength(3)

    console.log(`[f-2] ✓ idempotence: 3 passages → toujours ${after3.length} lignes`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(b/f-3) ÉDITION puis ré-approbation : prix changé → base reflète le nouveau set ; buildMirrorTiers produit des MAD entiers cohérents', async () => {
    const productId = await seedSupplierProduct('edition', 10, 20)

    const original: EditedTier[] = [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '16.00' },
      { min_quantity: 100, unit_price_usd: '14.50' },
    ]
    const seeded = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: original, basePriceSource: 20 })
    expect(seeded.ok).toBe(true)
    if (!seeded.ok) return
    await runWriteSequence(productId, seeded.tiersToInsert)

    // Édition : le prix du palier 50 change 16.00 → 15.00 (décroissance conservée : 20 > 15 > 14.50)
    const edited: EditedTier[] = [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '15.00' },
      { min_quantity: 100, unit_price_usd: '14.50' },
    ]
    const rejudged = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: edited, basePriceSource: 20 })
    expect(rejudged.ok, `jugement édité doit passer: ${!rejudged.ok ? rejudged.error : ''}`).toBe(true)
    if (!rejudged.ok) return
    await runWriteSequence(productId, rejudged.tiersToInsert)

    const afterEdit = await readTiers(productId)
    expect(afterEdit, '3 lignes après édition').toHaveLength(3)
    expect(afterEdit.map((t) => Number(t.unit_price_usd))).toEqual([20, 15, 14.5])
    console.log(`[b/f-3] base après édition: ${JSON.stringify(afterEdit.map((t) => ({ q: t.min_quantity, p: Number(t.unit_price_usd) })))}`)

    // buildMirrorTiers sur le NOUVEAU set : fx=10, marge 20% appliquée
    // coûts MAD = prix_source * 10 : 200, 150, 145
    // sell = coût * 1.2 (Math.round) : 240, 180, 174
    const mirrorTiers = buildMirrorTiers(
      rejudged.tiersToInsert.map((t) => ({ min_quantity: t.min_quantity, unit_price_usd: Number(t.unit_price_usd) })),
      FX_RATE,
      true,
      'percentage',
      20,
    )
    expect(mirrorTiers).toEqual([
      { min_qty: 10, price_per_unit: 240, max_qty: 49 },
      { min_qty: 50, price_per_unit: 180, max_qty: 99 },
      { min_qty: 100, price_per_unit: 174 },
    ])
    console.log(`[b/f-3] ✓ buildMirrorTiers (fx=10, marge 20%): ${JSON.stringify(mirrorTiers)}`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(a) CLEAR : set vide (éditeur vidé) → delete puis 0 insert → 0 palier restant (produit revendable au prix unitaire)', async () => {
    const productId = await seedSupplierProduct('clear', 10, 20)
    const tiers: EditedTier[] = [
      { min_quantity: 10, unit_price_usd: '20.00' },
      { min_quantity: 50, unit_price_usd: '16.00' },
    ]
    const seeded = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: tiers, basePriceSource: 20 })
    expect(seeded.ok).toBe(true)
    if (!seeded.ok) return
    await runWriteSequence(productId, seeded.tiersToInsert)
    expect(await readTiers(productId), 'seed initial: 2 lignes').toHaveLength(2)

    // Éditeur vidé : set vide → palier OPTIONNEL (retour au prix unitaire)
    const cleared = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: [], basePriceSource: 20 })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.tiersToInsert).toEqual([])
    await runWriteSequence(productId, cleared.tiersToInsert)

    const afterClear = await readTiers(productId)
    expect(afterClear, '0 palier après clear').toHaveLength(0)
    console.log(`[a] ✓ clear: ${afterClear.length} palier restant`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(scope) DELETE scopé : le delete du produit A ne touche PAS les paliers du produit B', async () => {
    const productA = await seedSupplierProduct('scope-a', 10, 20)
    const productB = await seedSupplierProduct('scope-b', 5, 30)

    const tiersA: EditedTier[] = [{ min_quantity: 10, unit_price_usd: '20.00' }]
    const tiersB: EditedTier[] = [
      { min_quantity: 5, unit_price_usd: '30.00' },
      { min_quantity: 25, unit_price_usd: '27.00' },
    ]

    const judgedA = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: tiersA, basePriceSource: 20 })
    const judgedB = judgeEditedTiers({ editedMoq: null, existingMoq: 5, editedTiers: tiersB, basePriceSource: 30 })
    expect(judgedA.ok).toBe(true)
    expect(judgedB.ok).toBe(true)
    if (!judgedA.ok || !judgedB.ok) return

    await runWriteSequence(productA, judgedA.tiersToInsert)
    await runWriteSequence(productB, judgedB.tiersToInsert)

    expect(await readTiers(productA), 'A a 1 ligne').toHaveLength(1)
    expect(await readTiers(productB), 'B a 2 lignes').toHaveLength(2)

    // Ré-approbation SANS changement sur A seul (le flux réel : 1 seul produit à la fois)
    const rejudgedA = judgeEditedTiers({ editedMoq: null, existingMoq: 10, editedTiers: tiersA, basePriceSource: 20 })
    expect(rejudgedA.ok).toBe(true)
    if (!rejudgedA.ok) return
    await runWriteSequence(productA, rejudgedA.tiersToInsert)

    const tiersAAfter = await readTiers(productA)
    const tiersBAfter = await readTiers(productB)
    expect(tiersAAfter, 'A toujours 1 ligne après son propre re-write').toHaveLength(1)
    expect(tiersBAfter, 'B INTACT : toujours 2 lignes, non affecté par le delete scopé de A').toHaveLength(2)
    expect(tiersBAfter.map((t) => Number(t.unit_price_usd))).toEqual([30, 27])
    console.log(`[scope] ✓ delete .eq(supplier_product_id, A) n'a pas touché B (${tiersBAfter.length} lignes intactes)`)
  })
})
