/**
 * Script de test C2 — vérifie que buildWholesaleAxes produit le bon affichage
 * depuis les variantes en stock.
 *
 * RÈGLE ABSOLUE : cible UNIQUEMENT le Supabase local 127.0.0.1:54321
 */
import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!LOCAL_URL.includes('127.0.0.1') && !LOCAL_URL.includes('localhost')) {
  console.error('ABORT : URL non locale — jamais sur la prod.')
  process.exit(1)
}

const sb = createClient(LOCAL_URL, LOCAL_SERVICE_KEY)

function assert(cond, msg) {
  if (!cond) { console.error(`❌  FAILED: ${msg}`); process.exit(1) }
  console.log(`  ✓  ${msg}`)
}

// Miroir exact de buildWholesaleAxes (logique pure, pas d'import Next.js)
function buildWholesaleAxes(variants) {
  const inStock = variants.filter(
    (v) => v.stock_count > 0 && Object.keys(v.attributes).length > 0,
  )
  if (inStock.length === 0) return []
  const axisMap = new Map()
  for (const v of inStock) {
    for (const [axis, value] of Object.entries(v.attributes)) {
      if (!axisMap.has(axis)) axisMap.set(axis, new Set())
      axisMap.get(axis).add(value)
    }
  }
  return Array.from(axisMap.entries()).map(([axis, values]) => ({
    axis,
    label: axis.charAt(0).toUpperCase() + axis.slice(1),
    values: Array.from(values),
  }))
}

async function cleanup(productId) {
  await sb.from('product_variants').delete().eq('product_id', productId)
  await sb.from('products').delete().eq('id', productId)
}

;(async () => {
  console.log('\n=== TEST C2 — WholesaleVariantDisplay axes calculation ===\n')

  // ── Créer un produit test + variantes ──────────────────────────────────────
  const { data: product } = await sb.from('products').insert({
    name: '[TEST-C2] T-shirt multi-axes',
    sell_price: 149, factory_cost_mad: 80,
    platform_margin_type: 'percentage', platform_margin_value: 20,
    confirmation_fee_mad: 10, packaging_fee_mad: 10, delivery_fee_mad: 35,
    commission_amount: 0, stock_count: 0, active: true,
    approval_status: 'approved', affiliate_enabled: true,
    availability_type: 'local_stock', origin_detail: 'locally_produced',
    wholesale_min_qty: 10, wholesale_tiers: [], media: [], images: [],
  }).select('id').single()

  const pid = product.id

  // Le trigger mig-096 crée automatiquement la variante Défaut (active=true, attrs={}, stock=0).
  // On neutralise d'abord le défaut (comme le ferait addProductVariant en C1),
  // puis on insère les vraies variantes avec 2 axes (taille + couleur), dont 1 en rupture.
  const { data: autoDefault } = await sb.from('product_variants').select('id').eq('product_id', pid).eq('is_default', true).maybeSingle()
  if (autoDefault) {
    await sb.from('product_variants').update({ active: false, stock_count: 0 }).eq('id', autoDefault.id)
  }
  await sb.from('product_variants').insert([
    { product_id: pid, attributes: { taille: 'S-M', couleur: 'noir' }, stock_count: 30, is_default: false, active: true },
    { product_id: pid, attributes: { taille: 'L-XL', couleur: 'noir' }, stock_count: 20, is_default: false, active: true },
    { product_id: pid, attributes: { taille: '2XL-3XL', couleur: 'noir' }, stock_count: 0, is_default: false, active: true }, // rupture → exclu
    { product_id: pid, attributes: { taille: 'S-M', couleur: 'bleu' }, stock_count: 15, is_default: false, active: true },
  ])

  // Lire via la vue public (comme le fait la page wholesale)
  const { data: variantsRaw } = await sb
    .from('product_variants_read')
    .select('id, attributes, is_default, stock_count')
    .eq('product_id', pid)

  console.log(`  Variantes retournées par product_variants_read : ${variantsRaw?.length ?? 0}`)
  ;(variantsRaw ?? []).forEach((v) =>
    console.log(`    attrs:${JSON.stringify(v.attributes)} stock:${v.stock_count}`)
  )
  console.log()

  const axes = buildWholesaleAxes(variantsRaw ?? [])
  console.log('  Axes calculés :')
  axes.forEach((a) => console.log(`    ${a.label} : ${a.values.join(' · ')}`))
  console.log()

  // ── Assertions ─────────────────────────────────────────────────────────────
  console.log('  Assertions :')

  assert(axes.length === 2, '2 axes (taille + couleur)')

  const tailleAxis = axes.find((a) => a.axis === 'taille')
  assert(tailleAxis !== undefined, 'axe "taille" présent')
  assert(tailleAxis?.values.includes('S-M'), 'S-M présente (stock=30)')
  assert(tailleAxis?.values.includes('L-XL'), 'L-XL présente (stock=20)')
  assert(!tailleAxis?.values.includes('2XL-3XL'), '2XL-3XL ABSENTE (stock=0 → rupture exclue)')

  const couleurAxis = axes.find((a) => a.axis === 'couleur')
  assert(couleurAxis !== undefined, 'axe "couleur" présent')
  assert(couleurAxis?.values.includes('noir'), 'couleur "noir" présente')
  assert(couleurAxis?.values.includes('bleu'), 'couleur "bleu" présente')

  // Cas simple : produit sans variantes réelles → axes = []
  const axesEmpty = buildWholesaleAxes([{ attributes: {}, stock_count: 0, is_default: true }])
  assert(axesEmpty.length === 0, 'Pas de variantes réelles → axes vide (composant caché)')

  // Cas produit simple (1 seule variante, attrs non-vides mais 1 seule valeur)
  const axesSingle = buildWholesaleAxes([{ attributes: { taille: 'M' }, stock_count: 10, is_default: false }])
  assert(axesSingle.length === 1, 'Produit à 1 seule variante → 1 axe affiché quand même')
  assert(axesSingle[0].values[0] === 'M', 'Valeur unique "M" correcte')

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await cleanup(pid)
  console.log('\n  Cleanup OK.')
  console.log('\n✅  TOUS LES TESTS C2 PASSENT\n')
})()
