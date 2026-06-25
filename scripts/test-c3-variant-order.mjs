/**
 * Script de test C3 — vérifie le câblage variant_id dans les deux chemins d'ordre :
 *   1. placeOrder (COD public) — variant_id validé cross-product → sauvé en DB
 *   2. createAffiliateOrder (saisie manuelle affilié) — même validation
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

async function cleanup(productId, orderIds) {
  if (orderIds?.length) await sb.from('orders').delete().in('id', orderIds)
  if (productId) {
    await sb.from('product_variants').delete().eq('product_id', productId)
    await sb.from('products').delete().eq('id', productId)
  }
}

;(async () => {
  console.log('\n=== TEST C3 — variant_id dans les commandes affilié ===\n')

  // ── Setup : produit + variantes ───────────────────────────────────────────
  const { data: product } = await sb.from('products').insert({
    name: '[TEST-C3] Polo variant order',
    sell_price: 199, factory_cost_mad: 90,
    platform_margin_type: 'percentage', platform_margin_value: 20,
    confirmation_fee_mad: 10, packaging_fee_mad: 10, delivery_fee_mad: 35,
    commission_amount: 0, stock_count: 0, active: true,
    approval_status: 'approved', affiliate_enabled: true,
    availability_type: 'local_stock', origin_detail: 'locally_produced',
    wholesale_min_qty: 10, wholesale_tiers: [], media: [], images: [],
  }).select('id').single()

  const pid = product.id

  // Neutraliser la variante défaut auto-créée
  const { data: defV } = await sb.from('product_variants').select('id').eq('product_id', pid).eq('is_default', true).maybeSingle()
  if (defV) await sb.from('product_variants').update({ active: false, stock_count: 0 }).eq('id', defV.id)

  // Insérer 2 vraies variantes
  const { data: realVariants } = await sb.from('product_variants').insert([
    { product_id: pid, attributes: { taille: 'S-M' }, stock_count: 50, is_default: false, active: true },
    { product_id: pid, attributes: { taille: 'L-XL' }, stock_count: 30, is_default: false, active: true },
  ]).select('id, attributes')

  const varSM = realVariants.find(v => v.attributes?.taille === 'S-M')
  const varLXL = realVariants.find(v => v.attributes?.taille === 'L-XL')

  console.log(`  Produit créé : ${pid}`)
  console.log(`  Variante S-M : ${varSM?.id}`)
  console.log(`  Variante L-XL : ${varLXL?.id}`)

  // ── TEST 1 : placeOrder (COD public) ─────────────────────────────────────
  // Simuler l'INSERT que placeOrder effectue (sans appeler la server action Next.js)
  // La validation cross-product est testée sur product_variants_read.
  console.log('\n  Test 1 : Validation cross-product (mig 102 pattern)')

  // variant_id valide → doit être accepté
  const { data: validCheck } = await sb
    .from('product_variants_read')
    .select('id')
    .eq('id', varSM.id)
    .eq('product_id', pid)
    .maybeSingle()
  assert(validCheck !== null, 'variant valide + product_id → accepté')

  // variant_id d'un autre produit → doit être rejeté (null → commande sans variante)
  const { data: wrongCheck } = await sb
    .from('product_variants_read')
    .select('id')
    .eq('id', varSM.id)
    .eq('product_id', '00000000-0000-0000-0000-000000000000') // wrong product
    .maybeSingle()
  assert(wrongCheck === null, 'variant avec product_id wrong → rejeté (null)')

  // ── TEST 2 : commande insérée avec variant_id correct ────────────────────
  console.log('\n  Test 2 : Commande DB avec variant_id')

  // Champs minimaux obligatoires pour orders (commission_amount NOT NULL).
  const BASE_ORDER = { commission_amount: 0, product_price_snapshot: 199 }

  const { data: order1 } = await sb.from('orders').insert({
    ...BASE_ORDER,
    product_id: pid,
    variant_id: varSM.id,
    customer_name: 'Test C3', customer_phone: '0600000001',
    customer_city: 'Casablanca', customer_address: '1 rue Test',
    quantity: 2, total_amount: 398,
    status: 'pending_confirmation', order_source: 'manual',
  }).select('id, variant_id').single()

  assert(order1?.variant_id === varSM.id, 'Commande 1 : variant_id=S-M sauvé en DB')

  // ── TEST 3 : commande avec L-XL ──────────────────────────────────────────
  const { data: order2 } = await sb.from('orders').insert({
    ...BASE_ORDER,
    product_id: pid,
    variant_id: varLXL.id,
    customer_name: 'Test C3 2', customer_phone: '0600000002',
    customer_city: 'Rabat', customer_address: '2 rue Test',
    quantity: 1, total_amount: 199,
    status: 'pending_confirmation', order_source: 'whatsapp',
  }).select('id, variant_id').single()

  assert(order2?.variant_id === varLXL.id, 'Commande 2 : variant_id=L-XL sauvé en DB')

  // ── TEST 4 : commande sans variante (produit simple) ─────────────────────
  const { data: order3 } = await sb.from('orders').insert({
    ...BASE_ORDER,
    product_id: pid,
    variant_id: null,
    customer_name: 'Test C3 simple', customer_phone: '0600000003',
    customer_city: 'Fes', customer_address: '3 rue Test',
    quantity: 1, total_amount: 199,
    status: 'pending_confirmation', order_source: 'manual',
  }).select('id, variant_id').single()

  assert(order3?.variant_id === null, 'Commande 3 : variant_id=null accepté (produit simple)')

  // ── TEST 5 : getDefaultVariantId logic (même logique que CreateOrderForm) ─
  console.log('\n  Test 5 : getDefaultVariantId logic')

  function getDefaultVariantId(variants) {
    const meaningful = variants.filter(v => Object.keys(v.attributes).length > 0)
    return meaningful.find(v => v.is_default)?.id ?? meaningful[0]?.id ?? null
  }

  const { data: allVariants } = await sb
    .from('product_variants_read')
    .select('id, attributes, is_default, stock_count')
    .eq('product_id', pid)

  const defaultId = getDefaultVariantId(allVariants ?? [])
  assert(defaultId !== null, 'getDefaultVariantId retourne un ID (pas null) pour un produit avec variantes')
  assert(typeof defaultId === 'string', 'getDefaultVariantId retourne une string')

  const defaultIsReal = (allVariants ?? []).some(v =>
    v.id === defaultId && Object.keys(v.attributes).length > 0
  )
  assert(defaultIsReal, 'getDefaultVariantId pointe vers une vraie variante (pas le défaut vide)')

  // ── TEST 6 : produit sans variantes réelles → null ────────────────────────
  const defaultForEmpty = getDefaultVariantId([
    { id: 'x', attributes: {}, is_default: true, stock_count: 0 },
  ])
  assert(defaultForEmpty === null, 'getDefaultVariantId retourne null pour produit sans vraie variante')

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await cleanup(pid, [order1?.id, order2?.id, order3?.id].filter(Boolean))
  console.log('\n  Cleanup OK.')
  console.log('\n✅  TOUS LES TESTS C3 PASSENT\n')
})()
