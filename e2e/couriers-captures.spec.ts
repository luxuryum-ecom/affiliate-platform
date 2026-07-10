/**
 * Registre livreurs — captures réelles FR/AR des 2 écrans admin
 * (/admin/couriers + /admin/couriers/[id]), sur données réalistes seedées en
 * LOCAL (scripts/seed-couriers-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.couriers.config.ts, RÈGLE #8).
 * - Aucun secret réel en dur : mot de passe LOCAL jetable (couriersadmin-cap@test.local),
 *   même convention que e2e/p0-captures.spec.ts.
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const SCRATCHPAD = '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'

const CAPTURES_DIR = path.join(SCRATCHPAD, 'couriers-captures')
const SEEDS_FILE = path.join(SCRATCHPAD, 'couriers-captures-seed-ids.json')

const ADMIN_EMAIL = 'couriersadmin-cap@test.local'
const ADMIN_PASSWORD = 'Couriers0Capture2026!'

const PAGE_TITLES: Record<'fr' | 'ar', { list: string; detail: string }> = {
  fr: { list: 'Livreurs', detail: 'Hassan El Idrissi' },
  ar: { list: 'الموزّعون', detail: 'Hassan El Idrissi' },
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

test.describe('Captures registre livreurs — /admin/couriers', () => {
  for (const locale of LOCALES) {
    test(`captures ${locale} — liste + fiche détaillée`, async ({ page, context }) => {
      const seeds = JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) as {
        couriers: { perso: { id: string } }
      }
      const persoCourierId = seeds.couriers.perso.id

      // ── Connexion admin via l'UI ──────────────────────────────────────────
      await page.goto('/login')
      await page.locator('#email').fill(ADMIN_EMAIL)
      await page.locator('#password').fill(ADMIN_PASSWORD)
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
        page.locator('button[type="submit"]').click(),
      ])
      expect(page.url(), 'Doit être redirigé hors /login après connexion').not.toContain('/login')

      // ── Langue via le cookie LOCALE ──────────────────────────────────────
      await context.addCookies([
        { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      // ── Écran 1 : liste des livreurs ─────────────────────────────────────
      await page.goto('/admin/couriers')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const rootDir = await page.locator('html').getAttribute('dir')
      if (locale === 'ar') {
        expect(rootDir, 'AR doit rendre en RTL (html dir=rtl)').toBe('rtl')
      } else {
        expect(rootDir, `${locale} doit rendre en LTR (html dir=ltr)`).toBe('ltr')
      }

      const listTitle = page.locator('h1', { hasText: PAGE_TITLES[locale].list })
      await expect(listTitle, `Titre "${PAGE_TITLES[locale].list}" visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `couriers-list-${locale}.png`),
        fullPage: true,
      })

      // ── Écran 2 : fiche détaillée du livreur personnel (avec créance) ───
      await page.goto(`/admin/couriers/${persoCourierId}`)
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const detailTitle = page.locator('h1', { hasText: PAGE_TITLES[locale].detail })
      await expect(detailTitle, `Titre fiche "${PAGE_TITLES[locale].detail}" visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `courier-detail-${locale}.png`),
        fullPage: true,
      })
    })
  }
})
