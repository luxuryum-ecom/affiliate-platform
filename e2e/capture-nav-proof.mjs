// Script de preuve PHASE C — captures navigation marketplace (hors suite smoke).
// Usage: node e2e/capture-nav-proof.mjs <label>   (label = 'after' | 'before')
// Réutilise le storageState wholesale + cookie LOCALE. Mobile 390 + desktop 1366, FR/AR/EN.
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const label = process.argv[2] ?? 'after'
const BASE = 'http://localhost:3000'
const STORAGE = resolve(process.cwd(), 'e2e/.auth/wholesale.json')
const OUT = resolve(process.cwd(), '.nav-proofs', label)
mkdirSync(OUT, { recursive: true })

const LOCALES = ['fr', 'ar', 'en']
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1366, height: 900 },
]
// En 'before', la page n'a ni showcase ni rail ni route /categories → on ne capture
// que le marketplace (pour comparer le BAS de page = grille produit).
const PAGES = label === 'before'
  ? [{ key: 'marketplace', path: '/wholesale/marketplace' }]
  : [
      { key: 'marketplace', path: '/wholesale/marketplace' },
      { key: 'categories', path: '/wholesale/marketplace/categories' },
    ]

const browser = await chromium.launch()
let shots = 0
for (const vp of VIEWPORTS) {
  for (const locale of LOCALES) {
    const context = await browser.newContext({
      storageState: STORAGE,
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    })
    await context.addCookies([
      { name: 'LOCALE', value: locale, domain: 'localhost', path: '/' },
    ])
    const page = await context.newPage()
    for (const pg of PAGES) {
      let ok = false
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.locator('main').first().waitFor({ state: 'visible', timeout: 15000 })
          ok = true
        } catch (e) {
          if (attempt === 3) throw e
          await page.waitForTimeout(800)
        }
      }
      await page.waitForTimeout(700)
      const dir = await page.evaluate(() => document.documentElement.dir)
      const base = `${pg.key}-${locale}-${vp.key}`
      // Pleine page
      await page.screenshot({ path: `${OUT}/${base}-full.png`, fullPage: true })
      shots++
      // Bas de page = grille produit (enfant direct <main> .grid). Preuve d'identité.
      const grid = page.locator('main > div.grid').last()
      if (await grid.count()) {
        await grid.scrollIntoViewIfNeeded()
        await grid.screenshot({ path: `${OUT}/${base}-grid.png` })
        shots++
      }
      console.log(`[${label}] ${base} dir=${dir} ✓`)
    }
    await context.close()
  }
}
await browser.close()
console.log(`Done: ${shots} screenshots in ${OUT}`)
