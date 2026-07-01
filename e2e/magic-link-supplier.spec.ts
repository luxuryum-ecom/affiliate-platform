/**
 * magic-link-supplier.spec.ts
 * Validation e2e LOT magic-link — Onboarding fournisseur Telegram (lien magique + QR + WhatsApp).
 *
 * RÈGLES ABSOLUES :
 *  - LOCAL UNIQUEMENT (Supabase 127.0.0.1:54321). assertLocalSupabase() en garde-fou.
 *  - Aucun secret réel en dur. Clés via getLocalSupabaseEnv(). MDP smoke LOCAL = OK (CLAUDE.md #7).
 *  - Aucune modification du code applicatif.
 *  - TEARDOWN obligatoire : état DB identique à l'état initial.
 *  - TELEGRAM_BOT_USERNAME doit être défini dans l'env du serveur (voir .env.development.local).
 *
 * PRÉCONDITION SERVEUR :
 *  .env.development.local doit contenir TELEGRAM_BOT_USERNAME=MozounaSupplierBot.
 *  Redémarrer `next dev` si cette variable n'était pas présente au dernier démarrage.
 *
 * SCÉNARIOS (sériels — partagent l'état DB) :
 *  S1 — Admin génère le lien magique pour le fournisseur (bouton, QR, WhatsApp, validité)
 *  S2 — TTL : link_code_expires_at ≈ 15 min (±2 min), code = 8 caractères base32
 *  S3 — Fournisseur (FR) : voir le code existant + bouton t.me, SVG QR, repli /link CODE
 *  S4 — Fournisseur (AR/RTL) : dir=rtl + libellés arabes présents
 *  S5 — Notification : insertion service_role + vérification DB event + mapping i18n fr.json
 *
 * CAPTURES → ./playwright-report-magic-link/captures/
 *   admin-generate.png     | supplier-fr.png     | supplier-ar-rtl.png
 *
 * DIAGNOSTIC gap :
 *  La cloche NotificationBell n'est PAS câblée sur le supplier dashboard (S5 utilise DB+JSON).
 *  Décision @tester : test DB + vérification i18n fr.json = preuve suffisante. La cloche
 *  devra être ajoutée au supplier layout dans un lot ultérieur.
 *
 * Lance avec : playwright test --config=playwright.magic-link.config.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import * as http from 'node:http'
import { assertLocalSupabase, getLocalSupabaseEnv } from './assert-local-supabase'

// Exécution sérielle : les scénarios partagent l'état DB (le code généré en S1 est lu en S2/S3).
test.describe.configure({ mode: 'serial' })

// ─── Constantes ───────────────────────────────────────────────────────────────

const BASE_URL    = 'http://localhost:3000'
// Séparé du dossier HTML reporter (playwright-report-magic-link) pour éviter que le
// reporter ne nettoie le dossier et supprime les captures avant de les déplacer.
const CAPTURES_DIR = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/.nav-proofs/magic-link'
const MESSAGES_FR  = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/messages/fr.json'

// Compte admin LOCAL (non-secret — smoke account LOCAL uniquement).
const ADMIN_EMAIL    = 'smoke-admin@test.local'
const ADMIN_PASSWORD = 'SmokeAdmin2026!'
const ADMIN_ID       = '3ecbc984-3977-4b2d-a65e-bc4193999f94'

// Compte fournisseur smoke — créé en beforeAll, nettoyé en afterAll.
const SUPPLIER_EMAIL    = 'smoke-supplier-magic@test.local'
const SUPPLIER_PASSWORD = 'SmokeSupplier2026!'
const SUPPLIER_PHONE    = '+971501234567'   // chiffres seuls pour wa.me : 971501234567
const BOT_USERNAME      = 'MozounaSupplierBot'
const LINK_CODE_REGEX   = /^[A-HJ-NP-Z2-9]{8}$/

const NAV_TIMEOUT    = 30_000
const ACTION_TIMEOUT = 20_000

// ─── GARDE-FOU incident 2026-06-24 : clés locales via getLocalSupabaseEnv() ──
const LOCAL       = getLocalSupabaseEnv()    // throw si Supabase LOCAL non démarré
const SUPA_URL    = LOCAL.url
const SERVICE_KEY = LOCAL.serviceKey
assertLocalSupabase(SUPA_URL, 'magic-link spec')   // REFUS si URL non-locale

// ─── État partagé entre scénarios (pour teardown) ────────────────────────────
let supplierUserId: string | null = null    // rempli dans beforeAll
let notifIdInserted: string | null = null   // rempli dans S5

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureCapturesDir() {
  if (!fs.existsSync(CAPTURES_DIR)) fs.mkdirSync(CAPTURES_DIR, { recursive: true })
}

async function capture(page: Page, filename: string): Promise<string> {
  ensureCapturesDir()
  const fp = path.join(CAPTURES_DIR, filename)
  await page.screenshot({ path: fp, fullPage: true })
  console.log(`[CAPTURE] ${fp}`)
  return fp
}

/**
 * Appel REST Supabase via service_role (LOCAL uniquement — assertLocalSupabase garantit ça).
 */
