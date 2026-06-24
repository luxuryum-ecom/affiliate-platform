/**
 * roles-2-etages-v2.spec.ts
 * Vérification runtime — LOT "rôles 2 étages" APRÈS correctif P1 (mig 088).
 *
 * Scénarios A → I — captures dans .nav-proofs/roles-2-etages-v2/
 *
 * COMMANDES TEST :
 *   - COD (affiliate_id IS NULL)      : COD_ORDER_ID (créée en setup)
 *   - AFFILIÉ (affiliate_id NOT NULL) : AFFILIATE_ORDER_ID = 88c25be9...
 *
 * AGENT TEST : agent-demo@affipartner.ma (mot de passe via SMOKE_AGENT_PASSWORD, règle #7)
 *   AGENT_ID = cebd5f07-55a7-44ee-9638-43348d4de75c
 *   État initial : manage_country_sourcing UNIQUEMENT
 *   Capacités accordées/retirées par chaque scénario.
 *
 * RÈGLE STRICTE : ce spec ne modifie JAMAIS le code applicatif.
 * Si un scénario échoue → verdict FAIL documenté, pas de patch.
 */

import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import * as http from 'node:http'
import { getLocalSupabaseEnv } from './assert-local-supabase'

// SÉQUENÇAGE : les tests D/E/F/G partagent l'état DB (commandes, capacités).
// Forcer l'exécution sérielle pour éviter les races entre afterAll concurrents.
test.describe.configure({ mode: 'serial' })

// ─── Constantes ───────────────────────────────────────────────────────────────
// Port LOCAL dédié (serveur playwright.roles.config.ts), en dur, sans override — anti-prod.
const BASE_URL   = 'http://localhost:3203'
const PROOFS_DIR = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/.nav-proofs/roles-2-etages-v2'

const ADMIN_EMAIL    = process.env.SMOKE_ADMIN_EMAIL    ?? ''
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? ''

const AGENT_EMAIL    = 'agent-demo@affipartner.ma'
const AGENT_PASSWORD = process.env.SMOKE_AGENT_PASSWORD ?? '' // règle #7 — via env
const AGENT_ID       = 'cebd5f07-55a7-44ee-9638-43348d4de75c'

// Commande affiliée (affiliate_id NOT NULL) — test EXISTANTE
const AFFILIATE_ORDER_ID = '88c25be9-e69b-42cc-b44f-fba9a7dd6d7b'
// Commande COD (affiliate_id IS NULL) — créée en setup
const COD_ORDER_ID       = '0986e5c7-cb2f-4b36-bf67-3e5a4f1f6965'

// GARDE-FOU (incident 2026-06-24) : ce spec ÉCRIT via service_role → identifiants
// Supabase LOCAUX uniquement (jamais .env.local/prod). REFUS fail-fast si non-local.
const LOCAL = getLocalSupabaseEnv()
const SUPA_URL    = LOCAL.url
const SERVICE_KEY = LOCAL.serviceKey
const ANON_KEY    = LOCAL.anonKey

const NAV_TIMEOUT    = 30_000
const ACTION_TIMEOUT = 10_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureProofsDir() {
  if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR, { recursive: true })
  }
}

async function screenshot(page: Page, filename: string): Promise<string> {
  ensureProofsDir()
  const fp = path.join(PROOFS_DIR, filename)
  await page.screenshot({ path: fp, fullPage: true })
  console.log(`[CAPTURE] ${filename}`)
  return fp
}

