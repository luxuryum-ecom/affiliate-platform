/**
 * Lot G « Agent Gardien » — captures réelles sur données seedées en LOCAL
 * (scripts/seed-guardian-captures-local.mjs) :
 *   • Cockpit desktop /admin/guardian en FR + AR (RTL vérifié).
 *   • Écrans mobiles /admin/couriers/reception + /inventory en viewport 390×844 (règle gravée).
 *
 * RÈGLES : next dev forcé sur le Supabase LOCAL (playwright.guardian.config.ts, RÈGLE #8).
 * Mot de passe LOCAL jetable. Langue via le cookie LOCALE (src/i18n/request.ts).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { mkdirSync } from 'node:fs'

const CAPTURES_DIR = path.join(os.homedir(), 'Desktop', 'p0-ecrans', 'livreurs-lot-g')
mkdirSync(CAPTURES_DIR, { recursive: true })

const ADMIN_EMAIL = 'guardianadmin-cap@test.local'
const ADMIN_PASSWORD = 'Guardian0Capture2026!'
const MOBILE = { width: 390, height: 844 }

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  expect(page.url(), 'redirigé hors /login').not.toContain('/login')
}

async function setLocale(context: import('@playwright/test').BrowserContext, locale: 'fr' | 'ar') {
  await context.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
}

test.describe('Captures Lot G — Agent Gardien', () => {
  test('cockpit desktop /admin/guardian — FR + AR', async ({ page, context }) => {
    await login(page)
    for (const locale of ['fr', 'ar'] as const) {
      await setLocale(context, locale)
      await page.goto('/admin/guardian')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })
      const dir = await page.locator('html').getAttribute('dir')
      expect(dir, `${locale} → dir`).toBe(locale === 'ar' ? 'rtl' : 'ltr')
      expect(page.url(), 'pas de redirection login').not.toContain('/login')
      await page.screenshot({ path: path.join(CAPTURES_DIR, `guardian-cockpit-${locale}.png`), fullPage: true })
    }
  })

  test('écrans mobiles 390×844 — réception + inventaire (FR + AR réception)', async ({ page, context }) => {
    await page.setViewportSize(MOBILE)
    await login(page)

    await setLocale(context, 'fr')
    await page.goto('/admin/couriers/reception')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    expect(page.url()).not.toContain('/login')
    await page.screenshot({ path: path.join(CAPTURES_DIR, 'reception-mobile-fr.png'), fullPage: true })

    await page.goto('/admin/couriers/inventory')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    await page.screenshot({ path: path.join(CAPTURES_DIR, 'inventory-mobile-fr.png'), fullPage: true })

    await setLocale(context, 'ar')
    await page.goto('/admin/couriers/reception')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })
    const dir = await page.locator('html').getAttribute('dir')
    expect(dir, 'AR → RTL').toBe('rtl')
    await page.screenshot({ path: path.join(CAPTURES_DIR, 'reception-mobile-ar.png'), fullPage: true })
  })
})