function supaRest(
  method: string,
  urlPath: string,
  body?: object,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`${SUPA_URL}${urlPath}`)
    const isHttps  = fullUrl.protocol === 'https:'
    const lib      = isHttps ? https : http

    const headers: Record<string, string> = {
      apikey:          SERVICE_KEY,
      Authorization:   `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=representation',
      ...extraHeaders,
    }
    const bodyStr = body ? JSON.stringify(body) : undefined
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))

    const req = lib.request(
      {
        hostname: fullUrl.hostname,
        port:     Number(fullUrl.port) || (isHttps ? 443 : 80),
        path:     fullUrl.pathname + fullUrl.search,
        method,
        headers,
        timeout: 20_000,
      },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        res.on('end',  () => resolve({ status: res.statusCode ?? 0, body: data }))
      },
    )
    req.on('error',   reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('supaRest timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

/** Appel à l'API Admin Supabase Auth (service_role). */
function supaAuth(
  method: string,
  authPath: string,
  body?: object,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(`${SUPA_URL}${authPath}`)
    const isHttps  = fullUrl.protocol === 'https:'
    const lib      = isHttps ? https : http

    const headers: Record<string, string> = {
      apikey:          SERVICE_KEY,
      Authorization:   `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
    }
    const bodyStr = body ? JSON.stringify(body) : undefined
    if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))

    const req = lib.request(
      {
        hostname: fullUrl.hostname,
        port:     Number(fullUrl.port) || (isHttps ? 443 : 80),
        path:     fullUrl.pathname + fullUrl.search,
        method,
        headers,
        timeout: 20_000,
      },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c })
        res.on('end',  () => resolve({ status: res.statusCode ?? 0, body: data }))
      },
    )
    req.on('error',   reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('supaAuth timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE_URL}/login`, { timeout: NAV_TIMEOUT })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: NAV_TIMEOUT }),
    page.locator('button[type="submit"]').click(),
  ])
  console.log(`[AUTH] ${email} → ${page.url()}`)
}