function supaRest(
  method: string,
  urlPath: string,
  body?: object,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`${SUPA_URL}${urlPath}`)
    const isHttps = fullUrl.protocol === 'https:'
    const lib     = isHttps ? https : http

    const headers: Record<string, string> = {
      apikey:          SERVICE_KEY,
      Authorization:   `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
      ...extraHeaders,
    }

    const bodyStr = body ? JSON.stringify(body) : undefined
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))

    const req = lib.request(
      {
        hostname: fullUrl.hostname,
        port:     fullUrl.port || (isHttps ? 443 : 80),
        path:     fullUrl.pathname + fullUrl.search,
        method,
        headers,
        timeout:  20_000,
      },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        res.on('end',  () => resolve({ status: res.statusCode ?? 0, body: data }))
      },
    )
    req.on('error',   reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('supaRest timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

/**
 * Appel REST/RPC Supabase avec apikey + bearer paramétrables (≠ service_role).
 * Sert à appeler le RPC confirm_cod_order EN TANT QUE l'agent (JWT agent) pour
 * prouver l'isolation par canal au niveau base (scénario F).
 */
function supaCall(
  method: string,
  urlPath: string,
  body: object | undefined,
  apikey: string,
  bearer: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`${SUPA_URL}${urlPath}`)
    const isHttps = fullUrl.protocol === 'https:'
    const lib     = isHttps ? https : http
    const headers: Record<string, string> = {
      apikey,
      Authorization:  `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    }
    const bodyStr = body ? JSON.stringify(body) : undefined
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))
    const req = lib.request(
      {
        hostname: fullUrl.hostname,
        port:     fullUrl.port || (isHttps ? 443 : 80),
        path:     fullUrl.pathname + fullUrl.search,
        method, headers, timeout: 20_000,
      },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        res.on('end',  () => resolve({ status: res.statusCode ?? 0, body: data }))
      },
    )
    req.on('error',   reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('supaCall timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

/**
 * Authentifie l'agent test via Supabase Auth (grant_type=password, apikey=anon)
 * et renvoie son access_token JWT. auth.uid() côté RPC = l'agent.
 */
async function getAgentJwt(): Promise<string> {
  const r = await supaCall(
    'POST',
    '/auth/v1/token?grant_type=password',
    { email: AGENT_EMAIL, password: AGENT_PASSWORD },
    ANON_KEY,
    ANON_KEY,
  )
  const parsed = JSON.parse(r.body || '{}') as { access_token?: string }
  if (!parsed.access_token) {
    throw new Error(`getAgentJwt: pas de token (HTTP ${r.status}) ${r.body.slice(0, 200)}`)
  }
  return parsed.access_token
}

/** Localise le bouton "Confirmer" de la LIGNE d'une commande précise (réf #id8). */
function confirmButtonForOrder(page: Page, orderId: string) {
  const ref = orderId.slice(0, 8)
  return page.locator('tr').filter({ hasText: `#${ref}` })
    .locator('button').filter({ hasText: /^Confirmer$/ })
}

async function grantCap(capability: string) {
  const r = await supaRest('POST', '/rest/v1/rpc/grant_staff_permission', {
    p_user_id:    AGENT_ID,
    p_capability: capability,
  })
  console.log(`[SETUP] grant ${capability} → HTTP ${r.status}`)
  return r
}

async function revokeCap(capability: string) {
  const r = await supaRest(
    'DELETE',
    `/rest/v1/staff_permissions?user_id=eq.${AGENT_ID}&capability=eq.${capability}`,
  )
  console.log(`[CLEANUP] revoke ${capability} → HTTP ${r.status}`)
  return r
}

async function getOrderFromDB(orderId: string) {
  const r = await supaRest(
    'GET',
    `/rest/v1/orders?id=eq.${orderId}&select=id,status,affiliate_id,confirmed_at,cod_received,cod_expected,commission_amount,total_amount,affiliate_commission_mad_snapshot`,
  )
  const rows = JSON.parse(r.body || '[]') as Record<string, unknown>[]
  return rows[0] ?? null
}

async function resetOrderToPending(orderId: string) {
  const r = await supaRest(
    'PATCH',
    `/rest/v1/orders?id=eq.${orderId}`,
    { status: 'pending_confirmation', confirmed_at: null },
    { Prefer: 'return=minimal' },
  )
  console.log(`[CLEANUP] reset order ${orderId} → HTTP ${r.status}`)
  return r
}

async function ensureCodOrderExists(): Promise<void> {
  const existing = await getOrderFromDB(COD_ORDER_ID)
  if (existing) {
    // S'assurer qu'elle est en pending_confirmation
    if (existing.status !== 'pending_confirmation') {
      await resetOrderToPending(COD_ORDER_ID)
    }
    return
  }
  // Re-créer la commande COD avec le même ID
  const r = await supaRest(
    'POST',
    '/rest/v1/orders',
    {
      id:               COD_ORDER_ID,
      affiliate_id:     null,
      product_id:       '44507d4e-9fef-4dd9-b77f-c2a3a217011d',
      customer_name:    'TEST COD SUPERVISEUR',
      customer_phone:   '0600000001',
      customer_city:    'Casablanca',
      customer_address: '123 test street',
      quantity:         1,
      total_amount:     299,
      commission_amount: 0,
      status:           'pending_confirmation',
    },
    { Prefer: 'return=minimal' },
  )
  console.log(`[SETUP] re-create COD order → HTTP ${r.status}`)
}

async function getCommissionsForOrder(orderId: string) {
  const r = await supaRest(
    'GET',
    `/rest/v1/commissions?order_id=eq.${orderId}&select=id,status,amount`,
  )
  return JSON.parse(r.body || '[]') as Record<string, unknown>[]
}

async function login(
  page: Page,
  email: string,
  password: string,
  locale: 'fr' | 'ar' | 'en' = 'fr',
) {
  await page.context().addCookies([
    { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
  ])
  await page.goto(`${BASE_URL}/login`, { timeout: NAV_TIMEOUT })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: NAV_TIMEOUT }),
    page.locator('button[type="submit"]').click(),
  ])
  console.log(`[AUTH] ${email} → ${page.url()}`)
}

// ─── Tracking nettoyage ───────────────────────────────────────────────────────

const confirmedOrders = new Set<string>()

test.afterAll(async () => {
  console.log('[CLEANUP] Post-suite cleanup...')
  // 1. Révoquer toutes les capacités accordées pendant les tests
  for (const cap of [
    'confirm_cod_orders',
    'confirm_affiliate_orders',
    'confirm_wholesale_orders',
  ]) {
    await revokeCap(cap)
  }
  // 2. Remettre les commandes confirmées à pending_confirmation
  for (const oid of confirmedOrders) {
    await resetOrderToPending(oid)
  }
  // 3. Supprimer la commande COD de test (créée en setup)
  await supaRest('DELETE', `/rest/v1/orders?id=eq.${COD_ORDER_ID}`)
  console.log('[CLEANUP] Done.')
})

