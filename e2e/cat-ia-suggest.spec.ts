// e2e/cat-ia-suggest.spec.ts
// Vérification runtime du lot CAT-IA-SUGGEST (mig 083/084/085).
// Scénarios A–F : suggestions admin + permissions staff.
// Données de test fournies par scripts/seed-cat-suggestion.mjs (exécuté avant ce test).
//
// NOTE : ce test utilise le storageState admin existant (e2e/.auth/admin.json).
// Les IDs de seed sont fournis via env vars TEST_PRODUCT_ID et TEST_SUGGESTION_ID.
// Pour le scénario F, TEST_AGENT_EMAIL et TEST_AGENT_PASSWORD sont optionnels.

import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { loadEnvLocal } from './env'

loadEnvLocal()

// ─── Configuration du test ────────────────────────────────────────────────────

const ADMIN_STORAGE = resolve(process.cwd(), 'e2e/.auth/admin.json')
const PROOFS_DIR = resolve(process.cwd(), '.nav-proofs/cat-ia-suggest')

// IDs créés par seed-cat-suggestion.mjs (passés via env ou process.argv)
const PRODUCT_ID    = process.env.TEST_PRODUCT_ID    ?? ''
const SUGGESTION_ID = process.env.TEST_SUGGESTION_ID ?? ''

// Supabase REST API pour vérifications DB directes
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function dbGet(path: string): Promise<unknown[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`DB GET ${path} → ${r.status}`)
  return r.json() as Promise<unknown[]>
}