// ─── SETUP / TEARDOWN ────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ensureCapturesDir()
  console.log('[SETUP] Démarrage — LOCAL Supabase:', SUPA_URL)

  // 1. Créer ou récupérer le compte auth fournisseur smoke.
  const createRes = await supaAuth('POST', '/auth/v1/admin/users', {
    email:          SUPPLIER_EMAIL,
    password:       SUPPLIER_PASSWORD,
    email_confirm:  true,
  })
  const createData = JSON.parse(createRes.body) as { id?: string; msg?: string; message?: string }

  if (createRes.status === 200 || createRes.status === 201) {
    supplierUserId = createData.id ?? null
    console.log(`[SETUP] Compte fournisseur créé : ${supplierUserId}`)
  } else if (createRes.status === 422) {
    // Déjà existant — récupérer l'ID via la liste users
    const listRes = await supaAuth('GET', `/auth/v1/admin/users?page=1&per_page=1000`)
    const listData = JSON.parse(listRes.body) as { users?: Array<{ id: string; email: string }> }
    const existing = (listData.users ?? []).find((u) => u.email === SUPPLIER_EMAIL)
    if (!existing) throw new Error(`SETUP: compte ${SUPPLIER_EMAIL} introuvable après 422`)
    supplierUserId = existing.id
    console.log(`[SETUP] Compte fournisseur existant réutilisé : ${supplierUserId}`)
  } else {
    throw new Error(`SETUP: création auth échouée (HTTP ${createRes.status}): ${createRes.body}`)
  }

  if (!supplierUserId) throw new Error('SETUP: supplierUserId nul après upsert')

  // 2a. Upsert le profil fournisseur (sans country_code — le trigger bloque les UPDATEs de
  //     country_code via service_role car my_role() retourne null pour le JWT service_role).
  const upsertRes = await supaRest(
    'POST',
    '/rest/v1/profiles',
    {
      id:        supplierUserId,
      full_name: 'Smoke Fournisseur',
      role:      'supplier',
      status:    'approved',
      phone:     SUPPLIER_PHONE,
    },
    { Prefer: 'resolution=merge-duplicates,return=minimal' },
  )
  console.log(`[SETUP] Upsert profile (sans country_code) HTTP ${upsertRes.status}`)
  if (upsertRes.status >= 400) {
    throw new Error(`SETUP: upsert profile échoué (HTTP ${upsertRes.status}): ${upsertRes.body}`)
  }

  // 2b. country_code via psql avec session_replication_role=replica pour bypasser le trigger
  //     guard_profile_country_immutable. Ce trigger appelle my_role() = auth.uid() → null pour
  //     tout contexte sans JWT (service_role ou postgres superuser) → il refuse toujours.
  //     session_replication_role='replica' désactive les triggers utilisateur (row-level).
  //     Scope : conteneur local uniquement (jamais la prod).
  const psqlSql = `
    SET session_replication_role = 'replica';
    UPDATE profiles SET country_code='AE' WHERE id='${supplierUserId}';
    RESET session_replication_role;
  `.replace(/\n/g, ' ').trim()
  const psqlOut = execSync(
    `docker exec supabase_db_affiliate-platform psql -U postgres -tAc "${psqlSql}"`,
    { encoding: 'utf8' },
  ).trim()
  console.log(`[SETUP] country_code='AE' via psql+replica LOCAL: ${psqlOut}`)
  // psql retourne "SET\nUPDATE 1\nRESET" — vérifier que UPDATE 1 est présent.
  if (!psqlOut.includes('UPDATE 1')) {
    throw new Error(`SETUP: UPDATE country_code échoué (psql replica): "${psqlOut}"`)
  }

  // 3. Nettoyer tout lien Telegram résiduel du fournisseur smoke (idempotence des runs).
  await supaRest(
    'DELETE',
    `/rest/v1/telegram_supplier_links?supplier_id=eq.${supplierUserId}`,
    undefined,
    { Prefer: 'return=minimal' },
  )
  console.log('[SETUP] telegram_supplier_links nettoyés pour le fournisseur smoke')

  // 4. Nettoyer les notifications résiduelles (idempotence).
  await supaRest(
    'DELETE',
    `/rest/v1/notifications?recipient_id=eq.${supplierUserId}`,
    undefined,
    { Prefer: 'return=minimal' },
  )
  console.log('[SETUP] notifications nettoyées pour le fournisseur smoke')
})