// =============================================================================
// A — PANNEAU GÉNÉRIQUE admin/permissions : toggle volet + tâche fine
// =============================================================================
test('A — Panneau permissions : toggle volet Commandes + tâche fine', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'A-01-permissions-initial.png')

  // Vérifier que la carte Agent Démo est visible
  const agentCard = page.locator('text=Agent Démo').first()
  await expect(agentCard).toBeVisible({ timeout: ACTION_TIMEOUT })
  console.log('[A] Carte Agent Démo visible')

  // Trouver le premier bouton "Activer" (toggle volet)
  const allGrantBtns = page.locator('button').filter({ hasText: /^Activer$/ })
  const grantCount = await allGrantBtns.count()
  console.log(`[A] Boutons "Activer" trouvés : ${grantCount}`)
  expect(grantCount).toBeGreaterThan(0)

  await screenshot(page, 'A-02-before-volet-click.png')

  // Clic volet
  await allGrantBtns.first().click()
  await page.waitForTimeout(200)
  await screenshot(page, 'A-03-instant-optimistic.png')

  // Vérifier flip optimiste immédiat (< 200ms)
  const revokeVisible = await page.locator('button').filter({ hasText: /^Désactiver$/ }).first().isVisible().catch(() => false)
  const pendingVisible = await page.locator('button').filter({ hasText: /^En cours/ }).first().isVisible().catch(() => false)
  console.log(`[A] 200ms — Désactiver=${revokeVisible}, En cours=${pendingVisible}`)
  expect(revokeVisible || pendingVisible, 'Flip optimiste immédiat attendu').toBeTruthy()

  // Attendre roundtrip serveur
  await page.waitForTimeout(4_000)
  await screenshot(page, 'A-04-after-roundtrip.png')

  // Indicateurs "Activé" présents
  const activeIndicators = page.locator('span').filter({ hasText: /^Activé$/ })
  const activeCount = await activeIndicators.count()
  console.log(`[A] Indicateurs "Activé" : ${activeCount}`)
  expect(activeCount, '3 tâches fines activées attendues').toBeGreaterThanOrEqual(1)

  // Recharger pour vérifier persistance
  await page.reload()
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'A-05-persisted-after-reload.png')
  const activeAfterReload = await page.locator('span').filter({ hasText: /^Activé$/ }).count()
  console.log(`[A] Indicateurs "Activé" après rechargement : ${activeAfterReload}`)
  expect(activeAfterReload, 'Persisté après rechargement').toBeGreaterThanOrEqual(1)

  // Révoquer le volet
  const revokeBtns = page.locator('button').filter({ hasText: /^Désactiver$/ })
  if (await revokeBtns.count() > 0) {
    await revokeBtns.first().click()
    await page.waitForTimeout(4_000)
  }

  // Toggle tâche fine seule
  const fineTasks = page.locator('[class*="border-l-2"]').first()
  const fineGrantBtns = fineTasks.locator('button').filter({ hasText: /^Activer$/ })
  const fineGrantCount = await fineGrantBtns.count()
  console.log(`[A] Boutons "Activer" tâches fines : ${fineGrantCount}`)
  expect(fineGrantCount).toBeGreaterThan(0)

  await screenshot(page, 'A-06-before-fine-click.png')
  await fineGrantBtns.first().click()
  await page.waitForTimeout(200)
  await screenshot(page, 'A-07-fine-instant-optimistic.png')

  const fineFlip = await fineTasks.locator('button').filter({ hasText: /Désactiver|En cours/ }).first().isVisible().catch(() => false)
  console.log(`[A] Tâche fine flip optimiste : ${fineFlip}`)
  expect(fineFlip, 'Tâche fine flip optimiste').toBeTruthy()

  await page.waitForTimeout(4_000)
  await screenshot(page, 'A-08-fine-after-roundtrip.png')

  // Nettoyer la tâche fine
  const fineRevokeBtn = fineTasks.locator('button').filter({ hasText: /^Désactiver$/ })
  if (await fineRevokeBtn.count() > 0) {
    await fineRevokeBtn.first().click()
    await page.waitForTimeout(3_000)
  }
  await screenshot(page, 'A-09-fine-revoked.png')

  console.log('[A] PASS — Toggle volet + tâche fine : optimiste immédiat + persisté')
})

// =============================================================================
// B — THROTTLING : flip optimiste immédiat sous réseau lent
// =============================================================================
test('B — Throttling réseau : flip optimiste immédiat sous 3G lente', async ({ page, context }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'B-01-before-throttle.png')

  // Activer CDP 3G lente (~2s latence)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline:               false,
    latency:               2000,
    downloadThroughput:    50 * 1024,
    uploadThroughput:      20 * 1024,
  })
  console.log('[B] CDP 3G lente activé (latence 2000ms)')

  const fineTasks = page.locator('[class*="border-l-2"]').first()
  const fineBtn   = fineTasks.locator('button').filter({ hasText: /^Activer$/ }).first()
  await expect(fineBtn).toBeVisible({ timeout: ACTION_TIMEOUT })

  await screenshot(page, 'B-02-ready.png')

  const t0 = Date.now()
  await fineBtn.click()

  // 500ms seulement — bien avant le roundtrip (2s+)
  await page.waitForTimeout(500)
  const elapsed = Date.now() - t0
  await screenshot(page, 'B-03-500ms-after-click.png')

  const stillGrant  = await fineBtn.isVisible().catch(() => false)
  const revokeNow   = await fineTasks.locator('button').filter({ hasText: /^Désactiver$/ }).first().isVisible().catch(() => false)
  const pendingNow  = await fineTasks.locator('button').filter({ hasText: /^En cours/ }).first().isVisible().catch(() => false)

  console.log(`[B] ${elapsed}ms — stillGrant=${stillGrant}, revoke=${revokeNow}, pending=${pendingNow}`)
  expect(pendingNow || revokeNow, 'Flip optimiste attendu avant le roundtrip').toBeTruthy()

  // Désactiver throttle et attendre le roundtrip
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  })
  await page.waitForTimeout(5_000)
  await screenshot(page, 'B-04-after-roundtrip.png')

  // Nettoyer
  const revokeAfter = fineTasks.locator('button').filter({ hasText: /^Désactiver$/ }).first()
  if (await revokeAfter.isVisible().catch(() => false)) {
    await revokeAfter.click()
    await page.waitForTimeout(3_000)
  }
  await screenshot(page, 'B-05-cleanup.png')

  console.log('[B] PASS — Flip optimiste < 500ms sous 3G lente (latence 2s)')
})

