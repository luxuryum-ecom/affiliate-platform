/**
 * Captures réelles du Lot E (notifications, module Livreurs) :
 * `/courier?code=...` (dashboard livreur mobile, sections « Mes retours » et
 * « Versements enregistrés ») en FR/AR, et la cloche admin `/admin/dashboard`
 * (event courier_return_declared), sur données réalistes seedées en LOCAL
 * (scripts/seed-lote-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.lote.config.ts, RÈGLE #8).
 * - Aucun secret réel en dur : mot de passe LOCAL jetable (loteadmin-cap@test.local),
 *   même convention que e2e/lotd-captures.spec.ts.
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 * - RÈGLE CAPTURES : /courier/* = mobile 390×844 (projet lote-mobile-courier, tag
 *   @mobile) ; admin = desktop (projet lote-desktop-admin, tag @desktop).
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const SCRATCHPAD = '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'
const CAPTURES_DIR = path.join(SCRATCHPAD, 'lote-captures')
const SEEDS_FILE = path.join(SCRATCHPAD, 'lote-captures-seed-ids.json')

const ADMIN_EMAIL = 'loteadmin-cap@test.local'
const ADMIN_PASSWORD = 'LotECapture2026!'
const ACCESS_CODE = 'LOTEDEMO12345678'

const MY_RETURNS_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Mes retours',
  ar: 'مرتجعاتي',
}
const RETURN_STATE_DECLARED: Record<'fr' | 'ar', string> = {
  fr: 'En attente',
  ar: 'بانتظار',
}
const RETURN_STATE_CONFIRMED: Record<'fr' | 'ar', string> = {
  fr: 'Confirmé',
  ar: 'مؤكَّد',
}
const REMITTANCES_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Versements enregistrés',
  ar: 'الدفعات المسجّلة',
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

test.describe('Captures Lot E — dashboard livreur mobile (Mes retours + Versements)', () => {
  for (const locale of LOCALES) {
    test(`@mobile courier dashboard ${locale} — retours + versements`, async ({ page, context }) => {
      // Cookie de langue AVANT navigation.
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

      // Section « Mes retours » : titre + badges En attente / Confirmé.
      const myReturnsSection = page.locator('h2', { hasText: MY_RETURNS_TITLE[locale] })
      await expect(myReturnsSection, `Section "Mes retours" visible (${locale})`).toBeVisible()

      const declaredBadge = page.locator('span', { hasText: RETURN_STATE_DECLARED[locale] })
      await expect(declaredBadge.first(), `Badge retour "En attente" visible (${locale})`).toBeVisible()

      const confirmedBadge = page.locator('span', { hasText: RETURN_STATE_CONFIRMED[locale] })
      await expect(confirmedBadge.first(), `Badge retour "Confirmé" visible (${locale})`).toBeVisible()

      // Section « Versements enregistrés » : titre + ✓ montant.
      const remittancesSection = page.locator('h2', { hasText: REMITTANCES_TITLE[locale] })
      await expect(remittancesSection, `Section "Versements enregistrés" visible (${locale})`).toBeVisible()

      const remittanceAmount = page.locator('span', { hasText: '✓' })
      await expect(remittanceAmount.first(), `Montant versement "✓ ..." visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `courier-dashboard-${locale}.png`),
        fullPage: true,
      })
    })
  }
})

test.describe('Captures Lot E — cloche admin (notification livreur)', () => {
  test('@desktop admin cloche — notif courier_return_declared visible', async ({ page, context }) => {
    const seeds = JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) as { courierId: string }

    await context.addCookies([
      { name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' },
    ])

    // ── Connexion admin via l'UI ──────────────────────────────────────────
    await page.goto('/login')
    await page.locator('#email').fill(ADMIN_EMAIL)
    await page.locator('#password').fill(ADMIN_PASSWORD)
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      page.locator('button[type="submit"]').click(),
    ])
    expect(page.url(), 'Doit être redirigé hors /login après connexion').not.toContain('/login')

    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    // Badge compteur non lu visible (au moins 1 notif livreur en attente).
    const bellButton = page.getByRole('button', { name: /notification/i })
    await expect(bellButton, 'Bouton cloche visible').toBeVisible()

    const unreadBadge = bellButton.locator('span').filter({ hasText: /^\d+\+?$/ })
    await expect(unreadBadge.first(), 'Badge compteur non-lu visible sur la cloche').toBeVisible()

    // Ouvre le dropdown et vérifie qu'au moins une notif livreur (courier_id de
    // notre seed) apparaît dans la liste. Le rendu texte de l'event
    // L'event courier_return_declared est désormais rendu i18n (branche courier_*
    // dans notifications.ts) : titre « 🚨 Retour déclaré » + corps « nom · réf · montant ».
    await bellButton.click()
    const dropdown = page.locator('ul.divide-y')
    await expect(dropdown, 'Dropdown notifications ouvert').toBeVisible({ timeout: 10_000 })

    const courierNotifItem = page.locator('li', { hasText: 'Retour déclaré' })
    await expect(courierNotifItem.first(), 'Notif livreur rendue (titre traduit « Retour déclaré ») visible dans la cloche').toBeVisible()

    await page.screenshot({
      path: path.join(CAPTURES_DIR, 'admin-cloche-fr.png'),
      fullPage: true,
    })
  })
})