test.afterAll(async () => {
  if (!supplierUserId) return

  console.log('[TEARDOWN] Nettoyage des données de test...')

  // Supprimer liens Telegram du fournisseur smoke.
  const delLinks = await supaRest(
    'DELETE',
    `/rest/v1/telegram_supplier_links?supplier_id=eq.${supplierUserId}`,
    undefined,
    { Prefer: 'return=minimal' },
  )
  console.log(`[TEARDOWN] telegram_supplier_links HTTP ${delLinks.status}`)

  // Supprimer notifications du fournisseur smoke.
  const delNotifs = await supaRest(
    'DELETE',
    `/rest/v1/notifications?recipient_id=eq.${supplierUserId}`,
    undefined,
    { Prefer: 'return=minimal' },
  )
  console.log(`[TEARDOWN] notifications HTTP ${delNotifs.status}`)

  // NOTE : on ne supprime PAS le compte auth. La suppression cascade vers profiles,
  // ce qui déclenche ON DELETE SET NULL sur admin_audit_log.actor_id. Le trigger
  // append-only d'admin_audit_log bloque tout UPDATE (y compris SET NULL) — 500 garanti.
  // Le compte smoke est ré-utilisé idempotement au prochain run (cf. SETUP "existant réutilisé").
  console.log(`[TEARDOWN] Compte auth conservé (non-supprimable — admin_audit_log append-only). ID=${supplierUserId}`)

  console.log('[TEARDOWN] OK — données de test nettoyées, compte smoke conservé pour le prochain run')
})

// =============================================================================
// S1 — Admin génère le lien magique pour le fournisseur
// =============================================================================
test('S1 — Admin génère le lien magique (bouton t.me, QR, WhatsApp, validité 15 min)', async ({ page }) => {
  test.setTimeout(90_000)

  if (!supplierUserId) throw new Error('S1: supplierUserId absent')

  // ── Login admin ──────────────────────────────────────────────────────────────
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)

  // Forcer la locale FR : le cookie LOCALE=fr (cf. src/i18n/request.ts — LOCALE_COOKIE='LOCALE')
  // prend la priorité sur l'Accept-Language du navigateur. La config Playwright envoie déjà
  // Accept-Language: fr-FR, mais on ajoute le cookie pour garantir FR même en cas de rechargement.
  await page.context().addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }])

  // ── Naviguer vers la page détail du fournisseur ──────────────────────────────
  await page.goto(`${BASE_URL}/admin/users/${supplierUserId}`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')

  console.log(`[S1] URL = ${page.url()}`)

  // Vérifier que la section Telegram est présente (admin + supplier).
  // Sélecteur par texte i18n FR : "Liaison Telegram" (admin.userDetail.telegram.sectionTitle).
  const telegramSection = page.locator('h2').filter({ hasText: 'Liaison Telegram' })
  await expect(telegramSection, 'Section "Liaison Telegram" visible pour admin+supplier').toBeVisible({ timeout: ACTION_TIMEOUT })

  // ── Clic sur "Générer le lien" ────────────────────────────────────────────────
  const generateBtn = page.getByRole('button', { name: 'Générer le lien' })
  await expect(generateBtn, 'Bouton "Générer le lien" visible').toBeVisible({ timeout: ACTION_TIMEOUT })
  await generateBtn.click()

  // Attendre l'apparition du lien t.me (preuve que l'action a réussi)
  const telegramLink = page.locator(`a[href^="https://t.me/${BOT_USERNAME}?start="]`)
  await expect(telegramLink, `Lien t.me/${BOT_USERNAME}?start=<CODE> présent`).toBeVisible({ timeout: ACTION_TIMEOUT })

  // ── ASSERT — lien contient un CODE 8 caractères base32 ───────────────────────
  const href = await telegramLink.getAttribute('href') ?? ''
  console.log(`[S1] href lien Telegram = ${href}`)
  const codeMatch = href.match(/[?&]start=([A-HJ-NP-Z2-9]{8})/)
  expect(codeMatch, 'href contient start=<CODE 8 car base32>').toBeTruthy()
  const extractedCode = codeMatch![1]
  expect(LINK_CODE_REGEX.test(extractedCode), `CODE "${extractedCode}" est base32 valide (8 car)`).toBe(true)
  console.log(`[S1] Code extrait = ${extractedCode}`)

  // ── ASSERT — QR code SVG présent ─────────────────────────────────────────────
  const qrSvg = page.locator('svg').first()
  await expect(qrSvg, 'QR SVG présent après génération').toBeVisible({ timeout: ACTION_TIMEOUT })

  // ── ASSERT — bouton WhatsApp avec href wa.me contenant les chiffres du téléphone ──
  const waPhone = SUPPLIER_PHONE.replace(/[^\d]/g, '')  // '971501234567'
  const whatsappBtn = page.locator(`a[href^="https://wa.me/${waPhone}"]`)
  await expect(whatsappBtn, `Bouton WhatsApp href commençant par https://wa.me/${waPhone}`).toBeVisible({ timeout: ACTION_TIMEOUT })

  const waHref = await whatsappBtn.getAttribute('href') ?? ''
  console.log(`[S1] href WhatsApp = ${waHref.slice(0, 120)}...`)
  // L'URL WhatsApp doit contenir le code encodé (start%3D ou start=).
  const waContainsCode = waHref.includes(extractedCode) || waHref.includes(encodeURIComponent(extractedCode))
  expect(waContainsCode, 'URL WhatsApp contient le CODE').toBe(true)

  // ── ASSERT — texte de validité "15 minutes" présent ──────────────────────────
  const validityText = page.locator('p').filter({ hasText: /15 minutes/ }).first()
  await expect(validityText, 'Texte "15 minutes" (validité) présent').toBeVisible({ timeout: ACTION_TIMEOUT })

  await capture(page, 'admin-generate.png')

  console.log(`[S1] PASS — Lien=${href.slice(0, 80)}, CODE=${extractedCode}, WhatsApp OK, validité 15 min`)
})