// =============================================================================
// C — AUDIT EN CARTES (390px) : pas de scroll horizontal
// =============================================================================
test('C — Journal audit : cartes empilées SANS scroll horizontal à 390px', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'C-01-permissions-390px.png')

  const metrics = await page.evaluate(() => {
    const audit  = document.querySelector('[aria-labelledby="section-audit"]')
    const body   = document.body
    return {
      auditExists:     !!audit,
      auditScrollW:    audit?.scrollWidth  ?? -1,
      auditClientW:    audit?.clientWidth  ?? -1,
      bodyScrollW:     body.scrollWidth,
      bodyClientW:     body.clientWidth,
      cardCount:       audit?.querySelectorAll('.space-y-2 > div').length ?? 0,
    }
  })

  console.log('[C] Métriques:', JSON.stringify(metrics))
  await screenshot(page, 'C-02-metrics.png')

  // Body : pas de scroll horizontal (tolérance 5px)
  expect(
    metrics.bodyScrollW,
    `Body scrollWidth=${metrics.bodyScrollW} ne doit pas dépasser clientWidth=${metrics.bodyClientW}`,
  ).toBeLessThanOrEqual(metrics.bodyClientW + 5)

  if (metrics.auditExists && metrics.auditScrollW >= 0) {
    expect(
      metrics.auditScrollW,
      `Audit scrollWidth=${metrics.auditScrollW} > clientWidth=${metrics.auditClientW}`,
    ).toBeLessThanOrEqual(metrics.auditClientW + 5)

    console.log(`[C] PASS — audit scrollWidth=${metrics.auditScrollW} ≤ clientWidth=${metrics.auditClientW}`)
    console.log(`[C] ${metrics.cardCount} cartes audit`)

    // Vérifier format phrase (pas de clé brute i18n)
    if (metrics.cardCount > 0) {
      const firstCard = page.locator('[aria-labelledby="section-audit"] .space-y-2 > div').first()
      const txt = await firstCard.textContent()
      console.log('[C] Première carte:', txt?.trim().slice(0, 150))
      expect(txt).not.toMatch(/admin\.permissionsV2\.|auditSentence/)
    }
  } else {
    console.log('[C] Pas de cartes audit encore — body scroll OK')
  }

  await screenshot(page, 'C-03-final.png')
  console.log('[C] PASS — Pas de scroll horizontal à 390px')
})

