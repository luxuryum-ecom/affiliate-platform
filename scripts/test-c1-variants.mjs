/**
 * Script de test C1 — crée un produit de test + 3 variantes, vérifie le comportement
 * de la neutralisation du Défaut et du B3 sync.
 *
 * RÈGLE ABSOLUE : cible UNIQUEMENT le Supabase local 127.0.0.1:54321
 * Toute tentative de pointer sur la prod est refusée fail-fast.
 *
 * Usage : node scripts/test-c1-variants.mjs
 */

import { createClient } from '@supabase/supabase-js'

// ── Garde : refuse de tourner sur la prod ──────────────────────────────────────
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!LOCAL_URL.includes('127.0.0.1') && !LOCAL_URL.includes('localhost')) {
  console.error('ABORT : URL non locale détectée — ce script ne tourne jamais sur la prod.')
  process.exit(1)
}

const sb = createClient(LOCAL_URL, LOCAL_SERVICE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌  ASSERT FAILED: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✓  ${msg}`)
}

async function cleanup(productId) {
  if (!productId) return
  await sb.from('product_variants').delete().eq('product_id', productId)
  await sb.from('products').delete().eq('id', productId)
}

// ── Nettoyage du produit test laissé par une précédente tentative ─────────────
async function cleanupOrphan() {
  const { data } = await sb
    .from('products')
    .select('id')
    .eq('name', '[TEST-C1] T-shirt tailles multiples')
  for (const p of data ?? []) {
    await sb.from('product_variants').delete().eq('product_id', p.id)
    await sb.from('products').delete().eq('id', p.id)
  }
}

// ── Simuler addProductVariant (logique identique à la server action) ───────────
async function addVariant(productId, attributePairs, stock) {
  const attributes = {}
  for (const { axis, value } of attributePairs) {
    attributes[axis.trim().toLowerCase()] = value.trim()
  }

  // Duplicate check
  const { data: existing } = await sb
    .from('product_variants')
    .select('id, attributes')
    .eq('product_id', productId)

  const isDuplicate = (existing ?? []).some((v) => {
    const a = v.attributes ?? {}
    if (Object.keys(a).length !== Object.keys(attributes).length) return false
    return Object.entries(attributes).every(([k, val]) => a[k] === val)
  })
  if (isDuplicate) throw new Error(`Duplicate attributes: ${JSON.stringify(attributes)}`)

  const { error } = await sb.from('product_variants').insert({
    product_id: productId,
    attributes,
    stock_count: stock,
    is_default: false,
    active: true,
  })
  if (error) throw new Error(`Insert failed: ${error.message}`)

  // Auto-neutralise default placeholder
  const { data: defaultVariant } = await sb
    .from('product_variants')
    .select('id, attributes')
    .eq('product_id', productId)
    .eq('is_default', true)
    .maybeSingle()

  if (defaultVariant && Object.keys(defaultVariant.attributes ?? {}).length === 0) {
    await sb
      .from('product_variants')
      .update({ active: false, stock_count: 0 })
      .eq('id', defaultVariant.id)
  }

  // B3 sync
  const { data: activeVariants } = await sb
    .from('product_variants')
    .select('stock_count')
    .eq('product_id', productId)
    .eq('active', true)

  const total = (activeVariants ?? []).reduce((s, v) => s + (v.stock_count ?? 0), 0)
  await sb.from('products').update({ stock_count: total }).eq('id', productId)
}

// ── Main ──────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('\n=== TEST C1 — Variantes + Défaut neutralisé + B3 sync ===\n')

  await cleanupOrphan()

  // ── 1. Créer un produit de test ──────────────────────────────────────────────
  const { data: product, error: prodErr } = await sb
    .from('products')
    .insert({
      name: '[TEST-C1] T-shirt tailles multiples',
      sell_price: 149,
      factory_cost_mad: 80,
      platform_margin_type: 'percentage',
      platform_margin_value: 20,
      confirmation_fee_mad: 10,
      packaging_fee_mad: 10,
      delivery_fee_mad: 35,
      commission_amount: 0,
      stock_count: 1000, // valeur initiale avant variantes
      active: true,
      approval_status: 'approved',
      affiliate_enabled: true,
      availability_type: 'local_stock',
      origin_detail: 'locally_produced',
      wholesale_min_qty: 10,
      wholesale_tiers: [],
      media: [],
      images: [],
    })
    .select('id, stock_count')
    .single()

  if (prodErr) {
    console.error(`❌  Création produit : ${prodErr.message}`)
    process.exit(1)
  }
  const productId = product.id
  console.log(`  Produit créé : ${productId}  (stock initial = ${product.stock_count})\n`)

  // Migration 096 backfille automatiquement une variante Défaut — vérifions qu'elle existe
  const { data: allVarsBefore } = await sb
    .from('product_variants')
    .select('id, is_default, active, stock_count, attributes')
    .eq('product_id', productId)

  console.log('  État AVANT ajout variantes :')
  ;(allVarsBefore ?? []).forEach((v) =>
    console.log(`    - id:${v.id.slice(0,8)} is_default:${v.is_default} active:${v.active} stock:${v.stock_count} attrs:${JSON.stringify(v.attributes)}`)
  )
  console.log()

  // ── 2. Ajouter les 3 variantes réelles ───────────────────────────────────────
  console.log('  Ajout variante S-M  (stock=30)...')
  await addVariant(productId, [{ axis: 'taille', value: 'S-M' }], 30)

  console.log('  Ajout variante L-XL (stock=30)...')
  await addVariant(productId, [{ axis: 'taille', value: 'L-XL' }], 30)

  console.log('  Ajout variante 2XL-3XL (stock=20)...')
  await addVariant(productId, [{ axis: 'taille', value: '2XL-3XL' }], 20)

  console.log()

  // ── 3. Lire l'état final ─────────────────────────────────────────────────────
  const { data: allVarsAfter } = await sb
    .from('product_variants')
    .select('id, is_default, active, stock_count, attributes')
    .eq('product_id', productId)
    .order('created_at')

  const { data: productAfter } = await sb
    .from('products')
    .select('stock_count')
    .eq('id', productId)
    .single()

  console.log('  État APRÈS ajout variantes :')
  ;(allVarsAfter ?? []).forEach((v) =>
    console.log(`    - id:${v.id.slice(0,8)} is_default:${v.is_default} active:${v.active} stock:${v.stock_count} attrs:${JSON.stringify(v.attributes)}`)
  )
  console.log()

  // ── 4. Assertions ─────────────────────────────────────────────────────────────
  console.log('  Assertions :')

  const activeVars = (allVarsAfter ?? []).filter((v) => v.active)
  const realVars = activeVars.filter((v) => Object.keys(v.attributes ?? {}).length > 0)
  const defaultVar = (allVarsAfter ?? []).find((v) => v.is_default)

  assert(allVarsAfter?.length === 4, '4 variantes totales (1 Défaut + 3 réelles)')
  assert(realVars.length === 3, '3 variantes réelles actives')
  assert(defaultVar !== undefined, 'variante Défaut existe toujours')
  assert(defaultVar?.active === false, 'variante Défaut est INACTIVE')
  assert(defaultVar?.stock_count === 0, 'variante Défaut a stock=0')
  assert(productAfter?.stock_count === 80, `products.stock_count = 80 (B3 sync), valeur réelle = ${productAfter?.stock_count}`)

  const smVar = (allVarsAfter ?? []).find((v) => v.attributes?.taille === 'S-M')
  const lxlVar = (allVarsAfter ?? []).find((v) => v.attributes?.taille === 'L-XL')
  const xxlVar = (allVarsAfter ?? []).find((v) => v.attributes?.taille === '2XL-3XL')

  assert(smVar?.stock_count === 30, 'S-M stock = 30')
  assert(lxlVar?.stock_count === 30, 'L-XL stock = 30')
  assert(xxlVar?.stock_count === 20, '2XL-3XL stock = 20')

  // ── 5. Vérifier la vue product_variants_read (côté public) ────────────────────
  console.log()
  console.log('  Vérification vue product_variants_read (public read) :')
  const { data: publicVariants } = await sb
    .from('product_variants_read')
    .select('id, attributes, stock_count')
    .eq('product_id', productId)

  console.log(`    Variantes visibles côté client : ${publicVariants?.length ?? 0}`)
  ;(publicVariants ?? []).forEach((v) =>
    console.log(`    - attrs:${JSON.stringify(v.attributes)} stock:${v.stock_count}`)
  )

  assert(
    (publicVariants ?? []).length === 3,
    'La vue product_variants_read expose exactement 3 variantes (Défaut inactif exclu)'
  )
  const meaningfulVars = (publicVariants ?? []).filter(
    (v) => Object.keys(v.attributes ?? {}).length > 0
  )
  assert(
    meaningfulVars.length === 3,
    'Les 3 variantes ont des attributs non-vides → VariantSelector les affichera'
  )

  // ── 6. Cleanup ────────────────────────────────────────────────────────────────
  console.log('\n  Cleanup...')
  await cleanup(productId)
  console.log('  Produit test supprimé.')

  console.log('\n✅  TOUS LES TESTS C1 PASSENT\n')
})()
