/**
 * Tableau de bord livreur cloisonné — captures réelles FR/AR mobile de `/courier`
 * (module Livreurs, Lot C), sur données réalistes seedées en LOCAL
 * (scripts/seed-lotc-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.lotc.config.ts, RÈGLE #8).
 * - Aucun secret réel en dur : le code d'accès (LOTCDEMO12345678) est une
 *   constante de DÉMO LOCALE, jamais un secret de prod (RÈGLE #7).
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 * - AUCUNE session Supabase requise : le portail se résout par ?code=... seul.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'

const SCRATCHPAD = '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'
const CAPTURES_DIR = path.join(SCRATCHPAD, 'lotc-captures')

const ACCESS_CODE = 'LOTCDEMO12345678'
const COURIER_NAME = 'Youssef Livreur'

const PAGE_TITLES: Record<'fr' | 'ar', string> = {
  fr: 'Mon tableau de bord',
  ar: 'لوحتي',
}

const SCAN_CTA: Record<'fr' | 'ar', string> = {
  fr: 'Scanner mes livraisons',
  ar: 'مسح توصيلاتي',
}

const RETURNS_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Retours à rendre',
  ar: 'مرتجعات للإرجاع',
}

const TO_DEPOSIT: Record<'fr' | 'ar', string> = {
  fr: 'À déposer (cash encaissé)',
  ar: 'للإيداع (النقد المُحصَّل)',
}

const TOTAL_BALANCE: Record<'fr' | 'ar', string> = {
  fr: 'Solde total',
  ar: 'الرصيد الإجمالي',
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

test.describe('Captures tableau de bord livreur — /courier', () => {
  for (const locale of LOCALES) {
    test(`captures ${locale} — dashboard mobile`, async ({ page, context }) => {
      // ── Langue via le cookie LOCALE (avant navigation) ────────────────────
      await context.addCookies([
        { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      await page.goto(`/courier?code=${ACCESS_CODE}`)
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const rootDir = await page.locator('html').getAttribute('dir')
      if (locale === 'ar') {
        expect(rootDir, 'AR doit rendre en RTL (html dir=rtl)').toBe('rtl')
      } else {
        expect(rootDir, `${locale} doit rendre en LTR (html dir=ltr)`).toBe('ltr')
      }

      // Nom du livreur + titre de page (header cloisonné, pas de header admin).
      const courierName = page.locator('p', { hasText: COURIER_NAME })
      await expect(courierName, `Nom du livreur "${COURIER_NAME}" visible (${locale})`).toBeVisible()

      const pageTitle = page.locator('p', { hasText: PAGE_TITLES[locale] })
      await expect(pageTitle, `Titre "${PAGE_TITLES[locale]}" visible (${locale})`).toBeVisible()

      // Cartes solde — à déposer + solde total (grand livre).
      const toDeposit = page.locator('p', { hasText: TO_DEPOSIT[locale] })
      await expect(toDeposit, `Carte "À déposer" visible (${locale})`).toBeVisible()

      const totalBalance = page.locator('p', { hasText: TOTAL_BALANCE[locale] })
      await expect(totalBalance, `Carte "Solde total" visible (${locale})`).toBeVisible()

      // Bouton « Scanner mes livraisons ».
      const scanCta = page.locator('a', { hasText: SCAN_CTA[locale] })
      await expect(scanCta, `Bouton scan visible (${locale})`).toBeVisible()

      // Liste des livraisons : au moins 1 carte avec nom client + ville + montant COD + bouton tél.
      const deliveryCards = page.locator('a[href^="tel:"]')
      await expect(deliveryCards.first(), `Au moins un bouton tél visible (${locale})`).toBeVisible()
      const telCount = await deliveryCards.count()
      expect(telCount, `Au moins 3 livraisons avec contact (${locale})`).toBeGreaterThanOrEqual(3)

      const customerName = page.locator('p', { hasText: 'Amina Alaoui' })
      await expect(customerName, `Nom client visible dans une carte livraison (${locale})`).toBeVisible()

      const customerCity = page.locator('p', { hasText: 'Casablanca' }).first()
      await expect(customerCity, `Ville client visible (${locale})`).toBeVisible()

      // Section retours.
      const returnsTitle = page.locator('h2', { hasText: RETURNS_TITLE[locale] })
      await expect(returnsTitle, `Section retours visible (${locale})`).toBeVisible()

      // Cloisonnement : aucune marge/coût/autre livreur affiché sur la page.
      const bodyText = await page.locator('body').innerText()
      expect(bodyText, `Aucune marge plateforme affichée (${locale})`).not.toMatch(/marge|margin/i)
      expect(bodyText, `Aucun coût usine affiché (${locale})`).not.toMatch(/coût usine|factory cost/i)

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `courier-dashboard-${locale}.png`),
        fullPage: true,
      })
    })
  }
})
