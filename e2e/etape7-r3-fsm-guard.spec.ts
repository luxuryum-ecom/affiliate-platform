/**
 * Runtime QA — Réserve R3 : garde FSM updateOrderStatus — anti-double-comptage.
 *
 * OBJECTIF : prouver que :
 *   1er appel updateOrderStatus(orderId, 'confirmed') depuis pending_confirmation
 *      → stock variant passe 10 → 7, 1 seul mouvement "reserved"
 *   2e appel updateOrderStatus(orderId, 'confirmed') (retentative même transition)
 *      → garde prev===newStatus retourne fail("Le statut est déjà à jour.")
 *      → stock reste 7, toujours 1 seul mouvement
 *
 * CHEMIN EXERCÉ : UI admin /admin/orders/{id} → OrderStatusForm → updateOrderStatus
 *   Pour le 2e appel : injection JS d'une option 'confirmed' dans le <select> de la form.
 *
 * RÈGLES ABSOLUES :
 *   #7 — Aucun secret en dur. Clés lues via getLocalSupabaseEnv().
 *   #8 — assertLocalSupabase() : refuse de tourner hors 127.0.0.1:54321.
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
    throw new Error('REFUS: supabase status inaccessible.')
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
const TAG = `r3-${Date.now()}`
const TEST_PWD = 'TestR3FSM2026!'
const ADMIN_EMAIL = `r3-admin-${TAG}@test.local`
const AFFILIATE_EMAIL = `r3-affiliate-${TAG}@test.local`

// État partagé
let productId = ''
let variantId = ''
let orderId = ''
let adminUserId = ''
let affiliateUserId = ''

// ── Helpers REST ──────────────────────────────────────────────────────────────
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

function psqlJSON(sql: string): unknown[] {
  const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t`
  const escaped = wrapped.replace(/'/g, `'\\''`)
  try {
    const out = execSync(
      `docker exec supabase_db_affiliate-platform psql -U postgres -d postgres -t -A -c '${escaped}'`,
      { encoding: 'utf8', timeout: 10_000 }
    ).trim()
    return JSON.parse(out)
  } catch {
    return []
  }
}

async function ensureUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  const usersR = await restAuth('GET', '/admin/users?per_page=200')
  const users = Array.isArray((usersR.data as { users?: unknown[] })?.users)
    ? (usersR.data as { users: { id: string; email: string }[] }).users
    : []
  const existing = users.find((u) => u.email === email)

  let uid: string
  if (existing) {
    uid = (existing as { id: string }).id
  } else {
    const cR = await restAuth('POST', '/admin/users', { email, password: TEST_PWD, email_confirm: true })
    uid = (cR.data as { id: string }).id
    if (!uid) throw new Error(`Création ${email} KO : ${JSON.stringify(cR.data)}`)
  }
  // Upsert du profil — le trigger peut avoir auto-créé le profil, on met à jour dans tous les cas
  const upsertR = await fetch(`${LOCAL.url}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: LOCAL.serviceKey,
      Authorization: `Bearer ${LOCAL.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: uid, role, status: 'approved', full_name: `Test R3 ${role}`, ...extra }),
  })
  if (!upsertR.ok) {
    const txt = await upsertR.text()
    throw new Error(`Profil ${role} upsert KO : HTTP ${upsertR.status} ${txt}`)
  }
  return uid
}

// ── beforeAll : seed ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  console.log(`\n[R3-SEED] TAG=${TAG}`)

  // 1. Admin + Affilié
  adminUserId     = await ensureUser(ADMIN_EMAIL, 'admin')
  affiliateUserId = await ensureUser(AFFILIATE_EMAIL, 'affiliate')
  console.log(`[R3-SEED] Admin: ${adminUserId} / Affilié: ${affiliateUserId}`)

  // 2. Produit (stock=0 initial)
  const pR = await rest('POST', '/products', {
    name:                  `[R3] ${TAG}`,
    sell_price:            200,
    commission_amount:     45,
    stock_count:           0,
    images:                [],
    active:                true,
    affiliate_enabled:     true,
    approval_status:       'approved',
    availability_type:     'local_stock',
    factory_cost_mad:      100,
    platform_margin_type:  'percentage',
    platform_margin_value: 30,
    packaging_fee_mad:     10,
    confirmation_fee_mad:  10,
    delivery_fee_mad:      35,
  })
  if ((pR.status as number) >= 400) throw new Error(`Produit R3 KO : ${JSON.stringify(pR.data)}`)
  const prod = Array.isArray(pR.data) ? (pR.data as Record<string, unknown>[])[0] : pR.data as Record<string, unknown>
  productId = prod.id as string
  console.log(`[R3-SEED] Produit : ${productId}`)

  // 3. Attendre variante défaut (trigger)
  await new Promise((r) => setTimeout(r, 600))
  const vR = await rest('GET', `/product_variants?product_id=eq.${productId}&is_default=eq.true&select=id`)
  const vRow = Array.isArray(vR.data) ? (vR.data as Record<string, unknown>[])[0] : null
  if (!vRow) throw new Error('Variante défaut R3 non créée')
  variantId = vRow.id as string
  console.log(`[R3-SEED] Variante : ${variantId}`)

  // 4. Mettre à jour stock variante=10 + produit=10
  await rest('PATCH', `/product_variants?id=eq.${variantId}`, { stock_count: 10 })
  await rest('PATCH', `/products?id=eq.${productId}`, { stock_count: 10 })
  console.log('[R3-SEED] stock variante=10 produit=10')

  // 5. I1 AVANT
  const i1Rows = psqlJSON(`
    SELECT p.stock_count AS ps, COALESCE(SUM(v.stock_count),0) AS sv,
           p.stock_count - COALESCE(SUM(v.stock_count),0) AS ecart
    FROM public.products p LEFT JOIN public.product_variants v
      ON v.product_id = p.id AND v.active = true
    WHERE p.id = '${productId}' GROUP BY p.stock_count
  `)
  const i1 = i1Rows[0] as Record<string, unknown> | undefined
  console.log(`[R3-I1-AVANT] product=${i1?.ps} variant_sum=${i1?.sv} écart=${i1?.ecart}`)
  if (Number(i1?.ecart) !== 0) console.warn('[R3-WARN] I1 écart avant commande != 0 !')

  // 6. Commande COD en pending_confirmation (qty=3)
  const ordR = await rest('POST', '/orders', {
    affiliate_id:     affiliateUserId,
    product_id:       productId,
    variant_id:       variantId,
    customer_name:    'Client R3 Test',
    customer_phone:   '0600009999',
    customer_city:    'Casablanca',
    customer_address: '1 Rue FSM Test',
    quantity:         3,
    total_amount:     600,
    commission_amount: 45,
    status:           'pending_confirmation',
    cod_expected:     600,
  })
  if ((ordR.status as number) >= 400) throw new Error(`Commande R3 KO : ${JSON.stringify(ordR.data)}`)
  const ord = Array.isArray(ordR.data) ? (ordR.data as Record<string, unknown>[])[0] : ordR.data as Record<string, unknown>
  orderId = ord.id as string
  console.log(`[R3-SEED] Commande : ${orderId} status=pending_confirmation variant_id=${variantId}`)
  console.log('[R3-SEED] === Seed terminé ===\n')
})

// ── afterAll : teardown ───────────────────────────────────────────────────────

test.afterAll(async () => {
  console.log('\n[R3-TEARDOWN] Nettoyage...')
  if (orderId)      await rest('DELETE', `/orders?id=eq.${orderId}`)
  if (productId)    await rest('DELETE', `/product_variants?product_id=eq.${productId}`)
  if (productId)    await rest('DELETE', `/products?id=eq.${productId}`)
  if (adminUserId)     await restAuth('DELETE', `/admin/users/${adminUserId}`)
  if (affiliateUserId) await restAuth('DELETE', `/admin/users/${affiliateUserId}`)
  // Note : les stock_movements pour l'orderId sont aussi supprimés si la FK cascade
  console.log('[R3-TEARDOWN] OK')
})

// ── TEST R3.1 — Premier appel : confirmed (pending → confirmed, stock 10→7) ──

test('R3.1 — 1er updateOrderStatus(confirmed) : stock 10→7, 1 mouvement reserved', async ({ page }) => {
  console.log(`\n[R3.1] Login admin: ${ADMIN_EMAIL}`)
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(TEST_PWD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  expect(page.url(), 'Login admin échoué').not.toContain('/login')
  console.log(`[R3.1] Login OK`)

  // Naviguer vers la page admin de la commande
  await page.goto(`/admin/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('main', { timeout: 30_000 })
  await page.waitForTimeout(1_000)
  console.log(`[R3.1] Page commande chargée : ${page.url()}`)

  // Vérifier que la page est accessible (admin peut lire cette commande)
  // NOTE : on ne vérifie PAS bodyText.includes('404') car Next.js injecte du JS inline
  // dans <body> qui peut contenir "404" dans des objets de configuration — faux positif.
  // On vérifie plutôt que l'URL ne pointe pas sur une page d'erreur, et que le <main>
  // contient bien du contenu de commande (order-specific).
  expect(page.url(), 'URL ne doit pas être une page 404').not.toContain('/404')
  expect(page.url(), 'URL doit pointer sur la commande').toContain(`/admin/orders/${orderId}`)
  // L'élément <main> doit contenir un sélecteur de statut
  await expect(page.locator('main'), 'main doit être visible').toBeVisible({ timeout: 15_000 })

  // Le select de statut doit afficher 'confirmed' comme option valide
  // (VALID_TRANSITIONS['pending_confirmation'] = ['confirmed'])
  // NOTE : la page contient aussi <select name="proofType"> pour les preuves.
  // On cible SELECT sans attribut name (= le select de statut dans OrderStatusForm).
  const statusSelect = page.locator('select:not([name])').first()
  await expect(statusSelect, 'Select de statut doit être visible').toBeVisible({ timeout: 15_000 })

  // Sélectionner 'confirmed'
  await statusSelect.selectOption('confirmed')
  console.log('[R3.1] Option "confirmed" sélectionnée')

  // Soumettre le formulaire — on cible "Confirm change" (EN) ou "Confirmer le changement" (FR)
  // pour éviter la strict-mode violation (Sign out + Add proof + Confirm change = 3 boutons submit).
  const submitBtn = page.getByRole('button', { name: /Confirm change|Confirmer le changement/i })
  await expect(submitBtn, 'Bouton Confirm change doit être activé').toBeEnabled({ timeout: 10_000 })
  await submitBtn.click()
  console.log('[R3.1] Submit cliqué — attente réponse action...')

  // Attendre le message de succès ou d'erreur du formulaire de statut.
  // IMPORTANT : la page contient des éléments avec .text-success-fg (ex: montant commission).
  // On cible le message du formulaire via la combinaison de classes unique :
  //   succès → bg-success-soft text-success-fg
  //   erreur → bg-danger-soft text-danger-fg
  // Ces deux classes ensemble n'existent que sur le <p> de réponse dans OrderStatusForm.
  const msgLocator = page.locator('.bg-success-soft.text-success-fg, .bg-danger-soft.text-danger-fg').first()
  await msgLocator.waitFor({ state: 'visible', timeout: 30_000 })
  const msgText = await msgLocator.textContent() ?? ''
  console.log(`[R3.1] Message action : "${msgText}"`)

  // Le message doit être un SUCCÈS (pas "Le statut est déjà à jour")
  expect(msgText, 'Premier appel doit réussir').not.toContain('déjà à jour')
  expect(msgText, 'Premier appel ne doit pas être une erreur').not.toMatch(/erreur|error|Erreur/i)

  // ── Vérifications DB : stock 10→7, 1 mouvement ────────────────────────────
  await page.waitForTimeout(1_500) // laisser le temps au serveur de traiter

  const varRows = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const varStock = (varRows[0] as Record<string, unknown>)?.stock_count
  console.log(`[R3.1-DB] variant.stock_count après 1er confirm : ${varStock} (attendu 7)`)
  expect(Number(varStock), 'Stock variante doit être 7 après 1er confirm (10-3)').toBe(7)

  const mvtRows = psqlJSON(`
    SELECT id, qty_delta, reason, from_status, to_status, variant_id, balance_after
    FROM public.stock_movements
    WHERE order_id = '${orderId}' AND reason IN ('vente_affilie','reserve')
    ORDER BY created_at DESC
  `)
  console.log(`[R3.1-DB] Mouvements pour order_id=${orderId}: ${JSON.stringify(mvtRows)}`)
  expect(mvtRows, 'Exactement 1 mouvement reserve pour cet order').toHaveLength(1)

  const mvt = mvtRows[0] as Record<string, unknown>
  expect(mvt.to_status, 'Mouvement to_status = reserved').toBe('reserved')
  expect(Number(mvt.qty_delta), 'qty_delta = -3').toBe(-3)
  expect(mvt.variant_id, 'variant_id lié à la variante').toBe(variantId)
  expect(Number(mvt.balance_after), 'balance_after = 7 (C-2 : balance depuis variante)').toBe(7)

  // I1 après 1er confirm
  const i1R = psqlJSON(`
    SELECT p.stock_count AS ps, COALESCE(SUM(v.stock_count),0) AS sv,
           p.stock_count - COALESCE(SUM(v.stock_count),0) AS ecart
    FROM public.products p LEFT JOIN public.product_variants v
      ON v.product_id = p.id AND v.active = true
    WHERE p.id = '${productId}' GROUP BY p.stock_count
  `)
  const i1 = i1R[0] as Record<string, unknown> | undefined
  console.log(`[R3.1-I1] products=${i1?.ps} SUM(variants)=${i1?.sv} écart=${i1?.ecart}`)
  expect(Number(i1?.ecart), 'I1 écart doit être 0 après confirm').toBe(0)

  console.log('\n[R3.1] === PASS ===')
  console.log(`  variant.stock   : ${varStock} (10→7)`)
  console.log(`  nb mouvements   : ${mvtRows.length}`)
  console.log(`  balance_after   : ${mvt.balance_after}`)
  console.log(`  I1 écart        : ${i1?.ecart}`)
})

// ── TEST R3.2 — 2e appel : garde prev===newStatus bloque le double-comptage ──

test('R3.2 — 2e updateOrderStatus(confirmed) : garde rejette + stock reste 7 + 0 mvt supplémentaire', async ({ page }) => {
  console.log(`\n[R3.2] Login admin (réutilisation session)`)
  // Ré-authentification pour ce test (sessions isolées par défaut dans Playwright)
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(TEST_PWD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 }),
    page.locator('button[type="submit"]').click(),
  ])

  // Vérifier l'état actuel : la commande doit déjà être 'confirmed' (d'après R3.1)
  const ordRows = psqlJSON(`SELECT status, variant_id FROM public.orders WHERE id = '${orderId}'`)
  const ord = ordRows[0] as Record<string, unknown> | undefined
  const currentStatus = ord?.status
  console.log(`[R3.2] Statut actuel de la commande : ${currentStatus}`)

  // Si R3.1 a échoué ou si la commande n'est pas encore 'confirmed', skip avec info
  if (currentStatus !== 'confirmed') {
    console.warn(`[R3.2] SKIP : commande en statut "${currentStatus}" (attendu "confirmed") — R3.1 a peut-être échoué`)
    // On fait quand même le test mais on documente l'état
  }

  // Naviguer vers la page admin de la commande
  await page.goto(`/admin/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('main', { timeout: 30_000 })
  await page.waitForTimeout(1_000)

  // Stock AVANT le 2e appel
  const varBeforeRows = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const stockBefore = Number((varBeforeRows[0] as Record<string, unknown>)?.stock_count)
  const mvtCountBeforeRows = psqlJSON(`
    SELECT COUNT(*) AS nb FROM public.stock_movements
    WHERE order_id = '${orderId}' AND reason IN ('vente_affilie','reserve')
  `)
  const mvtCountBefore = Number((mvtCountBeforeRows[0] as Record<string, unknown>)?.nb ?? 0)
  console.log(`[R3.2] Stock avant 2e appel : ${stockBefore}, mouvements : ${mvtCountBefore}`)

  // La UI ne propose pas 'confirmed' quand la commande est déjà 'confirmed'
  // (VALID_TRANSITIONS['confirmed'] = ['shipped']).
  // On injecte 'confirmed' via JS pour forcer le deuxième appel à updateOrderStatus.
  // IMPORTANT : on cible querySelector('select:not([name])') = le select de statut,
  // PAS querySelector('select') qui ciblerait <select name="proofType"> en premier.
  await page.evaluate(() => {
    const select = document.querySelector('select:not([name])') as HTMLSelectElement | null
    if (select) {
      // Ajouter une option 'confirmed' pour bypasser la validation client
      const opt = document.createElement('option')
      opt.value = 'confirmed'
      opt.textContent = 'confirmed (test guard R3)'
      select.appendChild(opt)
    }
  })
  console.log('[R3.2] Option "confirmed" injectée dans le select')

  // Sélectionner 'confirmed'
  const statusSelect = page.locator('select:not([name])').first()
  await statusSelect.selectOption('confirmed')

  // Soumettre — même sélecteur que R3.1 pour éviter strict-mode violation
  const submitBtn = page.getByRole('button', { name: /Confirm change|Confirmer le changement/i })
  // S'assurer que le bouton est disponible (il ne doit pas être disabled car une option est sélectionnée)
  await page.waitForTimeout(500)
  await submitBtn.click()
  console.log('[R3.2] Submit cliqué — attente réponse garde...')

  // La garde prev===newStatus doit retourner fail("Le statut est déjà à jour.")
  // Même logique que R3.1 : cibler bg-danger-soft.text-danger-fg (unique au formulaire)
  const msgLocator = page.locator('.bg-danger-soft.text-danger-fg, .bg-success-soft.text-success-fg').first()
  await msgLocator.waitFor({ state: 'visible', timeout: 30_000 })
  const msgText = await msgLocator.textContent() ?? ''
  console.log(`[R3.2] Message reçu : "${msgText}"`)

  // ASSERTION : message d'erreur contient "déjà à jour"
  expect(msgText, 'Garde doit retourner "Le statut est déjà à jour."').toContain('déjà à jour')

  // ── Vérifications DB : stock inchangé, pas de mouvement supplémentaire ────
  await page.waitForTimeout(1_000)

  const varAfterRows = psqlJSON(`SELECT stock_count FROM public.product_variants WHERE id = '${variantId}'`)
  const stockAfter = Number((varAfterRows[0] as Record<string, unknown>)?.stock_count)

  const mvtCountAfterRows = psqlJSON(`
    SELECT COUNT(*) AS nb FROM public.stock_movements
    WHERE order_id = '${orderId}' AND reason IN ('vente_affilie','reserve')
  `)
  const mvtCountAfter = Number((mvtCountAfterRows[0] as Record<string, unknown>)?.nb ?? 0)

  console.log(`[R3.2-DB] Stock après 2e appel : ${stockAfter} (attendu ${stockBefore})`)
  console.log(`[R3.2-DB] Mouvements après 2e appel : ${mvtCountAfter} (attendu ${mvtCountBefore})`)

  // Le stock ne doit PAS avoir changé
  expect(stockAfter, `Stock variant inchangé après 2e appel (garde FSM)`).toBe(stockBefore)

  // Le nombre de mouvements ne doit PAS avoir augmenté
  expect(mvtCountAfter, 'Aucun mouvement supplémentaire — garde bloque reserve_stock').toBe(mvtCountBefore)

  // I1 après 2e appel (tentative)
  const i1R = psqlJSON(`
    SELECT p.stock_count AS ps, COALESCE(SUM(v.stock_count),0) AS sv,
           p.stock_count - COALESCE(SUM(v.stock_count),0) AS ecart
    FROM public.products p LEFT JOIN public.product_variants v
      ON v.product_id = p.id AND v.active = true
    WHERE p.id = '${productId}' GROUP BY p.stock_count
  `)
  const i1 = i1R[0] as Record<string, unknown> | undefined
  console.log(`[R3.2-I1] products=${i1?.ps} SUM(variants)=${i1?.sv} écart=${i1?.ecart}`)
  expect(Number(i1?.ecart), 'I1 écart doit être 0 après 2e appel garde').toBe(0)

  console.log('\n[R3.2] === PASS ===')
  console.log(`  Message garde   : "${msgText}"`)
  console.log(`  stock avant     : ${stockBefore}`)
  console.log(`  stock après     : ${stockAfter} (inchangé)`)
  console.log(`  mouvements avant: ${mvtCountBefore}`)
  console.log(`  mouvements après: ${mvtCountAfter} (inchangé — 0 double-comptage)`)
})
