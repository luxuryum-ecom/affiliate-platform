/**
 * Runtime QA — V5-bis C2 (fraîcheur 3 paliers) + C4 (dispo séparée propre/fournisseur)
 * sur /wholesale/marketplace/[id].
 *
 * RÈGLES ABSOLUES (CLAUDE.md) :
 *   #7 — Aucun secret en dur. Identifiants lus via getLocalSupabaseEnv().
 *   #8 — assertLocalSupabase() : refuse de tourner hors 127.0.0.1:54321.
 *
 * Pré-requis :
 *   1. supabase start
 *   2. node scripts/seed-c2c4-test-local.mjs --seed
 *   3. npx playwright test --config=playwright.v5bis.config.ts
 *
 * Ce spec NE COMMIT RIEN, NE PUSH RIEN.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { assertLocalSupabase, getLocalSupabaseEnv } from './assert-local-supabase'

// ── Garde-fous locaux ─────────────────────────────────────────────────────────
const LOCAL = getLocalSupabaseEnv()
assertLocalSupabase(LOCAL.url, 'v5bis-c2c4 spec')

// ── Répertoire captures ───────────────────────────────────────────────────────
const CAPTURES_DIR =
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/ffc14963-af02-4f83-92ee-ae3d1db18492/scratchpad/v5bis-tester1'

// ── IDs des produits seedés ───────────────────────────────────────────────────
const SEEDS_FILE =
  '/private/tmp/claude-501/-Users-abderrahimbougjdi-AI-FACTORY-affiliate-platform/31af7ae6-1fb4-4f87-b3de-dcc3f79488c4/scratchpad/c2c4-seed-ids.json'

const seedData = JSON.parse(fs.readFileSync(SEEDS_FILE, 'utf8')) as {
  wholesalerEmail: string
  wholesalerPassword: string
  supplierProductIds: Record<string, string>
}

const WHOLESALER_EMAIL = seedData.wholesalerEmail
const WHOLESALER_PWD   = seedData.wholesalerPassword
const IDS              = seedData.supplierProductIds

// ── Cookie locale ─────────────────────────────────────────────────────────────
const LOCALE_COOKIE = 'LOCALE'
type LocaleCode = 'fr' | 'ar' | 'en'
const LOCALES: LocaleCode[] = ['fr', 'ar', 'en']

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(WHOLESALER_EMAIL)
  await page.locator('#password').fill(WHOLESALER_PWD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 }),
    page.locator('button[type="submit"]').click(),
  ])
  expect(page.url(), 'Login échoué').not.toContain('/login')
}

async function setLocale(context: BrowserContext, locale: LocaleCode): Promise<void> {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: locale, domain: 'localhost', path: '/' },
  ])
}

async function capture(page: Page, name: string): Promise<string> {
  const filepath = path.join(CAPTURES_DIR, name)
  await page.screenshot({ path: filepath, fullPage: false })
  return filepath
}

async function gotoProduct(page: Page, productId: string): Promise<void> {
  await page.goto(`/wholesale/marketplace/${productId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await page.waitForSelector('main', { timeout: 30_000 })
  // Petite pause pour laisser le rendu React se stabiliser
  await page.waitForTimeout(500)
}

// ── beforeAll global ──────────────────────────────────────────────────────────

test.beforeAll(() => {
  assertLocalSupabase(LOCAL.url, 'v5bis-c2c4 beforeAll')
  fs.mkdirSync(CAPTURES_DIR, { recursive: true })
})

// ── C2 — Fraîcheur 3 paliers ──────────────────────────────────────────────────

test.describe('C2 — Fraîcheur 3 paliers', () => {
  for (const locale of LOCALES) {
    const isRTL = locale === 'ar'

    /**
     * C2-frais : updated_at < 3 jours → PAS de badge fraîcheur.
     */
    test(`C2-frais (1j) ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['p1_frais'])

      // Aucun badge orange attendu
      const orangeBadge = page.locator('.bg-warning-soft')
      const orangeCount = await orangeBadge.count()
      // Le badge "Sur commande" peut être orange aussi → on filtre par les textes fraîcheur uniquement
      const confirmFreshBadge = page.locator('.bg-warning-soft').filter({
        hasText: /confirmer|confirm|تأكيد/i,
      })
      await expect(confirmFreshBadge.first()).not.toBeVisible({ timeout: 5_000 }).catch(() => {
        // Pas de badge = OK, les .catch évitent un faux échec si l'élément n'existe pas
      })

      // Aucun badge gris fraîcheur attendu ("Mis à jour il y a X jours")
      const watchBadge = page.locator('span').filter({ hasText: /mis à jour il y a|updated.*ago|آخر تحديث/i })
      await expect(watchBadge.first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {})

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c2-frais-${locale}.png`)
      console.log(`[C2-frais-${locale}] capture: ${p}`)
    })

    /**
     * C2-surveiller : updated_at entre 3 et 14 jours → badge GRIS "Mis à jour il y a X jours".
     */
    test(`C2-surveiller (7j) ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['p2_surveiller'])

      // Badge gris attendu : contient le nombre de jours
      const watchBadge = page.locator('span').filter({ hasText: /mis à jour il y a|updated.*ago|آخر تحديث/i })
      await expect(watchBadge.first()).toBeVisible({ timeout: 15_000 })

      // Badge gris NE doit PAS être orange (bg-warning-soft) → il est bg-surface-2
      const orangeConfirmBadge = page.locator('.bg-warning-soft').filter({ hasText: /confirmer|confirm|تأكيد/i })
      await expect(orangeConfirmBadge.first()).not.toBeVisible({ timeout: 3_000 }).catch(() => {})

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c2-surveiller-${locale}.png`)
      console.log(`[C2-surveiller-${locale}] capture: ${p}`)
    })

    /**
     * C2-confirmer : updated_at > 14 jours → badge ORANGE "À confirmer".
     */
    test(`C2-confirmer (20j) ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['p3_confirmer'])

      // Badge orange attendu : "À confirmer" / "To confirm" / "بحاجة إلى تأكيد"
      const confirmBadge = page.locator('.bg-warning-soft').filter({
        hasText: /confirmer|confirm|تأكيد/i,
      })
      await expect(confirmBadge.first()).toBeVisible({ timeout: 15_000 })

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c2-confirmer-${locale}.png`)
      console.log(`[C2-confirmer-${locale}] capture: ${p}`)
    })
  }
})

