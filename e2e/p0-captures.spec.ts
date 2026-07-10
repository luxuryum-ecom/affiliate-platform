/**
 * P0 trésorerie/réconciliation — captures réelles FR/AR/EN des 2 écrans admin
 * (/admin/remittances + /admin/treasury), sur données réalistes seedées en LOCAL
 * (scripts/seed-p0-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.p0.config.ts, cf. RÈGLE #8).
 * - Aucun secret réel en dur : mot de passe LOCAL jetable (p0admin-cap@test.local),
 *   même convention que e2e/lot1e-audit.spec.ts.
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'

const CAPTURES_DIR = path.resolve(
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad/p0-captures',
)

const ADMIN_EMAIL = 'p0admin-cap@test.local'
const ADMIN_PASSWORD = 'P0Capture2026!'

const PAGE_TITLES: Record<'fr' | 'ar' | 'en', { remittances: string; treasury: string }> = {
  fr: { remittances: 'Réconciliation livreur', treasury: 'Trésorerie' },
  ar: { remittances: 'تسوية الموزّع', treasury: 'الخزينة' },
  en: { remittances: 'Courier reconciliation', treasury: 'Treasury' },
}

const LOCALES: Array<'fr' | 'ar' | 'en'> = ['fr', 'ar', 'en']

test.describe('P0 captures — trésorerie & réconciliation', () => {
  for (const locale of LOCALES) {
    test(`captures ${locale} — /admin/remittances + /admin/treasury`, async ({ page, context }) => {
      // ── Connexion admin via l'UI (une fois par test, storageState non partagé ici) ──
      await page.goto('/login')
      await page.locator('#email').fill(ADMIN_EMAIL)
      await page.locator('#password').fill(ADMIN_PASSWORD)
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
        page.locator('button[type="submit"]').click(),
      ])
      expect(page.url(), 'Doit être redirigé hors /login après connexion').not.toContain('/login')

      // ── Langue via le cookie LOCALE ──────────────────────────────────────────
      await context.addCookies([
        { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      // ── Écran 1 : réconciliation livreur ─────────────────────────────────────
      await page.goto('/admin/remittances')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const rootDir = await page.locator('html').getAttribute('dir')
      if (locale === 'ar') {
        expect(rootDir, 'AR doit rendre en RTL (html dir=rtl)').toBe('rtl')
      } else {
        expect(rootDir, `${locale} doit rendre en LTR (html dir=ltr)`).toBe('ltr')
      }

      const remitTitle = page.locator('h1', { hasText: PAGE_TITLES[locale].remittances })
      await expect(remitTitle, `Titre "${PAGE_TITLES[locale].remittances}" visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `remittances-${locale}.png`),
        fullPage: true,
      })

      // ── Écran 2 : cockpit trésorerie ─────────────────────────────────────────
      await page.goto('/admin/treasury')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const treasuryTitle = page.locator('h1', { hasText: PAGE_TITLES[locale].treasury })
      await expect(treasuryTitle, `Titre "${PAGE_TITLES[locale].treasury}" visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `treasury-${locale}.png`),
        fullPage: true,
      })
    })
  }
})
