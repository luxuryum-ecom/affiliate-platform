/**
 * Uniformisation paliers grossiste — preuves RUNTIME de `getIndicativeMadTiers`
 * (src/lib/supplier/indicative-tiers.ts), le helper d'affichage SEUL (fiche
 * marketplace `/wholesale/marketplace/[id]`) qui dérive des paliers grossiste
 * MAD INDICATIFS pour un produit fournisseur INTERNATIONAL, en réutilisant
 * `buildMirrorTiers` (déjà audité, src/lib/supplier-pricing.ts:120).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status` (getLocalSupabaseEnv).
 *
 * Cas prouvés :
 *  (a) APPROUVÉ + fx=10 + marge 20% + paliers décroissants → ≥2 paliers MAD entiers,
 *      strictement décroissants, triés par min_qty, max_qty borné sauf le dernier.
 *      Valeur exacte vérifiée : 20 USD × 10 × 1.2 = 240 MAD.
 *  (b) APPROUVÉ mais fx_rate_source_to_mad NULL → [] (jamais de MAD fabriqué).
 *  (c) approval_status ≠ 'approved' (pending_review) avec fx + paliers → [] (garde visibilité).
 *  (d) APPROUVÉ sans aucun palier source → [].
 *  (e) ISOLATION : la forme du retour ne porte NI fx_rate NI taux de marge (WholesaleTier
 *      pur : uniquement min_qty / price_per_unit / max_qty?).
 *
 * RÈGLES ABSOLUES respectées (CLAUDE.md) :
 *  - JAMAIS la prod : assertLocalSupabase() garantit URL = 127.0.0.1
 *  - Clés via getLocalSupabaseEnv() (supabase status), jamais .env.local
 *  - Aucun secret en dur dans ce fichier
 *  - Ne modifie AUCUN code applicatif (test seul)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { getIndicativeMadTiers } from '@/lib/supplier/indicative-tiers'

// ── Suffixe unique pour isoler ce run ────────────────────────────────────────
const testTag = `uniformisation-indicative-tiers-${Date.now()}`

// ── État partagé (peuplé dans beforeAll) ─────────────────────────────────────
let sb: SupabaseClient
let supplierId: string
const createdProductIds: string[] = []

// FX figé : 1 USD = 10 MAD (numeric arrondi, cohérent avec le seed 050 exchange_rates).
const FX_RATE = 10

type SeedOpts = {
  label: string
  approvalStatus: 'approved' | 'pending_review' | 'blocked'
  fxRate: number | null
  applyMargin: boolean
  marginType?: 'percentage' | 'fixed'
  marginValue?: number | null
  tiers?: { min_quantity: number; unit_price_usd: number }[]
}

async function seedSupplierProduct(opts: SeedOpts): Promise<string> {
  const { data, error } = await sb
    .from('supplier_products')
    .insert({
      supplier_id: supplierId,
      product_name: `[${testTag}] ${opts.label}`,
      category: 'test',
      unit: 'pcs',
      supplier_type: 'international',
      availability_type: 'import_on_demand',
      source_currency: 'USD',
      price_source: 20,
      fx_rate_source_to_mad: opts.fxRate,
      approval_status: opts.approvalStatus,
      apply_platform_margin: opts.applyMargin,
      platform_margin_type: opts.marginType ?? 'percentage',
      platform_margin_value: opts.marginValue ?? null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed supplier_products (${opts.label}): ${error?.message ?? 'data null'}`)
  const id = (data as { id: string }).id
  createdProductIds.push(id)

  if (opts.tiers && opts.tiers.length > 0) {
    const { error: tierErr } = await sb.from('supplier_product_moq_tiers').insert(
      opts.tiers.map((t) => ({
        supplier_product_id: id,
        min_quantity: t.min_quantity,
        unit_price_usd: t.unit_price_usd,
      })),
    )
    if (tierErr) throw new Error(`seed supplier_product_moq_tiers (${opts.label}): ${tierErr.message}`)
  }

  return id
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Uniformisation paliers grossiste — getIndicativeMadTiers (intégration LOCAL)', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'uniformisation-indicative-tiers-setup')
    console.log(`[guard] URL locale confirmée : ${env.url}`)

    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey

    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userErr } = await sb.auth.admin.createUser({
      email: `supplier-${testTag}@test.local`,
      password: 'TestUniformIndic2026!',
      email_confirm: true,
      user_metadata: { role: 'supplier', full_name: `Supplier Uniform ${testTag}` },
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
  it('(a) APPROUVÉ + fx=10 + marge 20% + paliers décroissants → paliers MAD entiers, décroissants, triés, bornés', async () => {
    const productId = await seedSupplierProduct({
      label: 'approved-full',
      approvalStatus: 'approved',
      fxRate: FX_RATE,
      applyMargin: true,
      marginType: 'percentage',
      marginValue: 20,
      tiers: [
        { min_quantity: 10, unit_price_usd: 20 },
        { min_quantity: 50, unit_price_usd: 18 },
        { min_quantity: 100, unit_price_usd: 16 },
      ],
    })

    const tiers = await getIndicativeMadTiers(productId)
    console.log(`[a] paliers MAD dérivés: ${JSON.stringify(tiers)}`)

    expect(tiers.length, 'au moins 2 paliers MAD').toBeGreaterThanOrEqual(2)

    // Entiers MAD (zéro décimale facturée)
    for (const t of tiers) {
      expect(Number.isInteger(t.price_per_unit), `price_per_unit doit être un entier: ${t.price_per_unit}`).toBe(true)
    }

    // Triés par min_qty croissant
    const minQtys = tiers.map((t) => t.min_qty)
    expect(minQtys).toEqual([...minQtys].sort((a, b) => a - b))

    // Strictement décroissants en prix (plus on achète, moins cher l'unité)
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].price_per_unit, `palier ${i} doit être strictement < palier ${i - 1}`).toBeLessThan(
        tiers[i - 1].price_per_unit,
      )
    }

    // max_qty borné sauf le dernier (ouvert)
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(tiers[i].max_qty, `palier ${i} (non dernier) doit avoir max_qty borné`).toBeDefined()
      expect(tiers[i].max_qty).toBeLessThan(tiers[i + 1].min_qty)
    }
    expect(tiers[tiers.length - 1].max_qty, 'dernier palier ouvert (max_qty undefined)').toBeUndefined()

    // Valeur exacte : 20 USD × 10 (fx) × 1.2 (marge 20%) = 240 MAD, sur le 1er palier (min_qty=10)
    const firstTier = tiers.find((t) => t.min_qty === 10)
    expect(firstTier, 'palier min_qty=10 présent').toBeDefined()
    expect(firstTier!.price_per_unit, '20 USD × 10 × 1.2 = 240 MAD').toBe(240)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(b) APPROUVÉ mais fx_rate_source_to_mad NULL → [] (jamais de MAD fabriqué)', async () => {
    const productId = await seedSupplierProduct({
      label: 'approved-no-fx',
      approvalStatus: 'approved',
      fxRate: null,
      applyMargin: true,
      marginType: 'percentage',
      marginValue: 20,
      tiers: [
        { min_quantity: 10, unit_price_usd: 20 },
        { min_quantity: 50, unit_price_usd: 18 },
      ],
    })

    const tiers = await getIndicativeMadTiers(productId)
    expect(tiers, 'fx NULL → aucun palier MAD fabriqué').toEqual([])
    console.log(`[b] ✓ fx NULL → [] (${tiers.length} palier)`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it("(c) approval_status ≠ 'approved' (pending_review) avec fx + paliers → [] (garde visibilité)", async () => {
    const productId = await seedSupplierProduct({
      label: 'pending-review',
      approvalStatus: 'pending_review',
      fxRate: FX_RATE,
      applyMargin: true,
      marginType: 'percentage',
      marginValue: 20,
      tiers: [
        { min_quantity: 10, unit_price_usd: 20 },
        { min_quantity: 50, unit_price_usd: 18 },
      ],
    })

    const tiers = await getIndicativeMadTiers(productId)
    expect(tiers, 'produit non approuvé → aucun palier visible (parité fiche)').toEqual([])
    console.log(`[c] ✓ pending_review → [] (${tiers.length} palier)`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(d) APPROUVÉ sans aucun palier source → []', async () => {
    const productId = await seedSupplierProduct({
      label: 'approved-no-tiers',
      approvalStatus: 'approved',
      fxRate: FX_RATE,
      applyMargin: true,
      marginType: 'percentage',
      marginValue: 20,
      // pas de tiers
    })

    const tiers = await getIndicativeMadTiers(productId)
    expect(tiers, 'aucun palier source → []').toEqual([])
    console.log(`[d] ✓ pas de palier source → [] (${tiers.length} palier)`)
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('(e) ISOLATION : le résultat est DÉRIVÉ (MAD) — ne porte NI fx_rate NI taux de marge', async () => {
    const productId = await seedSupplierProduct({
      label: 'isolation-shape',
      approvalStatus: 'approved',
      fxRate: FX_RATE,
      applyMargin: true,
      marginType: 'fixed',
      marginValue: 5,
      tiers: [
        { min_quantity: 10, unit_price_usd: 20 },
        { min_quantity: 50, unit_price_usd: 18 },
      ],
    })

    const tiers = await getIndicativeMadTiers(productId)
    expect(tiers.length).toBeGreaterThanOrEqual(2)

    const allowedKeys = new Set(['min_qty', 'max_qty', 'price_per_unit'])
    for (const t of tiers) {
      const keys = Object.keys(t)
      for (const k of keys) {
        expect(allowedKeys.has(k), `clé inattendue "${k}" — fuite potentielle fx/marge`).toBe(true)
      }
    }

    // Aucune trace de fx_rate / marge dans la sérialisation du retour (anti-court-circuit).
    const serialized = JSON.stringify(tiers)
    expect(serialized).not.toMatch(/fx_rate|margin|platform_margin/i)
    console.log(`[e] ✓ forme WholesaleTier pure (${Object.keys(tiers[0]).join(', ')}), zéro fuite fx/marge`)
  })
})