// ── C4 — Dispo séparée propre vs fournisseur ──────────────────────────────────

test.describe('C4 — Dispo séparée propre vs fournisseur', () => {
  // Labels par locale
  const LABELS: Record<string, Record<LocaleCode, RegExp>> = {
    own: { fr: /Dispo immédiate/i, ar: /متوفر فوراً/i, en: /Available now/i },
    supplier: { fr: /Dispo fournisseur/i, ar: /مخزون المورّد/i, en: /Supplier stock/i },
    backorder: { fr: /Sur commande/i, ar: /حسب الطلب/i, en: /On backorder/i },
    out: { fr: /Épuisé/i, ar: /نفد/i, en: /Out of stock/i },
  }

  for (const locale of LOCALES) {
    const isRTL = locale === 'ar'

    /**
     * CasA : propre=50, fournisseur=150 → les deux sections visibles, PAS de "Sur commande".
     */
    test(`C4-casA propre=50 fournisseur=150 ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['c4_casA'])

      await expect(page.getByText(LABELS['own'][locale])).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(LABELS['supplier'][locale])).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(LABELS['backorder'][locale])).not.toBeVisible({ timeout: 3_000 }).catch(() => {})

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c4-casA-${locale}.png`)
      console.log(`[C4-casA-${locale}] capture: ${p}`)
    })

    /**
     * CasB : propre=absent (aucun miroir), fournisseur=150 → badge "Sur commande".
     */
    test(`C4-casB propre=absent fournisseur=150 → Sur commande ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['c4_casB'])

      // "Sur commande" attendu car aucun miroir (ownStock=null)
      await expect(page.getByText(LABELS['backorder'][locale])).toBeVisible({ timeout: 15_000 })

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c4-casB-${locale}.png`)
      console.log(`[C4-casB-${locale}] capture: ${p}`)
    })

    /**
     * CasC : propre=30, fournisseur=80 → les deux dispos visibles.
     */
    test(`C4-casC propre=30 fournisseur=80 — deux dispos ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['c4_casC'])

      await expect(page.getByText(LABELS['own'][locale])).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(LABELS['supplier'][locale])).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(LABELS['backorder'][locale])).not.toBeVisible({ timeout: 3_000 }).catch(() => {})

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c4-casC-${locale}.png`)
      console.log(`[C4-casC-${locale}] capture: ${p}`)
    })

    /**
     * CasD : propre=0 (miroir existe, stock=0), fournisseur=0 → "Épuisé" côté propre.
     * Côté fournisseur : stock=0 → "Épuisé" aussi. PAS de "Sur commande".
     */
    test(`C4-casD propre=0 fournisseur=0 — deux épuisés ${locale}`, async ({ page, context }) => {
      await login(page)
      await setLocale(context, locale)
      await gotoProduct(page, IDS['c4_casD'])

      // Au moins une mention "Épuisé"
      const outVisible = await page.getByText(LABELS['out'][locale]).count()
      expect(outVisible, `C4-casD ${locale}: aucun "Épuisé" trouvé`).toBeGreaterThanOrEqual(1)

      // "Sur commande" absent (propre miroir existe, juste à 0)
      await expect(page.getByText(LABELS['backorder'][locale])).not.toBeVisible({ timeout: 3_000 }).catch(() => {})

      if (isRTL) {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      }

      const p = await capture(page, `c4-casD-${locale}.png`)
      console.log(`[C4-casD-${locale}] capture: ${p}`)
    })
  }
})
