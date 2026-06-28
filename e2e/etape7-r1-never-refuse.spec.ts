/**
 * Runtime QA — Réserve R1 : NEVER-REFUSE via le VRAI server action submitWholesaleOrder
 *
 * OBJECTIF : prouver que qty > stock ne génère PAS "Stock insuffisant" mais
 *   redirige vers /wholesale/orders/{id}?submitted=1&restocking=1 et crée
 *   l'ordre en DB avec variant_id set.
 *
 * CHEMIN EXERCÉ : vrai formulaire SubmitWholesaleOrderForm → action submitWholesaleOrder.
 *
 * RÈGLES ABSOLUES :
 *   #7 — Aucun secret en dur. Clés lues via getLocalSupabaseEnv().
 *   #8 — assertLocalSupabase() : refuse de tourner hors 127.0.0.1:54321.
 *
 * Méthode :
 *   1. beforeAll : seed produit (stock=5) + variante + grossiste + cart_item (qty=8)
 *      via service_role LOCAL.
 *   2. test : connexion grossiste → /wholesale/cart → submit form → assertions URL + DB.
 *   3. afterAll : teardown des données seedées.
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'

// ── Garde-fous locaux ─────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function getLocalEnv() {
  let out = ''
  try {
    out = execSync('supabase status --output env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('REFUS: supabase status inaccessible — lance « supabase start ».')
  }
  const pick = (key: string): string => {
    const m = out.match(new RegExp(`^${key}="?(.*?)"?$`, 'm'))
    return (m?.[1] ?? '').trim()
  }
  const url = pick('API_URL')
  const serviceKey = pick('SERVICE_ROLE_KEY')
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!LOCAL_HOSTS.has(host)) throw new Error(`REFUS: URL non-locale (${url})`)
  return { url, serviceKey }
}

const LOCAL = getLocalEnv()

// ── Constantes seeds ─────────────────────────────────────────────────────────
const TAG = `r1-${Date.now()}`
const TEST_PWD = 'TestR1Never2026!'
const WHOLESALER_EMAIL = `r1-ws-${TAG}@test.local`

// État partagé entre beforeAll et les tests
let productId = ''
let variantId = ''
let wholesalerUserId = ''

// ── Helpers REST (service_role LOCAL uniquement) ──────────────────────────────
async function rest(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${LOCAL.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: LOCAL.serviceKey,
      Authorization: `Bearer ${LOCAL.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function restAuth(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${LOCAL.url}/auth/v1${path}`, {
    method,
    headers: {
      apikey: LOCAL.serviceKey,
      Authorization: `Bearer ${LOCAL.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

function psqlRow(sql: string): string {
  const escaped = sql.replace(/'/g, `'\\''`)
  return execSync(
    `docker exec supabase_db_affiliate-platform psql -U postgres -d postgres -t -A -c '${escaped}'`,
    { encoding: 'utf8', timeout: 10_000 }
  ).trim()
}

function psqlJSON(sql: string): unknown[] {
  const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t`
  const escaped = wrapped.replace(/'/g, `'\\''`)
  const out = execSync(
    `docker exec supabase_db_affiliate-platform psql -U postgres -d postgres -t -A -c '${escaped}'`,
    { encoding: 'utf8', timeout: 10_000 }
  ).trim()
  try { return JSON.parse(out) } catch { return [] }
}

// ── beforeAll : seed ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  console.log(`\n[R1-SEED] TAG=${TAG}`)

  // 1. Créer le produit (local_stock, stock=0 initial)
  // PREUVE ARGENT : factory_cost_mad=50 qty=8 → computeSupplierCostMad = 400.00 MAD
  // Math.round(50*100)*8 / 100 = 5000*8/100 = 40000/100 = 400.00
  const pR = await rest('POST', '/products', {
    name:                  `[R1] ${TAG}`,
    sell_price:            150,
    commission_amount:     0,
    stock_count:           0,
    images:                [],
    active:                true,
    affiliate_enabled:     false,
    approval_status:       'approved',
    availability_type:     'local_stock',
    factory_cost_mad:      50,
    platform_margin_type:  'fixed',
    platform_margin_value: 20,
    packaging_fee_mad:     5,
    confirmation_fee_mad:  0,
    delivery_fee_mad:      0,
    wholesale_min_qty:     1,
    // BUG CORRIGÉ : wholesale_tiers est JSONB — passer un tableau JS natif, pas JSON.stringify.
    // JSON.stringify produit une chaîne stockée comme string JSON dans le JSONB, causant
    // «tiers.find is not a function» dans getWholesaleTier (crash Server 500 sans <main>).
    wholesale_tiers:       [{ min_qty: 1, price_per_unit: 150 }],
  })
  if ((pR.status as number) >= 400) throw new Error(`Produit R1 KO : ${JSON.stringify(pR.data)}`)
  const prod = Array.isArray(pR.data) ? (pR.data as Record<string, unknown>[])[0] : pR.data as Record<string, unknown>
  productId = prod.id as string
  console.log(`[R1-SEED] Produit : ${productId}`)

  // 2. Attendre la variante défaut (trigger)
  await new Promise((r) => setTimeout(r, 600))
  const vR = await rest('GET', `/product_variants?product_id=eq.${productId}&is_default=eq.true&select=id`)
  const vRow = Array.isArray(vR.data) ? (vR.data as Record<string, unknown>[])[0] : null
  if (!vRow) throw new Error('Variante défaut non créée par trigger')
  variantId = vRow.id as string
  console.log(`[R1-SEED] Variante : ${variantId}`)

  // 3. Mettre à jour variante stock=5 + product stock=5
  // BUG CORRIGÉ : attributes est JSONB — passer un objet JS natif, pas JSON.stringify.
  await rest('PATCH', `/product_variants?id=eq.${variantId}`, { stock_count: 5, attributes: { taille: 'U' } })
  await rest('PATCH', `/products?id=eq.${productId}`, { stock_count: 5 })
  console.log('[R1-SEED] stock_count variante=5 produit=5')

  // 4. Créer le grossiste
  const existing = await (async () => {
    const r = await restAuth('GET', '/admin/users?per_page=200')
    const users = Array.isArray((r.data as { users?: unknown[] })?.users)
      ? (r.data as { users: { id: string; email: string }[] }).users
      : []
    return users.find((u) => u.email === WHOLESALER_EMAIL) ?? null
  })()

  if (existing) {
    wholesalerUserId = (existing as { id: string }).id
    console.log(`[R1-SEED] Grossiste déjà existant : ${wholesalerUserId}`)
    await rest('PATCH', `/profiles?id=eq.${wholesalerUserId}`, {
      role: 'wholesaler', status: 'approved', wholesale_access: true,
    })
  } else {
    const cR = await restAuth('POST', '/admin/users', {
      email: WHOLESALER_EMAIL, password: TEST_PWD, email_confirm: true,
    })
    if ((cR.data as { id?: string })?.id == null) throw new Error(`Création grossiste KO : ${JSON.stringify(cR.data)}`)
    wholesalerUserId = (cR.data as { id: string }).id
    console.log(`[R1-SEED] Grossiste créé : ${wholesalerUserId}`)

    // Profil — utilise un upsert (trigger peut avoir déjà créé le profil)
    const profR = await fetch(`${LOCAL.url}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: LOCAL.serviceKey,
        Authorization: `Bearer ${LOCAL.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: wholesalerUserId,
        role: 'wholesaler',
        status: 'approved',
        wholesale_access: true,
        full_name: 'Test R1 Grossiste',
      }),
    })
    if (!profR.ok) {
      const txt = await profR.text()
      throw new Error(`Profil grossiste upsert KO : HTTP ${profR.status} ${txt}`)
    }
  }

  // 5. Insérer un cart_item qty=8 > stock=5 (preuve never-refuse)
  // D'abord nettoyer l'éventuel cart existant
  await rest('DELETE', `/wholesale_cart_items?buyer_id=eq.${wholesalerUserId}`)
  const ciR = await rest('POST', '/wholesale_cart_items', {
    buyer_id:   wholesalerUserId,
    product_id: productId,
    variant_id: variantId,
    quantity:   8,
  })
  if ((ciR.status as number) >= 400) throw new Error(`Cart item KO : ${JSON.stringify(ciR.data)}`)
  console.log('[R1-SEED] Cart item qty=8 (> stock=5) créé')
  console.log('[R1-SEED] === Seed terminé ===\n')
})

// ── afterAll : teardown ───────────────────────────────────────────────────────

test.afterAll(async () => {
  console.log('\n[R1-TEARDOWN] Nettoyage...')
  if (wholesalerUserId) {
    await rest('DELETE', `/wholesale_cart_items?buyer_id=eq.${wholesalerUserId}`)
    // Supprimer les commandes créées par le test
    const woR = await rest('GET', `/wholesale_orders?buyer_id=eq.${wholesalerUserId}&select=id`)
    const wos = Array.isArray(woR.data) ? woR.data as { id: string }[] : []
    for (const wo of wos) {
      await rest('DELETE', `/wholesale_order_items?order_id=eq.${wo.id}`)
      await rest('DELETE', `/wholesale_orders?id=eq.${wo.id}`)
    }
    // Supprimer le user auth
    await restAuth('DELETE', `/admin/users/${wholesalerUserId}`)
  }
  if (productId) {
    await rest('DELETE', `/product_variants?product_id=eq.${productId}`)
    await rest('DELETE', `/products?id=eq.${productId}`)
  }
  console.log('[R1-TEARDOWN] OK')
})

// ── TEST R1 ───────────────────────────────────────────────────────────────────

test('R1 — submitWholesaleOrder never-refuse : qty=8 > stock=5, redirect+restocking=1', async ({ page }) => {
  // ── Login grossiste ────────────────────────────────────────────────────────
  console.log(`\n[R1] Login grossiste: ${WHOLESALER_EMAIL}`)
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('#email').fill(WHOLESALER_EMAIL)
  await page.locator('#password').fill(TEST_PWD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  expect(page.url(), 'Login grossiste échoué').not.toContain('/login')
  console.log(`[R1] Login OK — url: ${page.url()}`)

  // ── Naviguer vers le panier ────────────────────────────────────────────────
  await page.goto('/wholesale/cart', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // Diagnostic : si la page redirige (session non établie → /login, ou profil pending → /pending),
  // <main> ne sera jamais visible. On log l'URL et le HTML pour faciliter le débogage.
  const cartUrl = page.url()
  console.log(`[R1] URL après goto /wholesale/cart: ${cartUrl}`)
  if (!cartUrl.includes('/wholesale/cart')) {
    const html = await page.content()
    console.error(`[R1-DIAG] Redirigé vers ${cartUrl} — début HTML:\n${html.slice(0, 800)}`)
    throw new Error(`[R1] Redirigé vers ${cartUrl} au lieu de /wholesale/cart (session non établie ?)`)
  }
  await page.waitForSelector('main', { timeout: 30_000 })
  await page.waitForTimeout(1_000)
  console.log(`[R1] Panier chargé — url: ${page.url()}`)

  // Vérifier qu'il y a au moins un article dans le panier
  // S'il ne s'affiche pas (bug produit null), diagnostiquer
  const bodyText = await page.textContent('body') ?? ''

  // ASSERTION (a) — AUCUN message "Stock insuffisant" (c'était l'ancien comportement supprimé)
  expect(bodyText, 'Message "Stock insuffisant" ne doit PAS apparaître')
    .not.toContain('Stock insuffisant')

  // Vérifier que le produit s'affiche dans le panier (pas de cart vide ou crash)
  // Si le cart affiche "Panier vide", c'est que les items n'ont pas été chargés
  if (bodyText.includes('Panier vide') || bodyText.includes('votre panier est vide')) {
    console.warn('[R1] AVERTISSEMENT : panier affiché comme vide — vérifier RLS produits')
    // Essayer de passer quand même via le formulaire
  }

  // ── Remplir et soumettre le formulaire ────────────────────────────────────
  console.log('[R1] Remplissage et soumission du formulaire...')

  // Remplir optionnellement la ville (champ optionnel)
  const cityInput = page.locator('input[name="city"]')
  if (await cityInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await cityInput.fill('Casablanca')
  }

  // Cliquer sur le bouton de soumission — matcher texte FR ou AR ou EN
  const submitBtn = page.locator('button[type="submit"]').filter({
    hasText: /Soumettre|Submit|إرسال/i,
  })
  await expect(submitBtn, 'Bouton submit non visible').toBeVisible({ timeout: 15_000 })

  // Écouter la redirection avant de cliquer
  const redirectPromise = page.waitForURL(
    (url) => url.pathname.startsWith('/wholesale/orders/'),
    { timeout: 60_000 }
  )
  await submitBtn.click()

  // ── ASSERTION (b) — Redirection vers /wholesale/orders/{id}?submitted=1&restocking=1 ──
  console.log('[R1] Attente redirection...')
  await redirectPromise
  const finalUrl = page.url()
  console.log(`[R1] URL finale : ${finalUrl}`)

  expect(finalUrl, 'URL doit contenir /wholesale/orders/').toContain('/wholesale/orders/')
  expect(finalUrl, 'URL doit contenir submitted=1').toContain('submitted=1')
  expect(finalUrl, 'URL doit contenir restocking=1 (qty=8 > stock=5)').toContain('restocking=1')

  // Extraire l'order ID depuis l'URL
  const orderIdMatch = finalUrl.match(/\/wholesale\/orders\/([a-f0-9-]+)/)
  const orderId = orderIdMatch?.[1] ?? null
  expect(orderId, 'Order ID doit être dans l\'URL').not.toBeNull()
  console.log(`[R1] Order ID : ${orderId}`)

  // ── ASSERTION (c) — DB : wholesale_orders + wholesale_order_items ──────────
  const [woRows, wiRows] = [
    psqlJSON(`SELECT id, status, total_amount, buyer_id FROM public.wholesale_orders WHERE id = '${orderId}'`),
    psqlJSON(`SELECT id, variant_id, quantity, product_id FROM public.wholesale_order_items WHERE order_id = '${orderId}'`),
  ]

  console.log(`[R1-DB] wholesale_orders: ${JSON.stringify(woRows)}`)
  console.log(`[R1-DB] wholesale_order_items: ${JSON.stringify(wiRows)}`)

  // wholesale_orders créée avec status=pending
  expect(woRows, 'wholesale_orders doit contenir 1 ligne').toHaveLength(1)
  const wo = woRows[0] as Record<string, unknown>
  expect(wo.status, 'status doit être "pending"').toBe('pending')
  expect(wo.buyer_id, 'buyer_id doit être le grossiste').toBe(wholesalerUserId)

  // wholesale_order_items avec variant_id + quantity=8
  expect(wiRows, 'wholesale_order_items doit contenir au moins 1 ligne').toHaveLength(1)
  const wi = wiRows[0] as Record<string, unknown>
  expect(wi.variant_id, 'variant_id doit être set (source de vérité variante)').toBe(variantId)
  expect(Number(wi.quantity), 'quantity doit être 8 (> stock=5)').toBe(8)
  expect(wi.product_id, 'product_id doit être le bon produit').toBe(productId)

  // ── Invariant I1 post-test ─────────────────────────────────────────────────
  const i1Rows = psqlJSON(`
    SELECT p.stock_count AS prod_stock, COALESCE(SUM(v.stock_count),0) AS sum_v,
           p.stock_count - COALESCE(SUM(v.stock_count),0) AS ecart
    FROM public.products p
    LEFT JOIN public.product_variants v ON v.product_id = p.id AND v.active = true
    WHERE p.id = '${productId}'
    GROUP BY p.stock_count
  `)
  const i1 = i1Rows[0] as Record<string, unknown> | undefined
  console.log(`[R1-I1] product.stock=${i1?.prod_stock} SUM(variants)=${i1?.sum_v} écart=${i1?.ecart}`)
  // Note: submitWholesaleOrder ne réserve PAS le stock (c'est la transition confirmed qui le fait)
  // → stock reste à 5 (non modifié par le submit)
  expect(Number(i1?.ecart), 'Invariant I1 : écart doit être 0').toBe(0)

  console.log('\n[R1] === PASS ===')
  console.log(`  orderId      : ${orderId}`)
  console.log(`  URL finale   : ${finalUrl}`)
  console.log(`  status DB    : ${wo.status}`)
  console.log(`  variant_id   : ${wi.variant_id}`)
  console.log(`  quantity     : ${wi.quantity}`)
  console.log(`  I1 écart     : ${i1?.ecart}`)
})