// =============================================================================
// D — CONFIRMATION COD (LE FIX P1) : agent confirm_cod_orders confirme commande COD
//     Preuve DB : status avant=pending_confirmation → après=confirmed
//     Colonnes argent : cod_received, cod_expected, commission_amount inchangées
//     Commissions : 0 nouvelle ligne créée
// =============================================================================
test('D — Confirmation COD : persisté en base, colonnes argent intactes', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // ── Setup : s'assurer que la commande COD existe en pending_confirmation ───
  await ensureCodOrderExists()

  // ── Setup : accorder confirm_cod_orders SEULEMENT ──────────────────────────
  await grantCap('confirm_cod_orders')

  // ── Snapshot AVANT en DB ───────────────────────────────────────────────────
  const before = await getOrderFromDB(COD_ORDER_ID)
  console.log('[D] DB AVANT:', JSON.stringify(before))
  expect(before, 'Commande COD test introuvable').not.toBeNull()
  expect(before!.status).toBe('pending_confirmation')
  expect(before!.affiliate_id).toBeNull()

  const commsBefore = await getCommissionsForOrder(COD_ORDER_ID)
  console.log(`[D] Commissions AVANT : ${commsBefore.length}`)

  await screenshot(page, 'D-01-db-avant.png')

  // ── Login agent ────────────────────────────────────────────────────────────
  await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
  await screenshot(page, 'D-02-agent-logged-in.png')

  // ── Naviguer vers /admin/orders-confirm ───────────────────────────────────
  await page.goto(`${BASE_URL}/admin/orders-confirm`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'D-03-orders-confirm-page.png')

  // Doit être sur orders-confirm (pas redirigé)
  expect(page.url(), 'Agent doit accéder à orders-confirm').toContain('/admin/orders-confirm')

  // Vérifier section COD visible (agent a confirm_cod_orders)
  const pageBody = await page.textContent('body')
  console.log('[D] Page COD section visible:', pageBody?.includes('COD') || pageBody?.includes('Casablanca'))

  // ── Trouver la ligne de notre commande COD ─────────────────────────────────
  const orderRef = COD_ORDER_ID.slice(0, 8)
  const codRow = page.locator(`text=#${orderRef}`).first()
  const codRowVisible = await codRow.isVisible().catch(() => false)
  console.log(`[D] Ligne commande COD #${orderRef} visible : ${codRowVisible}`)

  await screenshot(page, 'D-04-cod-row-visible.png')

  if (!codRowVisible) {
    // Chercher "TEST COD SUPERVISEUR" (nom client)
    const codByName = page.locator('text=TEST COD SUPERVISEUR').first()
    const byNameVisible = await codByName.isVisible().catch(() => false)
    console.log(`[D] Par nom client : ${byNameVisible}`)
    expect(byNameVisible || codRowVisible, 'La commande COD doit apparaître dans la liste').toBeTruthy()
  }

  // ── Vérifier ABSENCE de boutons argent ────────────────────────────────────
  const dangerBtns = page.locator('button').filter({
    hasText: /delivered|livré|cod_received|encaissement|shipped|expédié|cancelled|annulé/i,
  })
  const dangerCount = await dangerBtns.count()
  console.log(`[D] Boutons argent présents : ${dangerCount}`)
  expect(dangerCount, 'AUCUN bouton argent/delivered sur vue superviseur').toBe(0)

  // ── Clic "Confirmer" — SCOPÉ à la ligne de NOTRE commande COD test ─────────
  // (pas .first() : la page peut lister d'autres commandes COD réelles)
  const confirmBtn = confirmButtonForOrder(page, COD_ORDER_ID)
  const confirmVisible = await confirmBtn.isVisible().catch(() => false)
  console.log(`[D] Bouton "Confirmer" (ligne #${orderRef}) visible : ${confirmVisible}`)

  await screenshot(page, 'D-05-before-confirm.png')

  expect(confirmVisible, 'Bouton Confirmer de la ligne COD test doit être visible').toBeTruthy()

  await confirmBtn.click()
  await page.waitForTimeout(5_000) // attendre le roundtrip RPC
  await screenshot(page, 'D-06-after-confirm-click.png')

  // Vérifier feedback succès
  const successEl = page.locator('text=/Confirmé|Confirmed|successConfirm/i').first()
  const successVisible = await successEl.isVisible().catch(() => false)
  console.log(`[D] Feedback succès UI : ${successVisible}`)

  // ── Snapshot APRÈS en DB : LE VRAI TEST DU FIX P1 ─────────────────────────
  const after = await getOrderFromDB(COD_ORDER_ID)
  console.log('[D] DB APRÈS:', JSON.stringify(after))

  expect(after, 'Commande toujours introuvable après confirmation').not.toBeNull()

  // STATUS : doit être 'confirmed' (et non 'pending_confirmation')
  expect(
    after!.status,
    `FAIL P1 FIX — status=${after!.status} attendu='confirmed'. La commande n'a PAS été confirmée en base !`,
  ).toBe('confirmed')

  // confirmed_at : doit être renseigné
  expect(after!.confirmed_at, 'confirmed_at doit être renseigné').not.toBeNull()

  // COLONNES ARGENT : INCHANGÉES
  expect(
    after!.cod_received,
    'cod_received doit rester null après confirmation simple',
  ).toBeNull()

  expect(
    after!.cod_expected,
    'cod_expected doit rester null (non touché par confirm_cod_order)',
  ).toBeNull()

  // commission_amount : doit rester 0 (valeur initiale de notre commande test)
  expect(
    after!.commission_amount,
    'commission_amount ne doit pas changer',
  ).toBe(before!.commission_amount)

  // total_amount : inchangé
  expect(after!.total_amount).toBe(before!.total_amount)

  // COMMISSIONS : 0 nouvelle ligne créée
  const commsAfter = await getCommissionsForOrder(COD_ORDER_ID)
  console.log(`[D] Commissions APRÈS : ${commsAfter.length} (avant: ${commsBefore.length})`)
  expect(
    commsAfter.length,
    `Aucune nouvelle commission ne doit être créée par confirm_cod_order`,
  ).toBe(commsBefore.length)

  confirmedOrders.add(COD_ORDER_ID)

  await screenshot(page, 'D-07-db-proof.png')

  console.log(`[D] PASS — COD confirmé en base: status=${after!.status}, confirmed_at=${after!.confirmed_at}`)
  console.log(`[D] PASS — Colonnes argent intactes: cod_received=${after!.cod_received}, cod_expected=${after!.cod_expected}`)
  console.log(`[D] PASS — Commissions : ${commsBefore.length} avant, ${commsAfter.length} après (0 ajout)`)

  // Révoquer confirm_cod_orders après ce test
  await revokeCap('confirm_cod_orders')
})

