/**
 * Portail livreur cloisonné — captures réelles FR/AR mobile de `/courier/scan`
 * (module Livreurs, Lot B), sur données réalistes seedées en LOCAL
 * (scripts/seed-lotb-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.lotb.config.ts, RÈGLE #8).
 * - Aucun secret réel en dur : le code d'accès (LOTBDEMO12345678) est une
 *   constante de DÉMO LOCALE, jamais un secret de prod (RÈGLE #7).
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 * - AUCUNE session Supabase requise : le portail se résout par ?code=... seul.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'

const SCRATCHPAD = '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'
const CAPTURES_DIR = path.join(SCRATCHPAD, 'lotb-captures')

const ACCESS_CODE = 'LOTBDEMO12345678'

const PAGE_TITLES: Record<'fr' | 'ar', string> = {
  fr: 'Scanner mes livraisons',
  ar: 'مسح طلبيات التوصيل',
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

test.describe('Captures portail livreur — /courier/scan', () => {
  for (const locale of LOCALES) {
    test(`captures ${locale} — file de scan mobile`, async ({ page, context }) => {
      // ── Langue via le cookie LOCALE (avant navigation) ────────────────────
      await context.addCookies([
        { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      await page.goto(`/courier/scan?code=${ACCESS_CODE}`)
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const rootDir = await page.locator('html').getAttribute('dir')
      if (locale === 'ar') {
        expect(rootDir, 'AR doit rendre en RTL (html dir=rtl)').toBe('rtl')
      } else {
        expect(rootDir, `${locale} doit rendre en LTR (html dir=ltr)`).toBe('ltr')
      }

      // Titre traduit du portail (sous-titre du header, pas un h1 — le portail
      // livreur n'affiche pas de header admin, juste nom livreur + pageTitle).
      const title = page.locator('p', { hasText: PAGE_TITLES[locale] })
      await expect(title, `Titre "${PAGE_TITLES[locale]}" visible (${locale})`).toBeVisible()

      // La file de commandes s'affiche : au moins 1 carte cliquable (référence + ville + montant).
      const manualSection = page.locator('h2', { hasText: locale === 'fr' ? 'Mes commandes à livrer' : 'طلبياتي للتوصيل' })
      await expect(manualSection, `Section file manuelle visible (${locale})`).toBeVisible()

      const orderCards = page.locator('button.w-full.text-start')
      await expect(orderCards.first(), `Au moins 1 carte commande visible (${locale})`).toBeVisible()
      const cardCount = await orderCards.count()
      expect(cardCount, `Au moins 4 commandes dans la file (${locale})`).toBeGreaterThanOrEqual(4)

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `courier-scan-${locale}.png`),
        fullPage: true,
      })
    })
  }

  test('écran verrouillé — code invalide (cloisonnement)', async ({ page, context }) => {
    await context.addCookies([
      { name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' },
    ])

    await page.goto('/courier/scan?code=INVALID')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    const lock = page.locator('text=🔒')
    await expect(lock, 'Icône verrou visible pour un code invalide').toBeVisible()

    const invalidTitle = page.locator('h1', { hasText: 'Lien invalide' })
    await expect(invalidTitle, 'Titre "Lien invalide" visible').toBeVisible()

    await page.screenshot({
      path: path.join(CAPTURES_DIR, 'courier-scan-locked-fr.png'),
      fullPage: true,
    })
  })
})
