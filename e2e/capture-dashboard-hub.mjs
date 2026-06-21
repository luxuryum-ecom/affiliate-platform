// Preuve runtime — refonte dashboard grossiste HUB 3 zones (hors suite smoke).
// Login direct via SMOKE_WHOLESALE, mobile 390px, FR/AR/EN + RTL.
// Captures + assertions structure + check des 8 liens (pas de 404 / redir login).
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'

// Charge .env.local (inline, sans dépendance) — même logique que e2e/env.ts
;(function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
})()

const BASE = 'http://localhost:3000'
const OUT = resolve(process.cwd(), '.nav-proofs', 'dashboard-hub')
mkdirSync(OUT, { recursive: true })

const EMAIL = process.env.SMOKE_WHOLESALE_EMAIL
const PASSWORD = process.env.SMOKE_WHOLESALE_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('NO SMOKE_WHOLESALE creds'); process.exit(2) }

const LOCALES = ['fr', 'ar', 'en']
const LINKS = [
  '/wholesale/products', '/wholesale/marketplace', '/wholesale/sourcing',
  '/wholesale/cart', '/wholesale/orders', '/wholesale/quote-requests',
  '/wholesale/samples', '/wholesale/account',
]

const browser = await chromium.launch()
// 1) Login une fois → storageState en mémoire
const loginCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const lp = await loginCtx.newPage()
await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await lp.locator('#email').fill(EMAIL)
await lp.locator('#password').fill(PASSWORD)
await Promise.all([
  lp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
  lp.locator('button[type="submit"]').click(),
])
const state = await loginCtx.storageState()
await loginCtx.close()
console.log('LOGIN ok')

const report = {}
for (const locale of LOCALES) {
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await ctx.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message))

  await page.goto(`${BASE}/wholesale/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(500)

  const dir = await page.evaluate(() => document.documentElement.dir)
  const bodyText = await page.locator('main').innerText()
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)

  // Assertions structure
  const totalDepenseGone = !/dépens|إنفاق|spent/i.test(bodyText)
  const hasFlags = bodyText.includes('🇲🇦') // au moins drapeau MA présent
  // hrefs présents dans le DOM
  const hrefs = await page.$$eval('a[href^="/wholesale/"]', (as) => as.map((a) => a.getAttribute('href')))
  const uniqHrefs = [...new Set(hrefs)].sort()
  const allLinksPresent = LINKS.every((l) => uniqHrefs.includes(l))
  // touch targets: hauteur des Links principaux >= 44
  const minLinkH = await page.$$eval('main a', (as) =>
    Math.min(...as.map((a) => a.getBoundingClientRect().height).filter((h) => h > 0)))

  await page.screenshot({ path: `${OUT}/dashboard-${locale}-390.png`, fullPage: true })

  report[locale] = {
    dir, overflow, totalDepenseGone, hasFlags, allLinksPresent,
    minLinkHeight: Math.round(minLinkH), consoleErrors: consoleErrors.length,
    consoleSample: consoleErrors.slice(0, 3),
    uniqHrefs,
  }
  await ctx.close()
}

// 2) Vérif des 8 liens (pas de 404 / pas de redirection login) — locale FR
const navCtx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 } })
await navCtx.addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }])
const np = await navCtx.newPage()
const linkResults = {}
for (const link of LINKS) {
  const resp = await np.goto(`${BASE}${link}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const status = resp ? resp.status() : 0
  const finalUrl = np.url()
  const onLogin = finalUrl.includes('/login')
  linkResults[link] = { status, redirectedToLogin: onLogin, ok: status < 400 && !onLogin }
}
await navCtx.close()
await browser.close()

console.log('=== STRUCTURE REPORT ===')
console.log(JSON.stringify(report, null, 2))
console.log('=== LINK CHECK ===')
console.log(JSON.stringify(linkResults, null, 2))

const allLinksOk = Object.values(linkResults).every((r) => r.ok)
const allStructOk = Object.values(report).every((r) =>
  r.totalDepenseGone && r.hasFlags && r.allLinksPresent && r.overflow <= 1 && r.consoleErrors === 0 && r.minLinkHeight >= 44)
console.log('=== VERDICT ===')
console.log('links_ok=' + allLinksOk + ' struct_ok=' + allStructOk)
process.exit(allLinksOk && allStructOk ? 0 : 1)