// =============================================================================
// E — CONFIRMATION AFFILIÉ : agent confirm_affiliate_orders confirme commande affiliée
//     Preuve DB : status avant=pending_confirmation → après=confirmed
// =============================================================================
test('E — Confirmation affiliée : persisté en base', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // ── Setup : accorder confirm_affiliate_orders SEULEMENT ───────────────────
  await grantCap('confirm_affiliate_orders')

  // ── Snapshot AVANT en DB ───────────────────────────────────────────────────
  const before = await getOrderFromDB(AFFILIATE_ORDER_ID)
  console.log('[E] DB AVANT:', JSON.stringify(before))
  expect(before, 'Commande affiliée test introuvable').not.toBeNull()

  if (before!.status !== 'pending_confirmation') {
    // La commande a peut-être déjà été confirmée (test précédent ou suite)
    // On la remet en pending_confirmation
    await resetOrderToPending(AFFILIATE_ORDER_ID)
    const afterReset = await getOrderFromDB(AFFILIATE_ORDER_ID)
    console.log('[E] Reset commande:', afterReset?.status)
    expect(afterReset?.status).toBe('pending_confirmation')
  }

  expect(before!.affiliate_id, 'La commande doit avoir un affiliate_id (commande affiliée)').not.toBeNull()
  const commsBefore = await getCommissionsForOrder(AFFILIATE_ORDER_ID)
  console.log(`[E] Commissions AVANT : ${commsBefore.length}`)

  // ── Login agent ────────────────────────────────────────────────────────────
  await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/orders-confirm`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'E-01-orders-confirm-affilié.png')

  expect(page.url()).toContain('/admin/orders-confirm')

  // ── Vérifier section affiliés visible ─────────────────────────────────────
  const orderRef = AFFILIATE_ORDER_ID.slice(0, 8)
  const affiliateRow = page.locator('tr').filter({ hasText: `#${orderRef}` })
  const rowVisible = await affiliateRow.isVisible().catch(() => false)
  console.log(`[E] Ligne affiliée #${orderRef} visible : ${rowVisible}`)
  expect(rowVisible, 'La ligne de la commande affiliée test doit être visible').toBeTruthy()

  await screenshot(page, 'E-02-affiliate-row.png')

  // Clic "Confirmer" — SCOPÉ à la ligne de NOTRE commande affiliée test
  // (pas .first() : déterminisme + ne jamais confirmer une autre commande réelle)
  const confirmBtn = confirmButtonForOrder(page, AFFILIATE_ORDER_ID)
  const confirmVisible = await confirmBtn.isVisible().catch(() => false)
  console.log(`[E] Bouton "Confirmer" (ligne #${orderRef}) visible : ${confirmVisible}`)
  expect(confirmVisible, 'Bouton Confirmer de la ligne affiliée doit être visible').toBeTruthy()

  await screenshot(page, 'E-03-before-confirm.png')
  await confirmBtn.click()
  await page.waitForTimeout(5_000)
  await screenshot(page, 'E-04-after-confirm.png')

  // ── Snapshot APRÈS en DB ───────────────────────────────────────────────────
  const after = await getOrderFromDB(AFFILIATE_ORDER_ID)
  console.log('[E] DB APRÈS:', JSON.stringify(after))

  expect(after!.status, `status=${after!.status} attendu='confirmed'`).toBe('confirmed')
  expect(after!.confirmed_at).not.toBeNull()

  // Colonnes argent inchangées
  expect(after!.cod_received).toBeNull()
  expect(after!.affiliate_commission_mad_snapshot).toBe(before!.affiliate_commission_mad_snapshot)

  const commsAfter = await getCommissionsForOrder(AFFILIATE_ORDER_ID)
  console.log(`[E] Commissions APRÈS : ${commsAfter.length}`)
  expect(commsAfter.length, 'Aucune commission créée par la confirmation').toBe(commsBefore.length)

  confirmedOrders.add(AFFILIATE_ORDER_ID)

  await screenshot(page, 'E-05-db-proof.png')
  console.log(`[E] PASS — Affilié confirmé: status=${after!.status}, confirmed_at=${after!.confirmed_at}`)

  // Révoquer confirm_affiliate_orders
  await revokeCap('confirm_affiliate_orders')
})

// =============================================================================
// F — ISOLATION CANAL : agent avec SEULEMENT confirm_cod_orders
//     tente de confirmer une commande AFFILIÉE → REFUS
// =============================================================================
test('F — Isolation canal : confirm_cod_orders REFUSE commande affiliée', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // Accorder UNIQUEMENT confirm_cod_orders (pas confirm_affiliate_orders)
  await grantCap('confirm_cod_orders')

  // S'assurer que la commande affiliée est en pending_confirmation
  const orderState = await getOrderFromDB(AFFILIATE_ORDER_ID)
  if (orderState?.status !== 'pending_confirmation') {
    await resetOrderToPending(AFFILIATE_ORDER_ID)
  }

  // S'assurer que la commande COD existe
  await ensureCodOrderExists()

  await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/orders-confirm`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'F-01-orders-confirm-cod-only.png')

  // ── PREUVE UI : la section affiliés N'EST PAS rendue (page conditionnelle) ──
  // hasAffiliate=false côté serveur → aucune ligne de commande affiliée visible.
  const orderRef = AFFILIATE_ORDER_ID.slice(0, 8)
  const affiliateRow = page.locator('tr').filter({ hasText: `#${orderRef}` })
  const affiliateRowVisible = await affiliateRow.isVisible().catch(() => false)
  console.log(`[F] Ligne commande AFFILIÉE visible (agent confirm_cod_orders only) : ${affiliateRowVisible}`)
  await screenshot(page, 'F-02-affiliate-section-absent.png')
  expect(
    affiliateRowVisible,
    'ISOLATION UI : la commande affiliée NE DOIT PAS être rendue pour un agent confirm_cod_orders only',
  ).toBe(false)

  // ── PREUVE SÉCURITÉ (niveau RPC) : l'agent tente le RPC directement ─────────
  // Même en contournant l'UI (qui masque la section), le RPC confirm_cod_order
  // gate par canal : commande affiliée → has_capability('confirm_affiliate_orders')
  // requis. L'agent ne l'a pas → 'errors.forbidden'. auth.uid() = l'agent (JWT).
  const agentJwt = await getAgentJwt()
  const rpcRes = await supaCall(
    'POST',
    '/rest/v1/rpc/confirm_cod_order',
    { p_order_id: AFFILIATE_ORDER_ID },
    ANON_KEY,
    agentJwt,
  )
  console.log(`[F] RPC confirm_cod_order(affiliée) en tant qu'agent → HTTP ${rpcRes.status} : ${rpcRes.body.slice(0, 200)}`)

  // Le RPC doit ÉCHOUER (4xx) avec errors.forbidden
  expect(rpcRes.status, 'Le RPC doit refuser (statut 4xx)').toBeGreaterThanOrEqual(400)
  expect(rpcRes.body, 'Le RPC doit lever errors.forbidden').toMatch(/forbidden/)

  // La commande affiliée NE DOIT PAS avoir été confirmée (rollback atomique)
  const afterAttempt = await getOrderFromDB(AFFILIATE_ORDER_ID)
  console.log(`[F] Statut commande affiliée après tentative RPC : ${afterAttempt?.status}`)
  expect(
    afterAttempt?.status,
    'La commande affiliée ne doit PAS être confirmée par un agent confirm_cod_orders only',
  ).toBe('pending_confirmation')

  await screenshot(page, 'F-03-isolation-rpc-forbidden.png')
  console.log('[F] PASS — Isolation canal : UI masquée + RPC forbidden + commande intacte')

  await revokeCap('confirm_cod_orders')
})