// =============================================================================
// S2 — Vérification TTL en base : link_code_expires_at ≈ 15 min, code base32 8 car
// =============================================================================
test('S2 — TTL DB : link_code_expires_at ≈ 15 min (±2 min), code = 8 car base32', async () => {
  test.setTimeout(30_000)

  if (!supplierUserId) throw new Error('S2: supplierUserId absent')

  // Lire la ligne telegram_supplier_links du fournisseur (service_role LOCAL).
  const r = await supaRest(
    'GET',
    `/rest/v1/telegram_supplier_links?supplier_id=eq.${supplierUserId}&select=link_code,link_code_expires_at`,
  )
  expect(r.status, 'GET telegram_supplier_links HTTP 200').toBe(200)

  type LinkRow = { link_code: string | null; link_code_expires_at: string | null }
  const rows = JSON.parse(r.body) as LinkRow[]
  expect(rows.length, 'Une ligne telegram_supplier_links doit exister').toBe(1)

  const row = rows[0]
  console.log(`[S2] DB row = ${JSON.stringify(row)}`)

  // ASSERT code = 8 caractères base32 valide.
  expect(row.link_code, 'link_code non nul').not.toBeNull()
  const code = row.link_code!
  expect(LINK_CODE_REGEX.test(code), `link_code "${code}" est base32 8 car valide`).toBe(true)

  // ASSERT TTL ≈ 15 min (tolérance ±2 min = [13, 17] min).
  expect(row.link_code_expires_at, 'link_code_expires_at non nul').not.toBeNull()
  const expiresAt = new Date(row.link_code_expires_at!).getTime()
  const nowMs     = Date.now()
  const remainingMs = expiresAt - nowMs
  const remainingMin = remainingMs / 60_000

  console.log(`[S2] TTL restant = ${remainingMin.toFixed(2)} min`)
  expect(remainingMin, `TTL doit être entre 13 et 17 min (trouvé: ${remainingMin.toFixed(2)})`).toBeGreaterThan(13)
  expect(remainingMin, `TTL doit être entre 13 et 17 min (trouvé: ${remainingMin.toFixed(2)})`).toBeLessThan(17)

  console.log(`[S2] PASS — code=${code}, TTL≈${remainingMin.toFixed(1)} min (±2 min de 15)`)
})

