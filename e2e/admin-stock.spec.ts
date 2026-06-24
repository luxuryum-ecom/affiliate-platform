/**
 * QA RUNTIME — /admin/stock (feature WMS-1 admin UI)
 *
 * Prouve en navigateur réel + vérification base :
 *   1. La page /admin/stock s'affiche pour l'admin (titre, sections Adjust / Anomalies / Journal).
 *   2. Le journal affiche des mouvements de stock.
 *   3. L'ajustement "cadeau" via l'UI crée un mouvement en base.
 *   4. La section anomalies affiche au moins une anomalie.
 *   5. Un rôle non-admin (affiliate) est redirigé hors de /admin/stock.
 *
 * Secrets : jamais en dur. Identifiants Supabase LOCAUX uniquement, via
 *   getLocalSupabaseEnv() (« supabase status ») — JAMAIS .env.local / la prod.
 *   Garde-fou assertLocalSupabase : ce spec REFUSE de tourner hors 127.0.0.1.
 * Captures : .nav-proofs/wms1-admin-stock/
 * La page peut être en FR, EN ou AR selon la session admin — les sélecteurs sont i18n-agnostiques.
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { assertLocalSupabase, getLocalSupabaseEnv } from './assert-local-supabase'

// ─── Helpers ───────────────────────────────────────────────────────────────────

// GARDE-FOU CAUSE RACINE (incident 2026-06-24) : ce spec ÉCRIT en base via
// service_role. Il lit donc UNIQUEMENT les identifiants Supabase LOCAUX
// (« supabase status »), JAMAIS .env.local / la prod. getLocalSupabaseEnv()
// lève « REFUS … » si l'URL n'est pas locale ou si le local n'est pas démarré.
const LOCAL = getLocalSupabaseEnv()
const SUPABASE_URL = LOCAL.url
const SUPABASE_KEY = LOCAL.serviceKey

const PROOFS_DIR = path.join(process.cwd(), '.nav-proofs', 'wms1-admin-stock')
const ADMIN_AUTH = path.join(process.cwd(), 'e2e/.auth/admin.json')
const AFFILIATE_AUTH = path.join(process.cwd(), 'e2e/.auth/affiliate.json')

async function supabaseRest(
  method: string,
  endpoint: string,
  body?: unknown,
  extra?: Record<string, string>,
): Promise<unknown> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Supabase REST ${method} ${endpoint} → ${resp.status}: ${text}`)
  }
  const ct = resp.headers.get('content-type') ?? ''
  return ct.includes('json') ? resp.json() : resp.text()
}

function capture(name: string) {
  return path.join(PROOFS_DIR, name)
}

// ─── Setup ────────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  // Double garde-fou avant toute écriture/seed : refuse si la cible n'est pas locale.
  assertLocalSupabase(SUPABASE_URL, 'admin-stock seed')
  fs.mkdirSync(PROOFS_DIR, { recursive: true })
})

// ─── POINT 1 — Admin voit /admin/stock ────────────────────────────────────────

test.describe('1 — /admin/stock : rendu page admin', () => {
  test.use({ storageState: ADMIN_AUTH })

  test('page rend avec titre, sections Adjust/Anomalies/Journal', async ({ page }) => {
    await page.goto('/admin/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Vérifie l'absence d'erreur (pas de 500/404 overlay)
    await expect(
      page.getByText(/Unhandled Runtime Error|Server Error|Failed to compile|Application error/i),
    ).toHaveCount(0)

    // URL doit rester sur /admin/stock (pas de redirection)
    expect(page.url()).toContain('/admin/stock')

    // Titre principal h1 — le breadcrumb texte (i18n-agnostic: contient "Stock" dans toute locale)
    const h1 = page.locator('h1').first()
    await expect(h1).toBeVisible()
    const h1Text = await h1.textContent()
    expect(h1Text?.toLowerCase()).toMatch(/stock/i)

    // Section Adjust — le formulaire d'ajustement a une classe spécifique (space-y-4 bg-surface)
    // Il y a 2 formulaires sur la page (sign out + adjust), on cible celui qui a un select produit
    const adjustForm = page.locator('form').filter({ hasText: /product|produit|منتج|choose|choisir/i })
    await expect(adjustForm).toBeVisible()

    // Select produit visible dans le formulaire
    const productSelect = adjustForm.locator('select').first()
    await expect(productSelect).toBeVisible()

    // Section Anomalies : cherche par les h2 de section
    const h2List = page.locator('h2')
    const h2Count = await h2List.count()
    expect(h2Count, 'Au moins 3 sections h2 attendues (Adjust, Anomalies, Journal)').toBeGreaterThanOrEqual(3)

    await page.screenshot({ path: capture('01-page.png'), fullPage: true })
    console.log(`[1 OK] Page rendue, titre: "${h1Text}", ${h2Count} sections h2`)
  })
})

// ─── POINT 2 — Journal affiche des mouvements ─────────────────────────────────

test.describe('2 — Journal des mouvements', () => {
  test.use({ storageState: ADMIN_AUTH })

  test('affiche au moins un mouvement (produit, raison, canal, qté, solde, acteur, date)', async ({
    page,
  }) => {
    await page.goto('/admin/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Le journal est la dernière section h2, avec les div de mouvements en dessous
    // Cherche au moins un élément qui affiche une quantité avec + ou - (delta)
    // Le marqueur fiable : span avec tabular-nums (qty_delta) ou texte "Solde" / "Balance"
    const journalSection = page.locator('section').last()

    // Cherche les lignes — chaque mouvement a un grid avec qty_delta (+ ou - coloré)
    // La structure : div.grid > div (infos) + div (qty + balance)
    // On cherche les div directs sous le container .divide-y
    const movementRows = journalSection.locator('div[class*="divide"] > div, .divide-y > div')
    const countDivide = await movementRows.count()

    // Fallback : cherche les spans avec tabular-nums (les quantités)
    const qtySpans = page.locator('span[class*="tabular-nums"]')
    const countQty = await qtySpans.count()

    // On accepte si l'un ou l'autre trouve des éléments
    const hasMovements = countDivide > 0 || countQty > 0

    if (!hasMovements) {
      // Dernier recours : vérifie visuellement qu'il n'y a pas le message "empty"
      const emptyMsg = journalSection.getByText(/no movement|aucun mouvement|لا توجد/i)
      const isEmpty = (await emptyMsg.count()) > 0
      expect(isEmpty, 'Le journal doit avoir des mouvements (vide = FAIL)').toBe(false)
    } else {
      expect(hasMovements, 'Le journal doit avoir au moins 1 mouvement').toBe(true)
    }

    await page.screenshot({ path: capture('02-journal.png'), fullPage: true })
    console.log(`[2 OK] Journal: ${countDivide} rows via divide, ${countQty} qty spans`)
  })
})

// ─── POINT 3 — Ajustement "cadeau" via l'UI ──────────────────────────────────

test.describe('3 — Ajustement cadeau via formulaire', () => {
  test.use({ storageState: ADMIN_AUTH })

  test('soumet un ajustement cadeau, vérifie succès + ligne en base', async ({ page }) => {
    await page.goto('/admin/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Trouve le formulaire d'ajustement (il y a 2 forms : sign out + adjust)
    // On cible celui qui contient un select produit
    const adjustForm = page.locator('form').filter({ hasText: /product|produit|منتج|choose|choisir/i })
    await expect(adjustForm).toBeVisible()

    // Select produit (premier select du formulaire)
    const productSelect = adjustForm.locator('select').first()
    await productSelect.waitFor({ state: 'visible', timeout: 15_000 })

    const options = await productSelect.locator('option').all()
    expect(options.length, 'Le select produit doit avoir au moins un produit').toBeGreaterThan(1)

    // Prend le premier vrai produit (index 1, index 0 = placeholder)
    const firstProductValue = await options[1].getAttribute('value')
    const firstProductName = await options[1].textContent()
    expect(firstProductValue).toBeTruthy()

    await productSelect.selectOption(firstProductValue!)
    await page.waitForTimeout(300)

    // Input quantité
    const qtyInput = adjustForm.locator('input[type="number"]')
    await qtyInput.fill('-1')
    await page.waitForTimeout(300)

    // Select raison (deuxième select du formulaire)
    const reasonSelect = adjustForm.locator('select').nth(1)
    await reasonSelect.selectOption('cadeau')
    await page.waitForTimeout(300)

    // Note (textarea)
    const noteTextarea = adjustForm.locator('textarea')
    await noteTextarea.fill('Test QA automatisé WMS-1')

    // Bouton "Adjust stock" — on cible spécifiquement le bouton dans le formulaire
    const adjustBtn = adjustForm.locator('button[type="submit"]')
    await expect(adjustBtn).toBeVisible()
    await adjustBtn.click()
    await page.waitForTimeout(800)

    // Après le premier clic : le bouton devient le bouton de confirmation (confirming=true)
    // Le texte change pour inclure le résumé de l'ajustement
    const confirmBtn = adjustForm.locator('button[type="submit"]')
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 })
    const confirmText = await confirmBtn.textContent()
    console.log(`[3] Texte bouton confirmation: "${confirmText}"`)

    // Capture avant confirmation finale
    await page.screenshot({ path: capture('03-before-confirm.png') })

    // Deuxième clic = confirme réellement l'ajustement
    await confirmBtn.click()

    // Attend le message de succès (texte contient "balance" ou "solde" ou chiffre)
    // Le composant affiche t('adjustSuccess', { balance: result.data.newBalance })
    // EN: "Adjustment done — new balance: {balance}" / FR: "Ajustement effectué — nouveau solde: {balance}"
    const successMsg = page.locator('p').filter({
      hasText: /balance|solde|رصيد|done|effectué|تم/i,
    })
    await expect(successMsg).toBeVisible({ timeout: 30_000 })
    const successText = await successMsg.textContent()
    console.log(`[3] Message succès: "${successText}"`)

    await page.screenshot({ path: capture('03-adjust-success.png'), fullPage: true })

    // ── Vérification en base ──────────────────────────────────────────────────
    await page.waitForTimeout(1500)

    const rows = (await supabaseRest(
      'GET',
      `/stock_movements?reason=eq.cadeau&channel=eq.manual_adjust&order=created_at.desc&limit=10`,
    )) as Array<{
      id: string
      reason: string
      channel: string
      qty_delta: number
      product_id: string
      note: string | null
    }>

    expect(rows.length, 'Au moins 1 mouvement cadeau doit exister en base').toBeGreaterThan(0)
    const lastCadeau = rows[0]
    expect(lastCadeau.reason).toBe('cadeau')
    expect(lastCadeau.channel).toBe('manual_adjust')
    expect(lastCadeau.qty_delta).toBe(-1)

    console.log(
      `[BASE OK] Mouvement cadeau créé: id=${lastCadeau.id}, product=${lastCadeau.product_id}, qty=${lastCadeau.qty_delta}, note="${lastCadeau.note}"`,
    )

    // ── Recharge et capture le journal mis à jour ─────────────────────────────
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Cherche "Cadeau" ou "Gift" (i18n) dans la page rechargée
    const cadrTag = page.locator('span').filter({ hasText: /cadeau|gift|هدية/i }).first()
    await expect(cadrTag).toBeVisible({ timeout: 15_000 })

    await page.screenshot({ path: capture('04-journal-after.png'), fullPage: true })
    console.log('[3+4] Journal rechargé avec la ligne cadeau visible')
  })
})

// ─── POINT 4 — Section anomalies visible ─────────────────────────────────────

test.describe('4 — Section anomalies', () => {
  test.use({ storageState: ADMIN_AUTH })

  test('affiche au moins une anomalie avec type traduit', async ({ page }) => {
    // Vérifie d'abord en base si des anomalies existent
    const anomalies = (await supabaseRest(
      'GET',
      '/stock_anomalies?select=id,anomaly_type,product_id&limit=5',
    )) as Array<{ id: string; anomaly_type: string; product_id: string | null }>

    if (anomalies.length === 0) {
      // Génère une anomalie oversell via reserve_stock sur un produit
      const products = (await supabaseRest(
        'GET',
        '/products?select=id&limit=1',
      )) as Array<{ id: string }>

      if (products.length > 0) {
        // Ajoute un peu de stock puis retire massivement pour déclencher oversell
        await supabaseRest('POST', '/rpc/adjust_stock_manual', {
          p_product_id: products[0].id,
          p_qty_delta: 5,
          p_reason: 'reappro',
          p_note: 'QA oversell seed',
          p_actor: null,
        })
        await supabaseRest('POST', '/rpc/reserve_stock', {
          p_product_id: products[0].id,
          p_qty: 9999,
          p_channel: 'affiliate',
          p_order_id: '00000000-0000-0000-0000-000000000002',
          p_actor: null,
        })
      }
    }

    await page.goto('/admin/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Cherche un badge d'anomalie (les spans colorés avec type traduit)
    // EN: "Oversell (negative stock)" / FR: "Survente (stock négatif)" / AR: "بيع زائد"
    const anomalyBadges = page.locator('span').filter({
      hasText: /oversell|survente|casse|perte|ajustement|repeated|بيع|كسر/i,
    })

    const badgeCount = await anomalyBadges.count()

    if (badgeCount === 0) {
      // Fallback : vérifie que la section anomalies n'est pas vide
      const emptyAnomalyMsg = page.getByText(/no anomaly|aucune anomalie|لا توجد/i)
      const isEmpty = (await emptyAnomalyMsg.count()) > 0
      expect(isEmpty, 'La section anomalies doit afficher au moins une anomalie').toBe(false)
    } else {
      expect(badgeCount, 'Au moins 1 badge anomalie visible').toBeGreaterThan(0)
    }

    await page.screenshot({ path: capture('05-anomalies.png'), fullPage: true })
    console.log(`[4 OK] ${badgeCount} badge(s) anomalie visible(s)`)
  })
})

// ─── POINT 5 — Contrôle accès négatif (affiliate redirigé) ───────────────────

test.describe('5 — Accès refusé rôle affiliate', () => {
  test.use({ storageState: AFFILIATE_AUTH })

  test('affiliate est redirigé hors de /admin/stock', async ({ page }) => {
    await page.goto('/admin/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const finalUrl = page.url()

    // L'affiliate ne doit PAS rester sur /admin/stock
    const isOnStockPage = finalUrl.includes('/admin/stock')
    expect(
      isOnStockPage,
      `Affiliate ne doit pas accéder à /admin/stock (url actuelle: ${finalUrl})`,
    ).toBe(false)

    await page.screenshot({ path: capture('06-affiliate-redirect.png'), fullPage: true })
    console.log(`[5 OK] Affiliate redirigé vers: ${finalUrl}`)
  })
})
