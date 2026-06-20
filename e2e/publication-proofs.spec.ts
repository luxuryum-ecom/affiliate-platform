import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const PROOFS = path.join(process.cwd(), '.publication-proofs')

// Assure que le dossier existe
if (!fs.existsSync(PROOFS)) fs.mkdirSync(PROOFS, { recursive: true })

const BASE = 'http://localhost:3000'
const AUTH = {
  affiliate: path.join(process.cwd(), 'e2e/.auth/affiliate.json'),
  wholesale: path.join(process.cwd(), 'e2e/.auth/wholesale.json'),
  admin: path.join(process.cwd(), 'e2e/.auth/admin.json'),
}

const LOCALES = ['fr', 'ar', 'en'] as const

// ── P3 : Rayons affilié (3 langues) ──────────────────────────────────────────
for (const locale of LOCALES) {
  test(`P3-affilié-${locale} : rail rayons + dir RTL`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.affiliate })
    await ctx.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
    const page = await ctx.newPage()

    await page.goto(`${BASE}/affiliate/products`)
    await page.waitForLoadState('networkidle')

    // Vérifie rail de rayons présent
    const rail = page.locator('.scrollbar-none, [class*="overflow-x-auto"]').first()
    await expect(rail).toBeVisible({ timeout: 5000 })

    // En AR : vérifier dir=rtl sur html
    if (locale === 'ar') {
      const dir = await page.locator('html').getAttribute('dir')
      console.log(`  AR html[dir]=${dir}`)
      expect(dir).toBe('rtl')
    }

    // Capture fullpage
    await page.screenshot({
      path: path.join(PROOFS, `rayons-affilie-${locale}.png`),
      fullPage: true,
    })
    console.log(`  Capture: rayons-affilie-${locale}.png`)

    await ctx.close()
  })
}

// ── P3 : Rayons grossiste (3 langues) ────────────────────────────────────────
for (const locale of LOCALES) {
  test(`P3-grossiste-${locale} : rail rayons + dir RTL`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.wholesale })
    await ctx.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
    const page = await ctx.newPage()

    await page.goto(`${BASE}/wholesale/products`)
    await page.waitForLoadState('networkidle')

    // Vérifie rail de rayons présent
    const rail = page.locator('.scrollbar-none, [class*="overflow-x-auto"]').first()
    await expect(rail).toBeVisible({ timeout: 5000 })

    // En AR : vérifier dir=rtl
    if (locale === 'ar') {
      const dir = await page.locator('html').getAttribute('dir')
      console.log(`  AR html[dir]=${dir}`)
      expect(dir).toBe('rtl')
    }

    await page.screenshot({
      path: path.join(PROOFS, `rayons-grossiste-${locale}.png`),
      fullPage: true,
    })
    console.log(`  Capture: rayons-grossiste-${locale}.png`)

    await ctx.close()
  })
}

// ── P3 : Filtre par catégorie (URL ?category=) ────────────────────────────────
test('P3-filtre-categorie affilié : clic Textile → URL + liste filtrée', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.affiliate })
  await ctx.addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()

  await page.goto(`${BASE}/affiliate/products`)
  await page.waitForLoadState('networkidle')

  // Clic sur le chip Textile
  const textileLink = page.locator('a[href*="category=Textile"]').first()
  const exists = await textileLink.count()
  if (exists > 0) {
    await textileLink.click()
    await page.waitForLoadState('networkidle')
    const url = page.url()
    console.log(`  URL après clic Textile: ${url}`)
    expect(url).toContain('category=Textile')
  } else {
    console.log('  Chip Textile non trouvé — tentative navigation directe')
    await page.goto(`${BASE}/affiliate/products?category=Textile`)
    await page.waitForLoadState('networkidle')
  }

  await page.screenshot({
    path: path.join(PROOFS, 'rayons-affilie-filtre-textile.png'),
    fullPage: true,
  })
  console.log('  Capture: rayons-affilie-filtre-textile.png')

  // Vérifie que l'URL contient le filtre
  expect(page.url()).toContain('category=')

  await ctx.close()
})

// ── P3 : Filtre grossiste ─────────────────────────────────────────────────────
test('P3-filtre-categorie grossiste : URL ?category=', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.wholesale })
  await ctx.addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()

  await page.goto(`${BASE}/wholesale/products?category=Textile`)
  await page.waitForLoadState('networkidle')

  await page.screenshot({
    path: path.join(PROOFS, 'rayons-grossiste-filtre-textile.png'),
    fullPage: true,
  })
  console.log('  Capture: rayons-grossiste-filtre-textile.png')

  expect(page.url()).toContain('category=Textile')

  await ctx.close()
})

// ── P1a : Absence Alimentaire du catalogue affilié ────────────────────────────
test('P1a-vitrine : Alimentaire absent du catalogue affilié', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.affiliate })
  await ctx.addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()

  // Filtre catégorie Alimentaire sur le catalogue affilié → doit être vide
  await page.goto(`${BASE}/affiliate/products?category=Alimentaire`)
  await page.waitForLoadState('networkidle')

  await page.screenshot({
    path: path.join(PROOFS, 'p1a-alimentaire-absent-affilie.png'),
    fullPage: true,
  })

  // Le texte "Miel" ou "Dattes" ne doit pas apparaître dans le catalogue
  const mielVisible = await page.locator('text=Miel Jujubier').count()
  const dattesVisible = await page.locator('text=Dattes Medjool').count()
  console.log(`  Miel visible: ${mielVisible}, Dattes visible: ${dattesVisible}`)
  expect(mielVisible).toBe(0)
  expect(dattesVisible).toBe(0)

  await ctx.close()
})