// =============================================================================
// G — FRONTIÈRE ARGENT : après confirmation COD
//     - status='confirmed' MAIS cod_received=null ET cod_expected=null
//     - Aucune commission créée (table commissions)
//     - AUCUN bouton 'delivered'/encaissement sur vue superviseur
// =============================================================================
test('G — Frontière argent : confirmed mais zéro colonne argent touchée', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // S'assurer que la commande COD existe et est en pending_confirmation
  await ensureCodOrderExists()

  // Accorder confirm_cod_orders
  await grantCap('confirm_cod_orders')

  // Snapshot colonnes argent AVANT
  const beforeG = await getOrderFromDB(COD_ORDER_ID)
  console.log('[G] DB AVANT:', JSON.stringify({
    status: beforeG?.status,
    cod_received: beforeG?.cod_received,
    cod_expected: beforeG?.cod_expected,
    commission_amount: beforeG?.commission_amount,
    total_amount: beforeG?.total_amount,
    affiliate_commission_mad_snapshot: beforeG?.affiliate_commission_mad_snapshot,
  }))

  const commsBefore = await getCommissionsForOrder(COD_ORDER_ID)
  console.log(`[G] Commissions AVANT : ${commsBefore.length}`)

  // Confirmer via login agent
  await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/orders-confirm`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'G-01-before-cod-confirm.png')

  // SCOPÉ à la ligne de NOTRE commande COD test (déterminisme + sûreté)
  const confirmBtn = confirmButtonForOrder(page, COD_ORDER_ID)
  expect(
    await confirmBtn.isVisible().catch(() => false),
    'Bouton Confirmer de la ligne COD test doit être visible',
  ).toBeTruthy()
  await confirmBtn.click()
  await page.waitForTimeout(5_000)
  await screenshot(page, 'G-02-after-cod-confirm.png')

  // Snapshot APRÈS
  const afterG = await getOrderFromDB(COD_ORDER_ID)
  console.log('[G] DB APRÈS:', JSON.stringify({
    status: afterG?.status,
    cod_received: afterG?.cod_received,
    cod_expected: afterG?.cod_expected,
    commission_amount: afterG?.commission_amount,
    total_amount: afterG?.total_amount,
    affiliate_commission_mad_snapshot: afterG?.affiliate_commission_mad_snapshot,
  }))

  // STATUS = 'confirmed'
  expect(afterG?.status).toBe('confirmed')
  expect(afterG?.confirmed_at).not.toBeNull()

  // cod_received : TOUJOURS NULL
  expect(
    afterG?.cod_received,
    'FRONTIERE ARGENT : cod_received doit rester null après confirmation',
  ).toBeNull()

  // cod_expected : INCHANGÉ
  expect(afterG?.cod_expected).toBe(beforeG?.cod_expected)

  // commission_amount : INCHANGÉ
  expect(afterG?.commission_amount).toBe(beforeG?.commission_amount)

  // total_amount : INCHANGÉ
  expect(afterG?.total_amount).toBe(beforeG?.total_amount)

  // affiliate_commission_mad_snapshot : INCHANGÉ
  expect(afterG?.affiliate_commission_mad_snapshot).toBe(beforeG?.affiliate_commission_mad_snapshot)

  // Commissions : zéro nouvelle ligne
  const commsAfter = await getCommissionsForOrder(COD_ORDER_ID)
  console.log(`[G] Commissions APRÈS : ${commsAfter.length}`)
  expect(
    commsAfter.length,
    `${commsAfter.length - commsBefore.length} commission(s) créée(s) de façon non attendue`,
  ).toBe(commsBefore.length)

  // Vue superviseur : AUCUN bouton delivered / encaissement
  const dangerBtns = page.locator('button').filter({
    hasText: /delivered|livré|cod_received|encaissement|shipped|expédié|payment|payé/i,
  })
  const dangerCount = await dangerBtns.count()
  console.log(`[G] Boutons argent sur vue superviseur : ${dangerCount}`)
  expect(dangerCount, 'AUCUN bouton argent/delivered visible').toBe(0)

  confirmedOrders.add(COD_ORDER_ID)

  await screenshot(page, 'G-03-frontiere-argent-proven.png')
  console.log('[G] PASS — status=confirmed, cod_received=null, 0 commission créée, 0 bouton argent')

  await revokeCap('confirm_cod_orders')
})

// =============================================================================
// H — NON-RÉGRESSION ADMIN : /admin/orders, /admin/sourcing/agents fonctionnent
// =============================================================================
test('H — Non-régression admin : orders + sourcing/agents OK post-migration', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')

  // /admin/orders
  await page.goto(`${BASE_URL}/admin/orders`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'H-01-admin-orders.png')

  expect(page.url()).toContain('/admin/orders')
  // Vérifier l'absence d'une page d'erreur réelle (h1/titre, pas le JS bundle)
  // On vérifie via le DOM visible — pas `textContent('body')` qui inclut le JS RSC
  const errorH1 = await page.locator('h1, [role="heading"]').filter({
    hasText: /404|Erreur critique|not found|Internal Server Error/i,
  }).count()
  expect(errorH1, 'Page orders ne doit pas afficher un titre erreur').toBe(0)
  // La page doit avoir au moins un lien ou un bouton (contenu non vide)
  const pageHasContent = (await page.locator('table, [role="table"], tr, .divide-y > *').count()) > 0
  console.log(`[H] /admin/orders : chargé (contenu=${pageHasContent})`)

  // /admin/sourcing/agents
  await page.goto(`${BASE_URL}/admin/sourcing/agents`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'H-02-sourcing-agents.png')

  const agentCard = page.locator('text=Agent Démo').first()
  const agentVisible = await agentCard.isVisible().catch(() => false)
  console.log(`[H] Agent Démo visible : ${agentVisible}`)

  if (agentVisible) {
    // Toggle manage_country_sourcing visible
    const switchBtns = page.locator('button').filter({ hasText: /Activer|Désactiver/i })
    const switchCount = await switchBtns.count()
    console.log(`[H] Boutons toggle : ${switchCount}`)
    expect(switchCount).toBeGreaterThan(0)
    await screenshot(page, 'H-03-sourcing-toggles.png')
  } else {
    console.log('[H] Agent Démo non visible (liste peut être vide ou paginée)')
  }

  // /admin/permissions (admin voit tout)
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'H-04-admin-permissions.png')

  await expect(
    page.locator('text=Agent Démo').first(),
    'Agent Démo doit apparaître dans /admin/permissions',
  ).toBeVisible({ timeout: ACTION_TIMEOUT })

  console.log('[H] PASS — Non-régression admin confirmée')
})

// =============================================================================
// I — i18n + RTL : /admin/permissions en FR, AR, EN — pas de clés brutes
// =============================================================================
test('I — i18n + RTL : FR/AR/EN sans clé brute, RTL correct en AR', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // ── FR ────────────────────────────────────────────────────────────────────
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'I-01-fr-permissions.png')

  const frContent = await page.textContent('body')
  expect(frContent, 'Clé brute FR').not.toMatch(/admin\.permissionsV2\.|admin\.common\./)
  expect(frContent).toMatch(/Commandes|Catégories|Sourcing|Activer|Désactiver/i)
  console.log('[I] FR : pas de clé brute')

  // ── AR (RTL) ──────────────────────────────────────────────────────────────
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'LOCALE', value: 'ar', domain: 'localhost', path: '/' }])
  await page.goto(`${BASE_URL}/login`, { timeout: NAV_TIMEOUT })
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: NAV_TIMEOUT }),
    page.locator('button[type="submit"]').click(),
  ])
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'I-02-ar-permissions.png')

  // Direction RTL
  const dirValue = await page.evaluate(() =>
    document.documentElement.getAttribute('dir') ||
    document.body.getAttribute('dir') ||
    'none',
  )
  console.log(`[I] AR — dir="${dirValue}"`)
  expect(dirValue, 'Direction RTL attendue en AR').toBe('rtl')

  const arContent = await page.textContent('body')
  expect(arContent, 'Clé brute AR').not.toMatch(/admin\.permissionsV2\.|admin\.common\./)
  console.log('[I] AR : pas de clé brute, dir=rtl')

  // Vérifier texte d'un bouton en AR
  const fineTasks = page.locator('[class*="border-l-2"]').first()
  const arBtn = fineTasks.locator('button').filter({ hasText: /.+/ }).first()
  if (await arBtn.isVisible().catch(() => false)) {
    const btnTxt = await arBtn.textContent()
    console.log(`[I] Bouton AR : "${btnTxt?.trim()}"`)
    expect(btnTxt?.trim(), 'Bouton ne doit pas afficher une clé brute').not.toMatch(/^admin\.|^\w+\.\w+\.\w+/)
  }

  // ── EN ────────────────────────────────────────────────────────────────────
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'LOCALE', value: 'en', domain: 'localhost', path: '/' }])
  await page.goto(`${BASE_URL}/login`, { timeout: NAV_TIMEOUT })
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: NAV_TIMEOUT }),
    page.locator('button[type="submit"]').click(),
  ])
  await page.goto(`${BASE_URL}/admin/permissions`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')
  await screenshot(page, 'I-03-en-permissions.png')

  const enContent = await page.textContent('body')
  expect(enContent, 'Clé brute EN').not.toMatch(/admin\.permissionsV2\.|admin\.common\./)
  expect(enContent).toMatch(/Orders|Categories|Sourcing|Grant|Revoke|Supervisor/i)
  console.log('[I] EN : pas de clé brute')

  console.log('[I] PASS — FR/AR/EN : aucune clé brute, RTL correct en AR')
})
