/**
 * Captures réelles FR/AR des 2 écrans admin du module Livreurs Lot D :
 * `/admin/couriers/[id]` (sections Tournées + Retours, chaîne de garde) et
 * `/admin/couriers/pickup` (scan ramassage dépôt), sur données réalistes
 * seedées en LOCAL (scripts/seed-lotd-captures-local.mjs).
 *
 * RÈGLES :
 * - next dev forcé sur le Supabase LOCAL (playwright.lotd.config.ts, RÈGLE #8).
 * - Aucun secret réel en dur : mot de passe LOCAL jetable (lotdadmin-cap@test.local),
 *   même convention que e2e/couriers-captures.spec.ts.
 * - Langue changée via le cookie LOCALE (src/i18n/request.ts) — pas de préfixe /fr /ar.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const SCRATCHPAD = '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/5ad410bf-303d-4712-aca8-dcfffc8c4149/scratchpad'
const CAPTURES_DIR = path.join(SCRATCHPAD, 'lotd-captures')
const SEEDS_FILE = path.join(SCRATCHPAD, 'lotd-captures-seed-ids.json')

const ADMIN_EMAIL = 'lotdadmin-cap@test.local'
const ADMIN_PASSWORD = 'LotDCapture2026!'
const COURIER_NAME = 'Karim Transport'

const TOURS_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Tournées',
  ar: 'الجولات',
}
const RETURNS_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Retours',
  ar: 'المرتجعات',
}
const RETURN_STATE_DECLARED: Record<'fr' | 'ar', string> = {
  fr: 'En attente',
  ar: 'قيد الانتظار',
}
const RETURN_STATE_CONFIRMED: Record<'fr' | 'ar', string> = {
  fr: 'Confirmé',
  ar: 'مؤكَّد',
}
const RETURN_STATE_LOST: Record<'fr' | 'ar', string> = {
  fr: 'PERTE',
  ar: 'فقدان',
}
const TOUR_STATUS_DISPATCHED: Record<'fr' | 'ar', string> = {
  fr: 'En tournée',
  ar: 'قيد التوزيع',
}
const PICKUP_TITLE: Record<'fr' | 'ar', string> = {
  fr: 'Scan ramassage (sortie dépôt)',
  ar: 'مسح الاستلام (خروج من المستودع)',
}
const PICKUP_COURIER_LABEL: Record<'fr' | 'ar', string> = {
  fr: 'Livreur',
  ar: 'الموزّع',
}
const PICKUP_CUSTODY_NOTE: Record<'fr' | 'ar', string> = {
  fr: 'il devra le rendre livré',
  ar: 'عليه إعادته مُسلَّمًا',
}

const LOCALES: Array<'fr' | 'ar'> = ['fr', 'ar']

test.describe('Captures Lot D — tournées, retours, scan ramassage', () => {
  for (const locale of LOCALES) {
    test(`captures ${locale} — fiche livreur + pickup`, async ({ page, context }) => {
      const seeds = JSON.parse(readFileSync(SEEDS_FILE, 'utf8')) as { courierId: string }
      const courierId = seeds.courierId

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

      // ── Écran 1 : fiche livreur — Tournées + Retours ─────────────────────
      await page.goto(`/admin/couriers/${courierId}`)
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const rootDir = await page.locator('html').getAttribute('dir')
      if (locale === 'ar') {
        expect(rootDir, 'AR doit rendre en RTL (html dir=rtl)').toBe('rtl')
      } else {
        expect(rootDir, `${locale} doit rendre en LTR (html dir=ltr)`).toBe('ltr')
      }

      const detailTitle = page.locator('h1', { hasText: COURIER_NAME })
      await expect(detailTitle, `Titre fiche "${COURIER_NAME}" visible (${locale})`).toBeVisible()

      // Section Tournées : titre + statut "En tournée" (dispatched) + au moins
      // une ligne de tournée avec la date du jour.
      const toursSection = page.locator('h2', { hasText: TOURS_TITLE[locale] })
      await expect(toursSection, `Section Tournées visible (${locale})`).toBeVisible()

      const dispatchedBadge = page.locator('span', { hasText: TOUR_STATUS_DISPATCHED[locale] })
      await expect(dispatchedBadge.first(), `Badge tournée "En tournée" visible (${locale})`).toBeVisible()

      // Section Retours : titre + 3 badges d'état (déclaré/confirmé/perte).
      const returnsSection = page.locator('h2', { hasText: new RegExp(`^${RETURNS_TITLE[locale]}$`) })
      await expect(returnsSection, `Section Retours visible (${locale})`).toBeVisible()

      const declaredBadge = page.locator('span', { hasText: RETURN_STATE_DECLARED[locale] })
      await expect(declaredBadge.first(), `Badge retour "En attente" visible (${locale})`).toBeVisible()

      const confirmedBadge = page.locator('span', { hasText: RETURN_STATE_CONFIRMED[locale] })
      await expect(confirmedBadge.first(), `Badge retour "Confirmé" visible (${locale})`).toBeVisible()

      const lostBadge = page.locator('span', { hasText: RETURN_STATE_LOST[locale] })
      await expect(lostBadge.first(), `Badge retour "PERTE" visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `courier-detail-${locale}.png`),
        fullPage: true,
      })

      // ── Écran 2 : scan ramassage dépôt ────────────────────────────────────
      await page.goto('/admin/couriers/pickup')
      await page.waitForLoadState('networkidle', { timeout: 20_000 })

      const pickupTitle = page.locator('h1', { hasText: PICKUP_TITLE[locale] })
      await expect(pickupTitle, `Titre "${PICKUP_TITLE[locale]}" visible (${locale})`).toBeVisible()

      const courierSelect = page.locator('#depot-pickup-courier')
      await expect(courierSelect, `Sélecteur livreur visible (${locale})`).toBeVisible()

      const courierLabel = page.locator('label', { hasText: PICKUP_COURIER_LABEL[locale] }).first()
      await expect(courierLabel, `Libellé "Livreur" visible (${locale})`).toBeVisible()

      const custodyNote = page.locator('p', { hasText: PICKUP_CUSTODY_NOTE[locale] })
      await expect(custodyNote, `Note chaîne de garde visible (${locale})`).toBeVisible()

      await page.screenshot({
        path: path.join(CAPTURES_DIR, `pickup-${locale}.png`),
        fullPage: true,
      })
    })
  }
})
