/**
 * sourcing-affectation.spec.ts
 * Tests E2E — Feature "Affectation agents de sourcing par pays"
 *
 * Scénarios :
 * 1. Isolation pays (agent CN ne voit que les demandes CN)
 * 2. Zéro PII dans le texte visible (textContent, pas le HTML brut)
 * 3. Réaffectation (CN → TR via admin, puis vérification agent)
 * 4. Gate capability (retrait → redirection)
 * 5. i18n + mobile RTL (AR) + EN
 *
 * Comptes (identifiants via process.env — voir .env.local, règle #7) :
 * - SMOKE_AGENT_EMAIL / SMOKE_AGENT_PASSWORD
 * - SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD
 *
 * Données de test :
 * - CN : "Lunettes test-CN" (target_country_code=CN)
 * - TR : "Tapis test-TR"    (target_country_code=TR)
 * - TR : "ti shirt en maille" (target_country_code=TR)
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getLocalSupabaseEnv } from './assert-local-supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000'
const PROOFS_DIR = path.resolve(
  '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/.nav-proofs/sourcing-affectation',
)

// Secrets de test via process.env (règle #7 — jamais de mot de passe en dur).
// Renseigner SMOKE_AGENT_PASSWORD / SMOKE_ADMIN_PASSWORD dans .env.local.
const AGENT_EMAIL = process.env.SMOKE_AGENT_EMAIL ?? 'agent-demo@affipartner.ma'
const AGENT_PASSWORD = process.env.SMOKE_AGENT_PASSWORD ?? ''
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@affipartner.ma'
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? ''
const AGENT_ID = 'cebd5f07-55a7-44ee-9638-43348d4de75c'

// GARDE-FOU (incident 2026-06-24) : ce spec ÉCRIT via service_role → identifiants
// Supabase LOCAUX uniquement, JAMAIS .env.local/prod. REFUS fail-fast si non-local.
// (l'URL prod codée en dur en fallback a été retirée — c'était le vecteur le plus grave.)
const LOCAL = getLocalSupabaseEnv()
const SUPABASE_URL = LOCAL.url
const SERVICE_KEY = LOCAL.serviceKey

// Données de test
const PRODUCT_CN = 'Lunettes test-CN'
const PRODUCT_TR = 'Tapis test-TR'
const PRODUCT_TR2 = 'ti shirt en maille'

// Timeouts
const NAV_TIMEOUT = 30_000
const ACTION_TIMEOUT = 15_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureProofsDir() {
  if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR, { recursive: true })
  }
}

async function screenshot(page: Page, filename: string) {
  ensureProofsDir()
  const filePath = path.join(PROOFS_DIR, filename)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`[CAPTURE] ${filename}`)
}

/**
 * Connexion via le formulaire /login.
 * Définit le cookie LOCALE avant la connexion pour contrôler la langue.
 */
async function login(
  page: Page,
  email: string,
  password: string,
  locale: 'fr' | 'ar' | 'en' = 'fr',
) {
  await page.context().addCookies([
    {
      name: 'LOCALE',
      value: locale,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    },
  ])

  await page.goto(`${BASE_URL}/login`, { timeout: NAV_TIMEOUT })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)

  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: NAV_TIMEOUT }),
    page.locator('button[type="submit"]').click(),
  ])

  expect(page.url(), `Connexion échouée pour ${email}`).not.toContain('/login')
}

/**
 * Se déconnecte en effaçant les cookies de session.
 */
async function logout(context: BrowserContext) {
  await context.clearCookies()
}

/**
 * Navigue vers une page admin et attend le chargement complet.
 */
async function gotoAdmin(page: Page, routePath: string) {
  await page.goto(`${BASE_URL}${routePath}`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT })
}

/**
 * Appel HTTP direct via fetch natif (Node 18+).
 * Contourne les conflits de cookies du contexte Playwright.
 */
async function supabaseFetch(
  method: 'GET' | 'POST' | 'DELETE',
  urlPath: string,
  body?: object,
): Promise<{ status: number }> {
  const url = `${SUPABASE_URL}${urlPath}`
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status }
}

/**
 * Réinitialise l'état de l'agent via les RPCs Supabase (fetch natif) :
 * - capability manage_country_sourcing accordée
 * - affecté uniquement à CN
 */
