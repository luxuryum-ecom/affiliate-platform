/**
 * Lot F — captures réelles FR/AR des écrans relevés PDF :
 *  - /admin/payouts (formulaire payout avec sélecteur de méthode)
 *  - /admin/couriers/[id] (section « Relevés signables » : générateur + liste)
 *  - /affiliate/statements (espace affilié « Mes relevés »)
 *
 * RÈGLE #8 : next dev forcé sur LOCAL (playwright.lot-f.config.ts). Mots de passe
 * LOCAL jetables (seed). Langue via cookie LOCALE (pas de préfixe /fr /ar).
 * Pré-requis : node scripts/seed-lot-f-captures-local.mjs
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const SCRATCHPAD =
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'
const CAPTURES_DIR = path.join(SCRATCHPAD, 'lot-f-captures')
const SEEDS_FILE = path.join(SCRATCHPAD, 'lot-f-captures-seed-ids.json')

const seeds = JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) as {
  admin: { email: string; password: string }
  affiliate: { email: string; password: string }
  courierId: string
  payoutId: string
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  expect(page.url()).not.toContain('/login')
}

async function setLocale(context: import('@playwright/test').BrowserContext, locale: 'fr' | 'ar') {
  await context.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
}

test.describe('Lot F — captures relevés', () => {
  test('admin : payouts (méthode) + fiche livreur (relevés signables), FR/AR', async ({ page, context }) => {
    await login(page, seeds.admin.email, seeds.admin.password)
    for (const locale of LOCALES) {
      await setLocale(context, locale)

      await page.goto('/admin/payouts')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })
      const dir = await page.locator('html').getAttribute('dir')
      expect(dir).toBe(locale === 'ar' ? 'rtl' : 'ltr')
      await page.screenshot({ path: path.join(CAPTURES_DIR, `admin-payouts-${locale}.png`), fullPage: true })

      await page.goto(`/admin/couriers/${seeds.courierId}`)
      await page.waitForLoadState('networkidle', { timeout: 20_000 })
      await page.screenshot({ path: path.join(CAPTURES_DIR, `admin-courier-statements-${locale}.png`), fullPage: true })
    }
  })

  test('affilié : Mes relevés, FR/AR', async ({ page, context }) => {
    await login(page, seeds.affiliate.email, seeds.affiliate.password)
    for (const locale of LOCALES) {
      await setLocale(context, locale)
      await page.goto('/affiliate/statements')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })
      const dir = await page.locator('html').getAttribute('dir')
      expect(dir).toBe(locale === 'ar' ? 'rtl' : 'ltr')
      await page.screenshot({ path: path.join(CAPTURES_DIR, `affiliate-statements-${locale}.png`), fullPage: true })
    }
  })
})
