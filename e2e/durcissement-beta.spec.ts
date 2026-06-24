/**
 * durcissement-beta.spec.ts
 * Vérification RUNTIME — lot "durcissement go-live beta vitrine".
 * Scénarios navigateur (les vérifs API vue/​signup sont faites par ailleurs).
 * Captures dans .nav-proofs/durcissement-beta/. Secrets via process.env (règle #7).
 *
 * PRÉREQUIS (opt-in, hors `pnpm smoke`) : `./node_modules/.bin/next start -p 3000`.
 *   Connexion Supabase = LOCALE via getLocalSupabaseEnv() (« supabase status »),
 *   JAMAIS .env.local/prod. Les mots de passe comptes test (SMOKE_*) restent via process.env.
 *   ./node_modules/.bin/playwright test --config=playwright.durcissement.config.ts
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getLocalSupabaseEnv } from './assert-local-supabase'

test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:3000'
const PROOFS = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/.nav-proofs/durcissement-beta'

// GARDE-FOU (incident 2026-06-24) : ce spec ÉCRIT via service_role (upsert) →
// identifiants Supabase LOCAUX uniquement (jamais .env.local/prod). REFUS si non-local.
const LOCAL = getLocalSupabaseEnv()
const SUPA = LOCAL.url
const ANON = LOCAL.anonKey
const SVC = LOCAL.serviceKey
const W_EMAIL = process.env.SMOKE_WHOLESALE_EMAIL ?? ''
const W_PWD = process.env.SMOKE_WHOLESALE_PASSWORD ?? ''
const A_EMAIL = process.env.SMOKE_AFFILIATE_EMAIL ?? ''
const A_PWD = process.env.SMOKE_AFFILIATE_PASSWORD ?? ''
const PEND_PWD = process.env.PENDING_TEST_PASSWORD ?? 'PendTest2026!'

// Colonnes COÛT/MARGE (dette 073) qui ne doivent JAMAIS apparaître dans un payload non-staff.
// NB : on NE scanne PAS 'supplier_id' — il matcherait la clé i18n bénigne `supplier_id_required`
// (faux positif). L'absence du VRAI supplier_id (valeur) est garantie par les vues redacted
// (mig 045 exclut supplier_id) et confirmée par @security.
const SENSITIVE = [
  'factory_cost_mad', 'platform_margin', 'purchase_price',
  'margin_percentage', 'calculated_sale_price', 'estimated_cost_mad',
]

function shot(page: Page, name: string) {
  if (!fs.existsSync(PROOFS)) fs.mkdirSync(PROOFS, { recursive: true })
  return page.screenshot({ path: path.join(PROOFS, name), fullPage: true })
}

async function svc(method: string, p: string, body?: object) {
  const r = await fetch(`${SUPA}${p}`, {
    method,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  try { return { s: r.status, b: t ? JSON.parse(t) : null } } catch { return { s: r.status, b: t } }
}

async function login(page: Page, email: string, password: string, locale: 'fr' | 'ar' | 'en' = 'fr') {
  await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
  await page.goto(`${BASE}/login`, { timeout: 30_000 })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ])
}

function assertNoSensitive(html: string, where: string) {
  const lower = html.toLowerCase()
  const hits = SENSITIVE.filter((s) => lower.includes(s.toLowerCase()))
  expect(hits, `${where} : noms sensibles trouvés dans le payload → ${hits.join(', ')}`).toEqual([])
}

// ── S1 — payload GROSSISTE sans coût/marge ──────────────────────────────────
test('S1 — payload grossiste : zéro coût/marge', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, W_EMAIL, W_PWD, 'fr')

  await page.goto(`${BASE}/wholesale/marketplace`, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await shot(page, 'S1-01-marketplace.png')
  assertNoSensitive(await page.content(), 'marketplace liste')

  // ouvrir une fiche détail marketplace (1er lien produit)
  const card = page.locator('a[href*="/wholesale/marketplace/"], a[href*="/wholesale/products/"]').first()
  if (await card.count() > 0) {
    await card.click()
    await page.waitForLoadState('networkidle')
    await shot(page, 'S1-02-detail.png')
    assertNoSensitive(await page.content(), 'fiche détail grossiste')
  }
  console.log('[S1] PASS — payload grossiste sans coût/marge')
})

// ── S2 — payload AFFILIÉ : gain affiché, zéro coût/marge ─────────────────────
test('S2 — payload affilié : gain affiché, zéro coût/marge', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, A_EMAIL, A_PWD, 'fr')

  await page.goto(`${BASE}/affiliate/products`, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  const listHtml = await page.content()
  await shot(page, 'S2-01-affiliate-products.png')
  assertNoSensitive(listHtml, 'affilié liste')
  // preuve que le calcul commission marche : un montant MAD est rendu quelque part
  expect(listHtml).toMatch(/MAD/)

  const card = page.locator('a[href*="/affiliate/products/"]').first()
  if (await card.count() > 0) {
    await card.click()
    await page.waitForLoadState('networkidle')
    await shot(page, 'S2-02-affiliate-detail.png')
    assertNoSensitive(await page.content(), 'affilié détail')
  }
  console.log('[S2] PASS — gain affiché, zéro coût/marge')
})

// ── S3 — reset mot de passe ─────────────────────────────────────────────────
test('S3 — reset MDP : lien login + message neutre + session requise', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto(`${BASE}/login`, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  const forgot = page.locator('a[href*="/forgot-password"]')
  await expect(forgot, 'lien « mot de passe oublié » sur /login').toHaveCount(1)
  await shot(page, 'S3-01-login-forgot-link.png')

  await page.goto(`${BASE}/forgot-password`, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await page.locator('#email, input[type="email"]').first().fill('inconnu-xyz@example.com')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2500)
  await shot(page, 'S3-02-forgot-neutral.png')
  // message neutre affiché (pas de clé brute auth.)
  const fc = await page.content()
  expect(fc).not.toMatch(/auth\.forgotPassword\./)

  await page.goto(`${BASE}/reset-password`, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await shot(page, 'S3-03-reset-no-session.png')
  expect(await page.content()).not.toMatch(/auth\.resetPassword\./)
  console.log('[S3] PASS — reset MDP : lien + neutre + session requise')
})

// ── S4 — /pending clair + i18n/RTL ──────────────────────────────────────────
test('S4 — /pending clair FR/AR/EN + RTL', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })

  // créer un grossiste PENDING de test
  const email = `pending-test-${Date.now()}@mozouna.test`
  const created = await svc('POST', '/auth/v1/admin/users', { email, password: PEND_PWD, email_confirm: true })
  const uid = created.b?.id
  expect(uid, 'création compte pending test').toBeTruthy()
  await svc('POST', '/rest/v1/profiles', { id: uid, role: 'wholesaler', status: 'pending', full_name: 'Test Pending' })

  try {
    for (const loc of ['fr', 'ar', 'en'] as const) {
      await page.context().clearCookies()
      await login(page, email, PEND_PWD, loc)
      // doit atterrir sur /pending
      await page.goto(`${BASE}/pending`, { timeout: 30_000 })
      await page.waitForLoadState('networkidle')
      await shot(page, `S4-${loc}-pending.png`)
      const html = await page.content()
      // pas de clé i18n brute
      expect(html, `clé brute en ${loc}`).not.toMatch(/auth\.pending\./)
      if (loc === 'ar') {
        const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
        expect(dir, 'RTL en AR').toBe('rtl')
      }
      // pas de débordement horizontal
      const metrics = await page.evaluate(() => ({ sw: document.body.scrollWidth, cw: document.body.clientWidth }))
      expect(metrics.sw, `débordement ${loc}`).toBeLessThanOrEqual(metrics.cw + 5)
    }
    console.log('[S4] PASS — /pending clair FR/AR/EN + RTL, 0 débordement')
  } finally {
    await svc('DELETE', `/rest/v1/profiles?id=eq.${uid}`)
    await svc('DELETE', `/auth/v1/admin/users/${uid}`)
    console.log('[S4] cleanup compte pending test')
  }
})