async function resetAgentState(_page: Page) {
  // 1. Accorder la capability
  const capResp = await supabaseFetch('POST', '/rest/v1/rpc/grant_staff_permission', {
    p_user_id: AGENT_ID,
    p_capability: 'manage_country_sourcing',
  })
  console.log(`[SETUP] grant_staff_permission HTTP ${capResp.status}`)

  // 2. Supprimer toutes les affectations pays
  const delResp = await supabaseFetch('DELETE', `/rest/v1/agent_countries?agent_id=eq.${AGENT_ID}`)
  console.log(`[SETUP] DELETE agent_countries HTTP ${delResp.status}`)

  // 3. Lier CN
  const linkResp = await supabaseFetch('POST', '/rest/v1/rpc/link_agent_country', {
    p_agent_id: AGENT_ID,
    p_country_code: 'CN',
  })
  console.log(`[SETUP] link_agent_country CN HTTP ${linkResp.status}`)
  console.log('[SETUP] État agent réinitialisé : CN uniquement + capability active')
}

/**
 * Restaure la capability après SC4.
 */
async function restoreAgentCapability(_page: Page) {
  const resp = await supabaseFetch('POST', '/rest/v1/rpc/grant_staff_permission', {
    p_user_id: AGENT_ID,
    p_capability: 'manage_country_sourcing',
  })
  console.log(`[RESTORE] grant_staff_permission HTTP ${resp.status}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Affectation agents sourcing', () => {
  test.setTimeout(120_000)

  // ─── SCÉNARIO 1 : Isolation pays ──────────────────────────────────────────

  test('SC1 — Isolation pays : agent CN ne voit que ses demandes CN', async ({ page }) => {
    await resetAgentState(page)
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
    await gotoAdmin(page, '/admin/sourcing/my-requests')

    const body = await page.textContent('body') ?? ''

    expect(body, `"${PRODUCT_CN}" doit être visible pour l'agent CN`).toContain(PRODUCT_CN)
    expect(body, `"${PRODUCT_TR}" ne doit PAS être visible (agent CN uniquement)`).not.toContain(PRODUCT_TR)
    expect(body, `"${PRODUCT_TR2}" ne doit PAS être visible (agent CN uniquement)`).not.toContain(PRODUCT_TR2)

    await screenshot(page, 'agent-cn-only-fr.png')
    console.log('[SC1] PASS — Isolation pays CN confirmée')
  })

  // ─── SCÉNARIO 2 : Zéro PII dans le texte visible ─────────────────────────

  test('SC2 — Zero PII : aucune donnée grossiste dans le texte visible', async ({ page }) => {
    await resetAgentState(page)
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
    await gotoAdmin(page, '/admin/sourcing/my-requests')

    // On inspecte le texte VISIBLE uniquement (pas le HTML brut qui inclut
    // les chemins de chunks JS Next.js/Turbopack — ces chemins ne sont pas
    // des fuites de données business)
    const visibleText = await page.locator('body').innerText()

    // Vérifier l'absence de "wholesaler_id" dans le texte visible
    expect(
      visibleText,
      'wholesaler_id ne doit pas apparaître dans le texte visible',
    ).not.toContain('wholesaler_id')

    // Vérifier l'absence de "wholesaler" dans le texte visible
    expect(
      visibleText,
      '"wholesaler" ne doit pas apparaître dans le texte visible',
    ).not.toContain('wholesaler')

    // Vérifier pas de pattern téléphone marocain (+212 ou 06xxxxxxxx ou 07xxxxxxxx)
    const phonePattern = /(\+212|06\d{8}|07\d{8})/
    expect(
      phonePattern.test(visibleText),
      `Aucun numéro de téléphone dans le texte visible. Texte: ${visibleText.slice(0, 200)}`,
    ).toBeFalsy()

    // Vérifier pas d'email grossiste externe dans le texte visible
    // On accepte @affipartner.ma (emails de test) mais pas d'email tiers
    const externalEmailPattern = /@(?!affipartner\.ma)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    expect(
      externalEmailPattern.test(visibleText),
      'Aucun email externe dans le texte visible',
    ).toBeFalsy()

    // Vérifier pas de montant budget exposé (budget_max, budget_min)
    expect(
      visibleText,
      '"budget_max" ne doit pas apparaître dans le texte visible',
    ).not.toContain('budget_max')
    expect(
      visibleText,
      '"budget_min" ne doit pas apparaître dans le texte visible',
    ).not.toContain('budget_min')

    await screenshot(page, 'agent-no-pii.png')
    console.log('[SC2] PASS — Zéro PII dans le texte visible')
  })

  // ─── SCÉNARIO 3 : Réaffectation CN → TR ──────────────────────────────────

  test('SC3 — Réaffectation : admin déplace l\'agent de CN vers TR', async ({ page }) => {
    await resetAgentState(page)

    // --- PHASE ADMIN : réaffectation ---
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
    await gotoAdmin(page, '/admin/sourcing/agents')

    // Capture AVANT
    await screenshot(page, 'realloc-before-cn.png')

    // Utiliser les accessible names des checkboxes directement (meilleur que filtrer les divs)
    // La page expose checkbox "Chine" [checked] et checkbox "Turquie" par aria label
    const chinaCheckbox = page.getByLabel('Chine')
    const turkeyCheckbox = page.getByLabel('Turquie')

    // Vérifier que CN est coché avant
    await expect(chinaCheckbox, 'Chine doit être cochée en état initial').toBeChecked()

    // Décocher CN : utiliser .click() car la checkbox est contrôlée par React
    // .uncheck() vérifie l'état APRÈS le click via l'état DOM, mais React re-rend
    // immédiatement avec l'état contrôlé avant que la Server Action ne réponde.
    // La Server Action met à jour la DB puis un revalidatePath rafraîchit la page.
    await chinaCheckbox.click()
    // Attendre que la Server Action se termine (pas de spinner visible, juste délai)
    await page.waitForTimeout(2000)

    // Cocher TR
    await expect(turkeyCheckbox, 'Turquie doit être décochée avant réaffectation').not.toBeChecked()
    await turkeyCheckbox.click()
    await page.waitForTimeout(2000)

    // Recharger pour confirmer la persistance
    await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

    // Capture APRÈS réaffectation côté admin
    await screenshot(page, 'realloc-admin-after.png')

    // Vérifier persistance
    await expect(
      page.getByLabel('Chine'),
      'Chine doit être décochée après réaffectation et rechargement',
    ).not.toBeChecked()
    await expect(
      page.getByLabel('Turquie'),
      'Turquie doit être cochée après réaffectation et rechargement',
    ).toBeChecked()

    // --- PHASE AGENT : vérifier les nouvelles demandes visibles ---
    await logout(page.context())
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')
    await gotoAdmin(page, '/admin/sourcing/my-requests')

    const bodyAfter = await page.textContent('body') ?? ''

    expect(bodyAfter, `"${PRODUCT_TR}" doit être visible après réaffectation TR`).toContain(PRODUCT_TR)
    expect(bodyAfter, `"${PRODUCT_CN}" ne doit PLUS être visible après déaffectation CN`).not.toContain(PRODUCT_CN)

    await screenshot(page, 'realloc-after-tr.png')
    console.log('[SC3] PASS — Réaffectation CN→TR vérifiée')
  })

  // ─── SCÉNARIO 4 : Gate capability ────────────────────────────────────────

  test('SC4 — Gate capability : retrait capability → redirection', async ({ page }) => {
    // On s'assure que la capability est accordée avant de la retirer
    await restoreAgentCapability(page)

    // --- PHASE ADMIN : retirer la capability via l'UI ---
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'fr')
    await gotoAdmin(page, '/admin/sourcing/agents')

    // Chercher le bouton "Désactiver" dans la section capability de l'agent
    // Le bouton est dans un <form> avec un <button type="submit">
    // En FR : "Désactiver" quand capability active, "Activer" quand inactive
    const revokeBtn = page.getByRole('button', { name: 'Désactiver' })
    await expect(revokeBtn, 'Le bouton "Désactiver" doit être visible (capability active)').toBeVisible({
      timeout: ACTION_TIMEOUT,
    })

    await revokeBtn.click()

    // Attendre que le bouton change en "Activer" (confirmation que la révocation a fonctionné)
    // Note : CapabilityToggle utilise useActionState — après succès, le composant re-render
    // avec currentlyEnabled=false mais nécessite un rechargement pour refléter DB
    await page.waitForTimeout(2000)

    // Recharger pour confirmer la persistance et que le bouton est bien "Activer"
    await page.reload({ waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

    const grantBtnAfter = page.getByRole('button', { name: 'Activer' })
    await expect(
      grantBtnAfter,
      'Le bouton doit être "Activer" après révocation de la capability',
    ).toBeVisible({ timeout: ACTION_TIMEOUT })

    console.log('[SC4] Capability révoquée via UI admin — confirmée après rechargement')

    // --- PHASE AGENT : vérifier le blocage d'accès ---
    await logout(page.context())
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'fr')

    // Naviguer directement sur la page protégée
    await page.goto(`${BASE_URL}/admin/sourcing/my-requests`, { timeout: NAV_TIMEOUT })
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT })

    const currentUrl = page.url()
    const visibleText = await page.locator('body').innerText()

    console.log(`[SC4] URL après accès sans capability : ${currentUrl}`)

    // Le guard fait redirect('/admin') → l'agent doit être redirigé
    // ou la page doit afficher un message d'erreur
    const isBlocked =
      !currentUrl.includes('/sourcing/my-requests') ||
      visibleText.includes('Permission requise') ||
      visibleText.includes('Accès réservé') ||
      visibleText.includes('Non authentifié')

    expect(
      isBlocked,
      `L'accès sans capability doit être bloqué ou redirigé. URL: ${currentUrl}\nTexte: ${visibleText.slice(0, 300)}`,
    ).toBeTruthy()

    await screenshot(page, 'gate-redirect.png')
    console.log('[SC4] PASS — Gate capability : accès bloqué')

    // --- RESTAURATION : re-accorder la capability et re-lier CN ---
    await resetAgentState(page)
    console.log('[SC4] Restauration complète (capability + CN) effectuée')
  })

  // ─── SCÉNARIO 5a : i18n AR + RTL mobile ──────────────────────────────────

  test('SC5a — i18n AR + RTL mobile (390x844)', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()

    await resetAgentState(page)
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'ar')
    await gotoAdmin(page, '/admin/sourcing/my-requests')

    const visibleText = await page.locator('body').innerText()

    // Vérifier direction RTL sur <html>
    const htmlDir = await page.locator('html').getAttribute('dir')
    const htmlLang = await page.locator('html').getAttribute('lang')

    console.log(`[SC5a] html dir="${htmlDir}" lang="${htmlLang}"`)

    expect(htmlDir, 'La direction RTL doit être "rtl" pour la locale arabe').toBe('rtl')
    expect(
      htmlLang?.startsWith('ar'),
      `lang doit commencer par "ar", trouvé: "${htmlLang}"`,
    ).toBeTruthy()

    // Vérifier absence de clés brutes (pattern admin.agentSourcing.xxx)
    const rawKeyPattern = /admin\.agentSourcing[A-Za-z.]+/
    expect(rawKeyPattern.test(visibleText), 'Aucune clé i18n brute dans le body AR').toBeFalsy()

    // Vérifier absence de "translation missing"
    expect(visibleText, 'Aucun "translation missing" en AR').not.toContain('translation missing')
    expect(visibleText, 'Aucun "MISSING" en AR').not.toMatch(/MISSING/i)

    await screenshot(page, 'ar-rtl-mobile.png')
    await context.close()
    console.log('[SC5a] PASS — AR RTL mobile confirmé')
  })

  // ─── SCÉNARIO 5b : i18n EN desktop ───────────────────────────────────────

  test('SC5b — i18n EN desktop', async ({ page }) => {
    await resetAgentState(page)
    await login(page, AGENT_EMAIL, AGENT_PASSWORD, 'en')
    await gotoAdmin(page, '/admin/sourcing/my-requests')

    const visibleText = await page.locator('body').innerText()
    const htmlLang = await page.locator('html').getAttribute('lang')

    console.log(`[SC5b] html lang="${htmlLang}"`)

    expect(
      htmlLang?.startsWith('en'),
      `lang doit commencer par "en", trouvé: "${htmlLang}"`,
    ).toBeTruthy()

    // Vérifier absence de clés brutes
    const rawKeyPattern = /admin\.agentSourcing[A-Za-z.]+/
    expect(rawKeyPattern.test(visibleText), 'Aucune clé i18n brute en locale EN').toBeFalsy()

    // La page EN doit contenir du contenu (page agentSourcingRequests ou redirect /admin)
    // On vérifie qu'on n'est PAS sur la page /login (l'agent est connecté)
    const currentUrl = page.url()
    expect(currentUrl, 'L\'agent connecté ne doit pas être redirigé vers /login').not.toContain('/login')
    // Le texte visible doit exister (plus que quelques espaces)
    expect(visibleText.trim().length, 'Le body EN ne doit pas être vide').toBeGreaterThan(10)

    await screenshot(page, 'en-agent-page.png')
    console.log('[SC5b] PASS — EN desktop confirmé')
  })
})