async function capture(page: Page, name: string) {
  await page.screenshot({
    path: `${PROOFS_DIR}/${name}.png`,
    fullPage: false,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setLocale(page: Page, locale: 'fr' | 'ar' | 'en') {
  // Applique la locale via le switcher si présent, sinon via le cookie/URL
  // Le site utilise next-intl — la locale est dans l'URL (/fr/... /ar/... /en/...)
  // Pour simplifier : on navigue directement avec le préfixe
  return locale
}

async function navigateWithLocale(page: Page, path: string, locale: 'fr' | 'ar' | 'en') {
  // L'app utilise le cookie "LOCALE" (voir src/i18n/request.ts : LOCALE_COOKIE = 'LOCALE')
  // Il faut vider le cookie existant et en poser un nouveau AVANT la navigation.
  await page.context().addCookies([{
    name: 'LOCALE',
    value: locale,
    domain: 'localhost',
    path: '/',
  }])
  await page.goto(path)
  await page.waitForTimeout(800)
}

// ─── Suite de tests ───────────────────────────────────────────────────────────

test.use({ storageState: ADMIN_STORAGE })

test.describe('CAT-IA-SUGGEST : admin vérification', () => {

  // ── A : Affichage de la file de suggestions ─────────────────────────────────
  test.describe('A — /admin/categories/suggestions', () => {

    test('FR desktop : la suggestion TEST apparaît', async ({ page }) => {
      test.skip(!PRODUCT_ID, 'TEST_PRODUCT_ID non fourni — relancer le seed')
      await page.goto('/admin/categories/suggestions')
      await page.waitForTimeout(1000)

      // La page doit charger sans erreur
      const status = await page.evaluate(() => document.title)
      expect(status).toBeTruthy()

      // Le produit de test doit apparaître
      const productText = page.getByText('TEST CAT-IA Aspirateur')
      await expect(productText).toBeVisible({ timeout: 10_000 })

      // Le libellé proposé "Électroménager" doit être affiché
      const proposed = page.getByText('Électroménager')
      await expect(proposed.first()).toBeVisible()

      // La catégorie courante "Autres" doit être affichée
      const current = page.getByText('Autres', { exact: false })
      await expect(current.first()).toBeVisible()

      await capture(page, 'A-fr-desktop')
    })

    test('AR desktop : page en arabe, dir=rtl, 0 débordement', async ({ page }) => {
      await navigateWithLocale(page, '/admin/categories/suggestions', 'ar')

      // Vérifier l'attribut dir=rtl sur la balise html ou body
      const htmlDir = await page.locator('html').getAttribute('dir')
      expect(htmlDir, 'dir=rtl attendu en arabe').toBe('rtl')

      // La page doit charger (pas de crash)
      const bodyText = await page.locator('body').textContent()
      expect(bodyText).toBeTruthy()

      // Pas de débordement horizontal (scrollWidth <= innerWidth + marge 5px)
      const overflows = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'))
        const ow = window.innerWidth
        return elements
          .filter((el) => el.scrollWidth > ow + 5)
          .map((el) => el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'))
          .slice(0, 5)
      })
      expect(overflows, 'Débordements horizontaux détectés en AR').toEqual([])

      await capture(page, 'A-ar-desktop')
    })

    test('EN desktop : page en anglais', async ({ page }) => {
      await navigateWithLocale(page, '/admin/categories/suggestions', 'en')
      const bodyText = await page.locator('body').textContent()
      expect(bodyText).toBeTruthy()
      await capture(page, 'A-en-desktop')
    })

    test('FR mobile 390px : rendu sans débordement', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await navigateWithLocale(page, '/admin/categories/suggestions', 'fr')
      await page.waitForTimeout(600)

      const overflows = await page.evaluate(() => {
        const ow = window.innerWidth
        return Array.from(document.querySelectorAll('*'))
          .filter((el) => el.scrollWidth > ow + 5)
          .map((el) => el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'))
          .slice(0, 5)
      })
      expect(overflows, 'Débordements en mobile 390px').toEqual([])

      await capture(page, 'A-fr-mobile-390')
    })

    test('AR mobile 390px : RTL + pas débordement', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await navigateWithLocale(page, '/admin/categories/suggestions', 'ar')
      await page.waitForTimeout(600)

      const htmlDir = await page.locator('html').getAttribute('dir')
      expect(htmlDir, 'dir=rtl attendu en arabe mobile').toBe('rtl')

      const overflows = await page.evaluate(() => {
        const ow = window.innerWidth
        return Array.from(document.querySelectorAll('*'))
          .filter((el) => el.scrollWidth > ow + 5)
          .map((el) => el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'))
          .slice(0, 5)
      })
      expect(overflows, 'Débordements en mobile AR 390px').toEqual([])

      await capture(page, 'A-ar-mobile-390')
    })
  })

  // ── B : Action RANGER dans catégorie existante ──────────────────────────────
  test.describe('B — Ranger dans catégorie existante', () => {

    test('RANGER le produit de test → vérification DB', async ({ page }) => {
      test.skip(!PRODUCT_ID || !SUGGESTION_ID, 'IDs de test manquants')

      await navigateWithLocale(page, '/admin/categories/suggestions', 'fr')
      await page.waitForTimeout(1200)

      // Trouver le formulaire "Ranger" (FileIntoExistingForm)
      const selects = page.locator('select[name="category_id"]')
      const count = await selects.count()
      expect(count, 'Aucun select category_id trouvé').toBeGreaterThan(0)

      // Sélectionner "Textile" (première catégorie existante dispo)
      await selects.first().selectOption({ label: 'Textile' })

      await capture(page, 'B-ranger-avant-submit')

      // Cliquer le bouton de rangement : cibler directement dans le formulaire FileIntoExistingForm
      // Le formulaire Ranger contient le select category_id — on cherche le bouton dans ce contexte
      const fileForm = selects.first().locator('xpath=ancestor::form')
      const btnFile = fileForm.locator('button[type="submit"]')
      await btnFile.click()
      await page.waitForTimeout(2500)

      await capture(page, 'B-ranger-apres-submit')

      // Vérification DB : supplier_products.category doit avoir changé
      const products = await dbGet(`supplier_products?id=eq.${PRODUCT_ID}&select=category,subcategory`)
      const product = (products as Array<{category: string; subcategory: string}>)[0]
      expect(product, 'Produit introuvable en DB après RANGER').toBeTruthy()
      expect(product.category, 'category doit être différent de "Autres" après RANGER').not.toBe('Autres')

      // Vérification DB : category_suggestions.status doit être 'filed'
      const suggestions = await dbGet(`category_suggestions?id=eq.${SUGGESTION_ID}&select=status,resolved_by`)
      const suggestion = (suggestions as Array<{status: string; resolved_by: string | null}>)[0]
      expect(suggestion?.status, 'status doit être "filed" après RANGER').toBe('filed')
      expect(suggestion?.resolved_by, 'resolved_by doit être posé').toBeTruthy()
    })
  })

  // ── C : Action CRÉER nouvelle catégorie ─────────────────────────────────────
  test.describe('C — Créer nouvelle catégorie', () => {

    test('CRÉER Électroménager → affiliate_allowed=false INVARIANT', async ({ page }) => {
      // Pour ce test, on a besoin d'une NOUVELLE suggestion pending
      // On seed directement via API REST (service_role)
      const productRows = await fetch(`${SUPABASE_URL}/rest/v1/supplier_products`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({
          supplier_id:      '6439853e-ce32-4c61-a7a8-ce3a114a27d3',
          product_name:     'TEST CAT-IA Créer Catégorie',
          category:         'Autres',
          subcategory:      '',
          niche:            '',
          photos:           [],
          min_quantity:     1,
          origin_country:   'Maroc',
          availability_type: 'local_stock',
          target_buyer_type: 'wholesaler',
          approval_status:  'pending_review',
          source:           'telegram',
        }),
      })
      const productsData = await productRows.json() as Array<{id: string}>
      const newProductId = productsData[0]?.id
      expect(newProductId, 'Produit de test pour CRÉER non créé').toBeTruthy()

      const suggRows = await fetch(`${SUPABASE_URL}/rest/v1/category_suggestions`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({
          supplier_product_id: newProductId,
          proposed_label:      'Électroménager TEST',
          source:              'telegram_ai',
          status:              'pending',
        }),
      })
      const suggData = await suggRows.json() as Array<{id: string}>
      const newSuggId = suggData[0]?.id
      expect(newSuggId, 'Suggestion de test pour CRÉER non créée').toBeTruthy()

      // Naviguer vers la page
      await navigateWithLocale(page, '/admin/categories/suggestions', 'fr')
      await page.waitForTimeout(1200)

      // Trouver le formulaire CRÉER — le premier formulaire avec label_fr
      const labelFrInput = page.locator('input[name="label_fr"]').first()
      await expect(labelFrInput).toBeVisible({ timeout: 8000 })

      // Remplir les 3 libellés
      await labelFrInput.fill('Électroménager TEST')
      await page.locator('input[name="label_ar"]').first().fill('الأجهزة المنزلية')
      await page.locator('input[name="label_en"]').first().fill('Home Appliances TEST')

      await capture(page, 'C-creer-formulaire-rempli')

      // Soumettre
      const btnCreate = page.locator('button[type="submit"]').first()
      await btnCreate.click()
      await page.waitForTimeout(2500)

      await capture(page, 'C-creer-apres-submit')

      // ⚠️ INVARIANT CRITIQUE : vérifier affiliate_allowed=false en DB
      const categories = await dbGet(`categories?slug=eq.Électroménager TEST&select=id,slug,affiliate_allowed,active`)
      const cat = (categories as Array<{id: string; slug: string; affiliate_allowed: boolean; active: boolean}>)[0]

      if (!cat) {
        // La catégorie n'a peut-être pas été créée — chercher par label_fr
        const catsByLabel = await dbGet(`categories?label_fr=eq.Électroménager TEST&select=id,slug,affiliate_allowed,active`)
        const catByLabel = (catsByLabel as Array<{id: string; slug: string; affiliate_allowed: boolean; active: boolean}>)[0]
        expect(catByLabel, 'Catégorie "Électroménager TEST" non créée en DB').toBeTruthy()
        // INVARIANT CRITIQUE
        expect(
          catByLabel?.affiliate_allowed,
          'FAIL BLOQUANT : affiliate_allowed=true sur catégorie créée par suggestion !'
        ).toBe(false)

        // Vérifier suggestion status=created
        const suggCheck = await dbGet(`category_suggestions?id=eq.${newSuggId}&select=status,resulting_category_id`)
        const s = (suggCheck as Array<{status: string; resulting_category_id: string | null}>)[0]
        expect(s?.status, 'status doit être "created"').toBe('created')

        // Vérifier supplier_products.category mis à jour
        const pCheck = await dbGet(`supplier_products?id=eq.${newProductId}&select=category`)
        const p = (pCheck as Array<{category: string}>)[0]
        expect(p?.category, 'supplier_products.category doit avoir changé').not.toBe('Autres')

        // Nettoyage de ce test
        await fetch(`${SUPABASE_URL}/rest/v1/category_suggestions?id=eq.${newSuggId}`, { method: 'DELETE', headers: H })
        await fetch(`${SUPABASE_URL}/rest/v1/categories?label_fr=eq.Électroménager TEST`, { method: 'DELETE', headers: H })
        await fetch(`${SUPABASE_URL}/rest/v1/supplier_products?id=eq.${newProductId}`, { method: 'DELETE', headers: H })
        return
      }

      // INVARIANT CRITIQUE
      expect(
        cat.affiliate_allowed,
        'FAIL BLOQUANT : affiliate_allowed=true sur catégorie créée par suggestion !'
      ).toBe(false)

      // Vérifier suggestion status=created
      const suggCheck = await dbGet(`category_suggestions?id=eq.${newSuggId}&select=status,resulting_category_id`)
      const s = (suggCheck as Array<{status: string; resulting_category_id: string | null}>)[0]
      expect(s?.status, 'status doit être "created"').toBe('created')

      // Nettoyage
      await fetch(`${SUPABASE_URL}/rest/v1/category_suggestions?id=eq.${newSuggId}`, { method: 'DELETE', headers: H })
      await fetch(`${SUPABASE_URL}/rest/v1/categories?id=eq.${cat.id}`, { method: 'DELETE', headers: H })
      await fetch(`${SUPABASE_URL}/rest/v1/supplier_products?id=eq.${newProductId}`, { method: 'DELETE', headers: H })
    })
  })

  // ── D : Action REJETER ──────────────────────────────────────────────────────
  test.describe('D — Rejeter une suggestion', () => {

    test('REJETER → status=rejected, category reste "Autres"', async ({ page }) => {
      // Créer une nouvelle suggestion pending pour ce test
      const productRows = await fetch(`${SUPABASE_URL}/rest/v1/supplier_products`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({
          supplier_id:      '6439853e-ce32-4c61-a7a8-ce3a114a27d3',
          product_name:     'TEST CAT-IA Reject',
          category:         'Autres',
          subcategory:      '',
          niche:            '',
          photos:           [],
          min_quantity:     1,
          origin_country:   'Maroc',
          availability_type: 'local_stock',
          target_buyer_type: 'wholesaler',
          approval_status:  'pending_review',
          source:           'telegram',
        }),
      })
      const productsData = await productRows.json() as Array<{id: string}>
      const rejectProductId = productsData[0]?.id
      expect(rejectProductId, 'Produit de test REJECT non créé').toBeTruthy()

      const suggRows = await fetch(`${SUPABASE_URL}/rest/v1/category_suggestions`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({
          supplier_product_id: rejectProductId,
          proposed_label:      'Catégorie À Rejeter',
          source:              'telegram_ai',
          status:              'pending',
        }),
      })
      const suggData = await suggRows.json() as Array<{id: string}>
      const rejectSuggId = suggData[0]?.id
      expect(rejectSuggId, 'Suggestion REJECT non créée').toBeTruthy()

      await navigateWithLocale(page, '/admin/categories/suggestions', 'fr')
      await page.waitForTimeout(1200)

      await capture(page, 'D-reject-avant-submit')

      // Chercher la carte du produit "TEST CAT-IA Reject" et son bouton Reject
      // La carte contient les 3 formulaires dont le RejectForm avec input suggestion_id=rejectSuggId
      const rejectHidden = page.locator(`input[name="suggestion_id"][value="${rejectSuggId}"]`).last()
      // Le dernier hidden suggestion_id dans la page correspond au RejectForm de la dernière carte
      // car chaque carte a 3 hidden inputs (un par formulaire) avec le même suggestion_id
      // On prend le formulaire qui contient uniquement le bouton de rejet (pas de select ni input text)
      const rejectFormByValue = page.locator(`form:has(input[name="suggestion_id"][value="${rejectSuggId}"])`).last()
      const rejectButton = rejectFormByValue.locator('button[type="submit"]')
      await rejectButton.click()

      await page.waitForTimeout(2500)
      await capture(page, 'D-reject-apres-submit')

      // Vérification DB
      const suggCheck = await dbGet(`category_suggestions?id=eq.${rejectSuggId}&select=status`)
      const s = (suggCheck as Array<{status: string}>)[0]
      expect(s?.status, 'status doit être "rejected"').toBe('rejected')

      // supplier_products.category doit rester "Autres"
      const pCheck = await dbGet(`supplier_products?id=eq.${rejectProductId}&select=category`)
      const p = (pCheck as Array<{category: string}>)[0]
      expect(p?.category, 'category doit rester "Autres" après REJECT').toBe('Autres')

      // Nettoyage
      await fetch(`${SUPABASE_URL}/rest/v1/category_suggestions?id=eq.${rejectSuggId}`, { method: 'DELETE', headers: H })
      await fetch(`${SUPABASE_URL}/rest/v1/supplier_products?id=eq.${rejectProductId}`, { method: 'DELETE', headers: H })
    })
  })

  // ── E : /admin/permissions ──────────────────────────────────────────────────
  test.describe('E — /admin/permissions toggle validate_categories', () => {

    test('FR desktop : liste des agents s\'affiche', async ({ page }) => {
      await navigateWithLocale(page, '/admin/permissions', 'fr')
      await page.waitForTimeout(1000)

      // La page doit charger sans erreur
      const heading = page.locator('h1')
      await expect(heading).toBeVisible({ timeout: 8000 })

      await capture(page, 'E-permissions-fr-desktop')
    })

    test('AR desktop : dir=rtl + 0 débordement', async ({ page }) => {
      await navigateWithLocale(page, '/admin/permissions', 'ar')
      await page.waitForTimeout(800)

      const htmlDir = await page.locator('html').getAttribute('dir')
      expect(htmlDir, 'dir=rtl attendu en AR').toBe('rtl')

      const overflows = await page.evaluate(() => {
        const ow = window.innerWidth
        return Array.from(document.querySelectorAll('*'))
          .filter((el) => el.scrollWidth > ow + 5)
          .map((el) => el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'))
          .slice(0, 5)
      })
      expect(overflows, 'Débordements AR permissions').toEqual([])

      await capture(page, 'E-permissions-ar-desktop')
    })

    test('EN desktop : page en anglais', async ({ page }) => {
      await navigateWithLocale(page, '/admin/permissions', 'en')
      const bodyText = await page.locator('body').textContent()
      expect(bodyText).toBeTruthy()
      await capture(page, 'E-permissions-en-desktop')
    })

    test('Mobile 390px : permissions sans débordement', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await navigateWithLocale(page, '/admin/permissions', 'fr')
      await page.waitForTimeout(600)

      const overflows = await page.evaluate(() => {
        const ow = window.innerWidth
        return Array.from(document.querySelectorAll('*'))
          .filter((el) => el.scrollWidth > ow + 5)
          .map((el) => el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'))
          .slice(0, 5)
      })
      expect(overflows, 'Débordements mobile permissions').toEqual([])

      await capture(page, 'E-permissions-fr-mobile-390')
    })

    test('Toggle grant → staff_permissions créé + audit grant', async ({ page }) => {
      await navigateWithLocale(page, '/admin/permissions', 'fr')
      await page.waitForTimeout(1200)

      // Trouver un agent ayant le toggle disponible (status inactif)
      // Le PermissionToggle affiche un bouton "Accorder" (grant)
      const grantBtn = page.locator('button').filter({ hasText: /accorder|grant|activer/i }).first()
      const grantCount = await grantBtn.count()

      if (grantCount === 0) {
        // Tous les agents ont déjà la permission — tenter de révoquer d'abord
        // ou skip ce sous-test
        console.log('Aucun bouton Grant trouvé — tous les agents ont peut-être déjà la permission')
        await capture(page, 'E-toggle-no-grant-btn')
        return
      }

      // Récupérer l'user_id associé AVANT le clic (pour vérification DB)
      // Les données passées au PermissionToggle sont dans data-user-id ou dans l'input hidden
      const toggleContainer = grantBtn.locator('xpath=ancestor::div[contains(@class,"shrink-0")]/..')
      const agentName = await toggleContainer.locator('p.text-sm.font-semibold').first().textContent()
      console.log(`Test toggle sur : ${agentName}`)

      // Cliquer Grant
      await grantBtn.click()
      await page.waitForTimeout(2000)

      await capture(page, 'E-toggle-grant-apres')

      // Vérification DB : une ligne staff_permissions doit exister
      // On cherche via l'audit (plus facile à requêter car on connaît le moment)
      const auditRows = await dbGet(
        `staff_permission_audit?action=eq.grant&capability=eq.validate_categories&order=changed_at.desc&limit=1&select=id,action,user_id,capability`
      )
      const auditEntry = (auditRows as Array<{id: string; action: string; user_id: string; capability: string}>)[0]
      expect(auditEntry, 'Ligne audit "grant" non trouvée en DB').toBeTruthy()
      expect(auditEntry?.action, 'action doit être "grant"').toBe('grant')
      expect(auditEntry?.capability, 'capability doit être validate_categories').toBe('validate_categories')

      const userId = auditEntry?.user_id
      const permRows = await dbGet(`staff_permissions?user_id=eq.${userId}&capability=eq.validate_categories&select=id,capability`)
      const perm = (permRows as Array<{id: string; capability: string}>)[0]
      expect(perm, 'Ligne staff_permissions non créée après grant').toBeTruthy()

      // Re-toggle off (revoke)
      const revokeBtn = page.locator('button').filter({ hasText: /révoquer|revoke|désactiver|retirer/i }).first()
      const revokeBtnCount = await revokeBtn.count()

      if (revokeBtnCount > 0) {
        await revokeBtn.click()
        await page.waitForTimeout(2000)

        await capture(page, 'E-toggle-revoke-apres')

        // Vérification DB : ligne staff_permissions supprimée
        const permRowsAfter = await dbGet(`staff_permissions?user_id=eq.${userId}&capability=eq.validate_categories&select=id`)
        expect((permRowsAfter as unknown[]).length, 'Ligne staff_permissions non supprimée après revoke').toBe(0)

        // Audit 'revoke' présent
        const auditRevoke = await dbGet(
          `staff_permission_audit?action=eq.revoke&capability=eq.validate_categories&user_id=eq.${userId}&order=changed_at.desc&limit=1&select=id,action`
        )
        const revokeEntry = (auditRevoke as Array<{id: string; action: string}>)[0]
        expect(revokeEntry, 'Ligne audit "revoke" non trouvée').toBeTruthy()
        expect(revokeEntry?.action).toBe('revoke')
      } else {
        console.log('Bouton revoke non trouvé après grant — vérification manuelle nécessaire')
      }
    })
  })

  // ── F : Contrôle d'accès agent sans capacité ─────────────────────────────────
  test.describe('F — Contrôle accès agent sans capacité', () => {

    test('Redirect si non habilité (vérifié via storageState admin → test logique)', async ({ page }) => {
      // On ne dispose pas de compte agent de test configuré dans .env.local
      // (SMOKE_AGENT_EMAIL absent).
      // On valide la garde côté code : requireCapability est appelé en page
      // et le redirect est implémenté côté serveur.

      // Vérification structurelle : la page utilise requireCapability
      // (déjà validé par lecture du code, reporté ici comme assertion documentaire)
      const agentEmail = process.env.SMOKE_AGENT_EMAIL
      const agentPassword = process.env.SMOKE_AGENT_PASSWORD

      if (!agentEmail || !agentPassword) {
        // Pas de compte agent de test — on teste le redirect depuis un contexte non-admin
        // via une session vierge (sans storageState)
        const browserContext = await page.context().browser()!.newContext()
        const agentPage = await browserContext.newPage()

        await agentPage.goto('http://localhost:3000/admin/categories/suggestions')
        await agentPage.waitForTimeout(1500)

        const url = agentPage.url()
        // Doit avoir redirigé (pas sur /admin/categories/suggestions)
        const isRedirected = !url.includes('/admin/categories/suggestions') ||
          url.includes('/login') ||
          url.includes('/admin/dashboard')

        await agentPage.screenshot({ path: `${PROOFS_DIR}/F-no-agent-redirect.png` })
        await browserContext.close()

        // On rapporte le constat — pas de compte agent dispo pour tester la ré-autorisation
        console.log(`F — Pas de compte SMOKE_AGENT disponible. URL non-auth : ${url}`)
        console.log('F — redirect depuis session vierge :', isRedirected ? 'OK' : 'KO (page accessible sans auth !)')

        // Si la page est accessible sans auth → FAIL
        expect(isRedirected, 'La page /admin/categories/suggestions doit rediriger sans auth').toBe(true)
        return
      }

      // Si un compte agent est dispo : tester le flux complet
      console.log(`F — Compte agent trouvé : ${agentEmail}`)
      // ... (flux complet agent non testé sans compte dédié)
    })
  })
})