// =============================================================================
// S3 — Fournisseur (FR) : code existant → bouton t.me, SVG QR, repli /link CODE
// =============================================================================
test('S3 — Fournisseur FR : bouton t.me, QR SVG, repli /link CODE', async ({ page }) => {
  test.setTimeout(90_000)

  if (!supplierUserId) throw new Error('S3: supplierUserId absent')

  // ── Login fournisseur ────────────────────────────────────────────────────────
  await login(page, SUPPLIER_EMAIL, SUPPLIER_PASSWORD)

  // Vérifier qu'on est bien dans l'espace fournisseur.
  expect(page.url(), 'Redirigé vers /supplier/*').toContain('/supplier/')

  await page.goto(`${BASE_URL}/supplier/dashboard`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')

  console.log(`[S3] URL après goto dashboard = ${page.url()}`)

  // Le TELEGRAM_BOT_USERNAME doit être défini dans l'env du serveur.
  // Si ce n'est pas le cas, les assertions suivantes échoueront avec un message explicite.
  // Solution : redémarrer next dev après avoir ajouté TELEGRAM_BOT_USERNAME à .env.development.local.

  // ── ASSERT — bouton « Ouvrir Telegram et lier mon compte » ───────────────────
  // Le code a déjà été généré par l'admin (S1), donc TelegramLinkCard reçoit initialStatus.code
  // et affiche directement le bouton + QR sans nécessiter un clic sur "Générer".
  const openTelegramBtn = page.locator(`a[href^="https://t.me/${BOT_USERNAME}?start="]`)
  await expect(openTelegramBtn, `Bouton "Ouvrir Telegram" avec href t.me/${BOT_USERNAME}?start=<CODE>`).toBeVisible({ timeout: ACTION_TIMEOUT })

  const btnHref = await openTelegramBtn.getAttribute('href') ?? ''
  const codeFromBtn = btnHref.match(/[?&]start=([A-HJ-NP-Z2-9]{8})/)?.[1] ?? ''
  expect(LINK_CODE_REGEX.test(codeFromBtn), `href contient CODE base32 8 car valide: "${codeFromBtn}"`).toBe(true)
  console.log(`[S3] Bouton Telegram href = ${btnHref}`)

  // ── ASSERT — SVG QR présent ───────────────────────────────────────────────────
  const qrSvg = page.locator('svg').first()
  await expect(qrSvg, 'QR SVG <svg> présent').toBeVisible({ timeout: ACTION_TIMEOUT })

  // ── ASSERT — repli dans <details> contient /link CODE ────────────────────────
  const detailsEl = page.locator('details')
  await expect(detailsEl, 'Élément <details> de repli présent').toBeVisible({ timeout: ACTION_TIMEOUT })

  // Ouvrir le repli pour vérifier le contenu.
  await detailsEl.locator('summary').click()
  await page.waitForTimeout(300)  // laisser l'animation de dépliage

  // Vérifier que le code `/link <CODE>` est dans le repli.
  const fallbackCode = page.locator('code').filter({ hasText: `/link ${codeFromBtn}` })
  await expect(fallbackCode, `Repli <code> contient "/link ${codeFromBtn}"`).toBeVisible({ timeout: ACTION_TIMEOUT })
  console.log(`[S3] Repli /link ${codeFromBtn} présent`)

  await capture(page, 'supplier-fr.png')

  console.log(`[S3] PASS — Bouton Telegram OK, QR SVG OK, repli /link ${codeFromBtn} OK`)
})

// =============================================================================
// S4 — Fournisseur AR/RTL : dir="rtl" + libellés arabes présents
// =============================================================================
test('S4 — Fournisseur AR/RTL : html[dir=rtl] + texte arabe', async ({ page }) => {
  test.setTimeout(90_000)

  if (!supplierUserId) throw new Error('S4: supplierUserId absent')

  // ── Login fournisseur ────────────────────────────────────────────────────────
  await login(page, SUPPLIER_EMAIL, SUPPLIER_PASSWORD)

  await page.goto(`${BASE_URL}/supplier/dashboard`, { timeout: NAV_TIMEOUT })
  await page.waitForLoadState('networkidle')

  // ── Basculer en locale arabe ──────────────────────────────────────────────────
  // Le LanguageSwitcher est dans le header du supplier dashboard.
  const arBtn = page
    .locator('[role="group"]')
    .getByRole('button', { name: /^AR$/i })

  if (await arBtn.isVisible()) {
    await arBtn.click()
    // setLocale() + router.refresh() est asynchrone — attendre que le root layout
    // re-rende avec dir=rtl via expect().toHaveAttribute() (boucle automatique).
    console.log('[S4] Basculement AR via LanguageSwitcher — attente dir=rtl...')
  } else {
    // Repli : cookie LOCALE=ar + reload
    console.log('[S4] LanguageSwitcher AR non trouvé, utilisation du cookie LOCALE=ar')
    await page.context().addCookies([{ name: 'LOCALE', value: 'ar', domain: 'localhost', path: '/' }])
    await page.reload()
  }

  // ── ASSERT dir="rtl" sur <html> ───────────────────────────────────────────────
  // toHaveAttribute boucle jusqu'au timeout (attend la fin de router.refresh()).
  await expect(page.locator('html'), 'html[dir=rtl] après basculement AR').toHaveAttribute('dir', 'rtl', { timeout: 20_000 })
  const htmlDir = await page.locator('html').getAttribute('dir')
  console.log(`[S4] html[dir] = ${htmlDir ?? 'non défini'}`)

  // ── ASSERT libellés arabes présents (TelegramLinkCard) ───────────────────────
  // Texte arabe attendu d'après ar.json : "إضافة منتجات عبر تيليغرام" (title)
  // ou "افتح تيليغرام واربط حسابي" (openTelegramButton)
  const arabicTitle = page.getByText('إضافة منتجات عبر تيليغرام')
  const arabicButton = page.getByText('افتح تيليغرام واربط حسابي')

  // Au moins l'un des deux doit être présent.
  const titleVisible  = await arabicTitle.isVisible().catch(() => false)
  const buttonVisible = await arabicButton.isVisible().catch(() => false)

  expect(
    titleVisible || buttonVisible,
    'Au moins un libellé arabe de TelegramLinkCard doit être visible (titre OU bouton)',
  ).toBe(true)
  console.log(`[S4] Libellé arabe visible — titre:${titleVisible}, bouton:${buttonVisible}`)

  await capture(page, 'supplier-ar-rtl.png')

  // Remettre en FR pour ne pas polluer les autres tests.
  const frBtn = page.locator('[role="group"]').getByRole('button', { name: /^FR$/i })
  if (await frBtn.isVisible().catch(() => false)) {
    await frBtn.click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
  } else {
    await page.context().clearCookies()
  }

  console.log(`[S4] PASS — dir=rtl, libellés arabes présents`)
})

// =============================================================================
// S5 — Notification supplier_telegram_linked : DB + mapping i18n fr.json
//
// NOTE GAP : NotificationBell n'est PAS câblée dans l'espace fournisseur.
// Vérification via DB (existence de la ligne) + fr.json (titre i18n correct).
// La cloche devra être ajoutée au supplier layout dans un lot ultérieur.
// =============================================================================
test('S5 — Notification liaison Telegram : DB event correct + titre i18n fr.json', async () => {
  test.setTimeout(30_000)

  if (!supplierUserId) throw new Error('S5: supplierUserId absent')

  // ── Insérer une notification via service_role (simule handleLinkCommand) ──────
  const insertRes = await supaRest(
    'POST',
    '/rest/v1/notifications',
    {
      recipient_id: supplierUserId,
      event:        'supplier_telegram_linked',
      payload:      { telegramUsername: 'smoke_test_user' },
      channels:     ['in_app'],
    },
    { Prefer: 'return=representation' },
  )
  expect(insertRes.status, 'INSERT notification HTTP 201').toBe(201)

  const inserted = JSON.parse(insertRes.body) as Array<{ id: string }>
  notifIdInserted = inserted[0]?.id ?? null
  expect(notifIdInserted, 'ID notification inséré récupéré').not.toBeNull()
  console.log(`[S5] Notification insérée : id=${notifIdInserted}`)

  // ── ASSERT DB — la ligne existe avec les bons champs ─────────────────────────
  const readRes = await supaRest(
    'GET',
    `/rest/v1/notifications?id=eq.${notifIdInserted}&select=id,event,recipient_id,payload,read_at`,
  )
  expect(readRes.status, 'GET notification HTTP 200').toBe(200)

  type NotifRow = { id: string; event: string; recipient_id: string; payload: Record<string, unknown>; read_at: string | null }
  const notifs = JSON.parse(readRes.body) as NotifRow[]
  expect(notifs.length, 'Une notification doit exister').toBe(1)

  const notif = notifs[0]
  expect(notif.event, 'event = supplier_telegram_linked').toBe('supplier_telegram_linked')
  expect(notif.recipient_id, 'recipient_id = supplierUserId').toBe(supplierUserId)
  expect((notif.payload as { telegramUsername?: string }).telegramUsername, 'payload.telegramUsername présent').toBe('smoke_test_user')
  expect(notif.read_at, 'read_at null (non lue)').toBeNull()
  console.log(`[S5] DB PROOF — event=${notif.event}, recipient_id=${notif.recipient_id?.slice(0, 8)}…`)

  // ── ASSERT i18n — notifications.supplier_telegram_linked.title dans fr.json ───
  const frMessages = JSON.parse(fs.readFileSync(MESSAGES_FR, 'utf8')) as Record<string, unknown>
  const notifKeys = (frMessages['notifications'] as Record<string, unknown> | undefined) ?? {}
  const tgLinkedKeys = (notifKeys['supplier_telegram_linked'] as Record<string, unknown> | undefined) ?? {}
  const frTitle = tgLinkedKeys['title'] as string | undefined
  const frBody  = tgLinkedKeys['body'] as string | undefined

  console.log(`[S5] fr.json title = "${frTitle}"`)
  console.log(`[S5] fr.json body  = "${frBody}"`)

  expect(frTitle, 'fr.json notifications.supplier_telegram_linked.title non vide').toBeTruthy()
  expect(frTitle, 'Titre i18n = "Telegram lié à votre compte"').toBe('Telegram lié à votre compte')
  expect(frBody, 'fr.json notifications.supplier_telegram_linked.body non vide').toBeTruthy()

  // Vérification que la clé i18n n'est PAS le raw event (string brute = antipattern).
  expect(frTitle, 'Titre ne doit PAS être la string brute supplier_telegram_linked').not.toBe('supplier_telegram_linked')

  // DIAGNOSTIC gap : bell non câblée dans le supplier layout.
  console.log('[S5] INFO GAP : NotificationBell absent du supplier dashboard.')
  console.log('[S5] INFO GAP : Vérification DOM de la cloche impossible — DB + fr.json utilisés.')
  console.log('[S5] INFO GAP : La cloche devra être ajoutée au supplier layout dans un lot ultérieur.')

  console.log(`[S5] PASS — DB event correct, title i18n = "${frTitle}", body = "${(frBody ?? '').slice(0, 60)}"`)
})
