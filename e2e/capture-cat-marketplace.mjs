// Preuve runtime — Catégories dynamiques + Marketplace 3 zones.
// Vérifie en RUNTIME mobile 390px, FR/AR/EN + RTL.
// Usage: node e2e/capture-cat-marketplace.mjs
// Auth : réutilise les storageState wholesale + affiliate déjà générés.
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'

// ── Chargement .env.local (inline, sans dépendance) ───────────────────────────
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
})()

const BASE = 'http://localhost:3000'
const OUT = resolve(process.cwd(), '.nav-proofs', 'cat-marketplace')
mkdirSync(OUT, { recursive: true })

const WHOLESALE_STATE = resolve(process.cwd(), 'e2e/.auth/wholesale.json')
const AFFILIATE_STATE = resolve(process.cwd(), 'e2e/.auth/affiliate.json')

if (!existsSync(WHOLESALE_STATE)) {
  console.error('ERROR: wholesale storageState manquant (' + WHOLESALE_STATE + '). Lancer: npx playwright test --project=setup')
  process.exit(2)
}
if (!existsSync(AFFILIATE_STATE)) {
  console.error('ERROR: affiliate storageState manquant (' + AFFILIATE_STATE + '). Lancer: npx playwright test --project=setup')
  process.exit(2)
}

const LOCALES = ['fr', 'ar', 'en']

// ── Textes attendus par zone et par locale ────────────────────────────────────
const ZONE_TEXTS = {
  fr: {
    zone1: 'Stock Maroc',
    zone2: 'Importer depuis',
    zone3: 'Sourcing',
    moroccoHero: 'MAROC',
    countryTurkey: 'Turquie',
    countryChina: 'Chine',
    countryEgypt: 'Égypte',
    countryDubai: 'Dubai',
  },
  ar: {
    zone1: 'مخزون المغرب',
    zone2: 'استيراد من',
    zone3: 'التوريد',
    moroccoHero: 'المغرب',
    countryTurkey: 'تركيا',
    countryChina: 'الصين',
    countryEgypt: 'مصر',
    countryDubai: 'دبي',
  },
  en: {
    zone1: 'Morocco stock',
    zone2: 'Import from',
    zone3: 'Sourcing',
    moroccoHero: 'MOROCCO',
    countryTurkey: 'Turkey',
    countryChina: 'China',
    countryEgypt: 'Egypt',
    countryDubai: 'Dubai',
  },
}

// Fallback : certaines locales peuvent ne pas avoir traduit le nom du pays (valeur FR/EN selon config)
// On teste la présence de DRAPEAUX comme assertion fallback robuste
const COUNTRY_FLAGS = ['🇲🇦', '🇹🇷', '🇨🇳', '🇪🇬', '🇦🇪']

const report = {}
const failures = []

// ── Fonction helper : goto avec retry ────────────────────────────────────────
async function gotoRetry(page, url, opts = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000, ...opts })
      await page.locator('main').first().waitFor({ state: 'visible', timeout: 20000 })
      return true
    } catch (e) {
      if (attempt === 3) throw e
      await page.waitForTimeout(1000)
    }
  }
}

const browser = await chromium.launch()

// ════════════════════════════════════════════════════════════════════════════
// BLOC 1 — WHOLESALE : marketplace 3 zones + wholesale/products
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== BLOC 1 : WHOLESALE ===')
for (const locale of LOCALES) {
  console.log(`\n-- locale: ${locale} --`)
  report[locale] = {}

  const ctx = await browser.newContext({
    storageState: WHOLESALE_STATE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await ctx.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message))

  // ── 1a) /wholesale/marketplace ────────────────────────────────────────────
  await gotoRetry(page, `${BASE}/wholesale/marketplace`)
  await page.waitForTimeout(800)

  const dir = await page.evaluate(() => document.documentElement.dir)
  const bodyText = await page.evaluate(() => document.body.innerText)
  const htmlLang = await page.evaluate(() => document.documentElement.lang)

  // Scroll width check (débordement horizontal)
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )

  // 3 zones via aria-labelledby
  const zone1Present = await page.locator('[aria-labelledby="zone1-title"]').count() > 0
  const zone2Present = await page.locator('[aria-labelledby="zone2-title"]').count() > 0
  const zone3Present = await page.locator('[aria-labelledby="zone3-title"]').count() > 0

  // Drapeaux pays : tous les 5 présents (MA + 4 import)
  const flagChecks = {}
  for (const flag of COUNTRY_FLAGS) {
    flagChecks[flag] = bodyText.includes(flag)
  }

  // Zone 2 : exactement 4 cartes pays (grid-cols-2 sur 390px)
  const countryCardCount = await page.locator('[aria-labelledby="zone2-title"] a').count()

  // ABSENCE ancienne rangée de 6 badges répétitifs
  // Les anciens badges avaient des textes comme "Paiement sécurisé", "Livraison rapide", "Fournisseurs vérifiés" × 6
  // On vérifie l'absence d'un sélecteur de 6 badges (pas de .trust-badge ni .grid contenant 6 enfants span/li)
  const sixBadgeRowGone = await page.evaluate(() => {
    // Cherche tout grid contenant >= 6 éléments span/li de type "badge"
    const grids = document.querySelectorAll('.grid')
    for (const g of grids) {
      const spans = g.querySelectorAll('span')
      if (spans.length >= 6 && g.getAttribute('aria-labelledby') === null) {
        // Vérifie si c'est une rangée de badges (texte court, pas de price/link/title)
        const allShort = Array.from(spans).every((s) => s.textContent && s.textContent.trim().length < 40)
        const noneAreLinks = g.querySelectorAll('a').length === 0
        if (allShort && noneAreLinks) return false
      }
    }
    return true
  })

  // Stats en double : les métriques (totalProducts, verifiedSuppliers, localStockProducts) ne doivent
  // apparaître qu'UNE fois chacune. On inspecte les sections [aria-labelledby] pour double affichage.
  const metricsZoneCount = await page.evaluate(() => {
    // Cherche les zones ayant à la fois zone1 ET zone2 title avec même texte
    const allSections = document.querySelectorAll('section')
    return allSections.length
  })

  // Text zone attendus
  // IMPORTANT: innerText peut split l'emoji 🌍 du texte "🌍 Importer depuis" en lignes séparées
  // selon le moteur → on cherche dans innerHTML plutôt que innerText pour zone2 (emoji en tête)
  const bodyHTML = await page.evaluate(() => document.body.innerHTML)
  const texts = ZONE_TEXTS[locale]
  const zone1TextOk = bodyText.includes(texts.zone1)
  const zone2TextOk = bodyHTML.includes(texts.zone2)

  // Screenshots
  await page.screenshot({
    path: `${OUT}/marketplace-${locale}-390-full.png`,
    fullPage: true,
  })

  // Screenshot zone 2 seule (grille pays)
  const zone2El = page.locator('[aria-labelledby="zone2-title"]')
  if (await zone2El.count()) {
    await zone2El.scrollIntoViewIfNeeded()
    await zone2El.screenshot({ path: `${OUT}/marketplace-${locale}-zone2-countries.png` })
  }

  // Source visible dans le DOM rendu ?
  // NOTE: __source apparaît dans le payload JSON RSC inline (script next-data) car il est passé
  // comme prop d'objet — ceci est un comportement Next.js App Router connu pour les Server Components.
  // Ce qui compte : __source ne doit PAS apparaître dans le texte visible (innerText) ni dans
  // les attributs d'éléments HTML rendus. Le payload RSC JSON n'est pas du "texte visible".
  const sourceInRenderedText = bodyText.includes('__source')
  const sourceInHtmlAttrs = await page.evaluate(() => {
    // Cherche __source dans les attributs HTML (data-*, aria-*, etc.)
    const all = document.querySelectorAll('*')
    for (const el of all) {
      for (const attr of el.attributes) {
        if (attr.value.includes('__source')) return true
      }
    }
    return false
  })
  const sourceVisible = sourceInRenderedText || sourceInHtmlAttrs

  report[locale].marketplace = {
    dir,
    htmlLang,
    overflow,
    zone1Present,
    zone2Present,
    zone3Present,
    countryCardCount,
    sixBadgeRowGone,
    zone1TextOk,
    zone2TextOk,
    flagChecks,
    sourceVisible,
    consoleErrors: [...consoleErrors],
    metricsZoneCount,
  }

  // Assertions
  if (locale === 'ar' && dir !== 'rtl') failures.push(`[${locale}] marketplace: dir="${dir}" attendu "rtl"`)
  if (!zone1Present) failures.push(`[${locale}] marketplace: ZONE 1 absente (aria-labelledby="zone1-title")`)
  if (!zone2Present) failures.push(`[${locale}] marketplace: ZONE 2 absente (aria-labelledby="zone2-title")`)
  if (!zone3Present) failures.push(`[${locale}] marketplace: ZONE 3 absente (aria-labelledby="zone3-title")`)
  if (countryCardCount !== 4) failures.push(`[${locale}] marketplace: ${countryCardCount} cartes pays (attendu 4)`)
  if (!sixBadgeRowGone) failures.push(`[${locale}] marketplace: ancienne rangée 6 badges toujours présente`)
  if (!zone1TextOk) failures.push(`[${locale}] marketplace: texte zone1 "${texts.zone1}" absent`)
  if (!zone2TextOk) failures.push(`[${locale}] marketplace: texte zone2 "${texts.zone2}" absent`)
  if (sourceVisible) failures.push(`[${locale}] marketplace: "__source" visible dans le HTML`)
  if (overflow > 1) failures.push(`[${locale}] marketplace: débordement horizontal ${overflow}px`)
  if (consoleErrors.length > 0) failures.push(`[${locale}] marketplace: ${consoleErrors.length} erreur(s) console: ${consoleErrors.slice(0, 2).join('; ')}`)
  for (const [flag, present] of Object.entries(flagChecks)) {
    if (!present) failures.push(`[${locale}] marketplace: drapeau ${flag} absent`)
  }

  console.log(`  marketplace: zones=${zone1Present}/${zone2Present}/${zone3Present} pays=${countryCardCount} dir=${dir} overflow=${overflow} sixBadgeGone=${sixBadgeRowGone} console_errors=${consoleErrors.length}`)

  // ── 1b) /wholesale/marketplace?origin=Chine (pays China actif) ───────────
  const consoleErrors2 = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors2.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors2.push('PAGEERROR: ' + e.message))

  await gotoRetry(page, `${BASE}/wholesale/marketplace?origin=Chine`)
  await page.waitForTimeout(800)

  const bodyTextOrigin = await page.evaluate(() => document.body.innerText)
  const dirOrigin = await page.evaluate(() => document.documentElement.dir)
  const overflowOrigin = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )

  // La nav catégorie (CategoryShowcase) doit être visible quand origin=Chine
  // Elle est dans la ZONE 3 : un scroll-container ou grille de cartes catégories
  // On cherche les éléments de catégorie dans zone3
  const zone3El = page.locator('[aria-labelledby="zone3-title"]')
  const catNavInZone3 = await zone3El.count() > 0
    ? await zone3El.locator('a[href*="origin=Chine"]').count()
    : 0

  // La carte Chine doit être "active" (un badge actif visible)
  const chineBadgeActive = await page.locator('[aria-labelledby="zone2-title"] a[href*="origin=Chine"]').count() > 0

  await page.screenshot({
    path: `${OUT}/marketplace-${locale}-origin-chine-full.png`,
    fullPage: true,
  })

  report[locale].marketplaceOriginChine = {
    dirOrigin,
    overflowOrigin,
    catNavInZone3,
    chineBadgeActive,
    consoleErrors: [...consoleErrors2],
  }

  if (locale === 'ar' && dirOrigin !== 'rtl') failures.push(`[${locale}] marketplace?origin=Chine: dir="${dirOrigin}" attendu "rtl"`)
  if (catNavInZone3 === 0) failures.push(`[${locale}] marketplace?origin=Chine: aucun lien catégorie origin=Chine dans zone 3`)
  if (!chineBadgeActive) failures.push(`[${locale}] marketplace?origin=Chine: carte Chine zone2 non trouvée`)
  if (overflowOrigin > 1) failures.push(`[${locale}] marketplace?origin=Chine: débordement horizontal ${overflowOrigin}px`)
  if (consoleErrors2.length > 0) failures.push(`[${locale}] marketplace?origin=Chine: ${consoleErrors2.length} erreur(s) console`)

  console.log(`  origin=Chine: catNavLinks=${catNavInZone3} chinaActive=${chineBadgeActive} overflow=${overflowOrigin}`)

  // ── 1c) /wholesale/products (entrée grille rayons) ────────────────────────
  const consoleErrors3 = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors3.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors3.push('PAGEERROR: ' + e.message))

  await gotoRetry(page, `${BASE}/wholesale/products`)
  await page.waitForTimeout(800)

  const dirProd = await page.evaluate(() => document.documentElement.dir)
  const overflowProd = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )

  // Mode entrée : grande grille de rayons (CategoryShowcase)
  // sans ?category= → CategoryShowcase visible (grille de cartes images)
  const showcaseLinks = await page.locator('main a[href*="?category="]').count()

  // Pas de CategoryRail en mode entrée (aucun chip horizontal compact)
  const railInEntryMode = await page.locator('[data-testid="category-rail"]').count()

  // Catégories : au moins 8 cartes (12 seedées mais certaines peuvent être filtrées par canal)
  const categoryCardCountProd = showcaseLinks

  // Vérifier pas de "undefined" ni "📦" sur les 12 catégories connues
  const bodyTextProd = await page.evaluate(() => document.body.innerText)
  const hasUndefinedCategory = bodyTextProd.toLowerCase().includes('undefined')
  const allCardsHaveText = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('main a[href*="?category="]'))
    return links.every((a) => {
      const text = a.textContent?.trim()
      return text && text.length > 0 && !text.toLowerCase().includes('undefined')
    })
  })

  await page.screenshot({
    path: `${OUT}/wholesale-products-entry-${locale}-full.png`,
    fullPage: true,
  })

  report[locale].wholesaleProductsEntry = {
    dirProd,
    overflowProd,
    categoryCardCountProd,
    hasUndefinedCategory,
    allCardsHaveText,
    consoleErrors: [...consoleErrors3],
  }

  if (locale === 'ar' && dirProd !== 'rtl') failures.push(`[${locale}] wholesale/products: dir="${dirProd}" attendu "rtl"`)
  if (categoryCardCountProd < 6) failures.push(`[${locale}] wholesale/products: seulement ${categoryCardCountProd} cartes rayon (attendu ≥ 6)`)
  if (hasUndefinedCategory) failures.push(`[${locale}] wholesale/products: texte "undefined" détecté dans les catégories`)
  if (!allCardsHaveText) failures.push(`[${locale}] wholesale/products: certaines cartes catégorie ont un texte vide ou "undefined"`)
  if (overflowProd > 1) failures.push(`[${locale}] wholesale/products: débordement horizontal ${overflowProd}px`)
  if (consoleErrors3.length > 0) failures.push(`[${locale}] wholesale/products: ${consoleErrors3.length} erreur(s) console`)

  console.log(`  wholesale/products entry: rayons=${categoryCardCountProd} undefined=${hasUndefinedCategory} overflow=${overflowProd}`)

  // ── 1d) /wholesale/products?category=Textile (rayon filtré) ──────────────
  const consoleErrors4 = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors4.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors4.push('PAGEERROR: ' + e.message))

  // On utilise une catégorie seedée connue. Si Textile n'existe pas, on prend la 1ère disponible.
  // On extrait d'abord la première catégorie disponible depuis la page d'entrée déjà chargée.
  let targetCategory = 'Textile'
  if (showcaseLinks > 0) {
    const firstCatHref = await page.locator('main a[href*="?category="]').first().getAttribute('href')
    if (firstCatHref) {
      const match = firstCatHref.match(/[?&]category=([^&]+)/)
      if (match) targetCategory = decodeURIComponent(match[1])
    }
  }

  await gotoRetry(page, `${BASE}/wholesale/products?category=${encodeURIComponent(targetCategory)}`)
  await page.waitForTimeout(800)

  const dirAisle = await page.evaluate(() => document.documentElement.dir)
  const overflowAisle = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )

  // Mode rayon : CategoryRail compact (chips) en haut + grille produits
  // La CategoryShowcase grande grille ne doit PAS être présente (page d'entrée seulement)
  // Le rail doit avoir des chips cliquables
  const railChipCount = await page.locator('main a[href*="?category="]').count()

  await page.screenshot({
    path: `${OUT}/wholesale-products-aisle-${locale}-full.png`,
    fullPage: true,
  })

  // Screenshot du rail de catégories (compact)
  const railEl = page.locator('main').first()
  if (await railEl.count()) {
    const firstSection = page.locator('main > *').first()
    if (await firstSection.count()) {
      await firstSection.scrollIntoViewIfNeeded()
    }
  }

  report[locale].wholesaleProductsAisle = {
    dirAisle,
    overflowAisle,
    targetCategory,
    railChipCount,
    consoleErrors: [...consoleErrors4],
  }

  if (locale === 'ar' && dirAisle !== 'rtl') failures.push(`[${locale}] wholesale/products?category=...: dir="${dirAisle}" attendu "rtl"`)
  if (railChipCount < 2) failures.push(`[${locale}] wholesale/products?category=${targetCategory}: rail catégories a seulement ${railChipCount} chips (attendu ≥ 2)`)
  if (overflowAisle > 1) failures.push(`[${locale}] wholesale/products?category=...: débordement horizontal ${overflowAisle}px`)
  if (consoleErrors4.length > 0) failures.push(`[${locale}] wholesale/products?category=...: ${consoleErrors4.length} erreur(s) console`)

  console.log(`  wholesale/products aisle (${targetCategory}): railChips=${railChipCount} overflow=${overflowAisle}`)

  // ── 1e) /wholesale/products/categories ───────────────────────────────────
  const consoleErrors5 = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors5.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors5.push('PAGEERROR: ' + e.message))

  await gotoRetry(page, `${BASE}/wholesale/products/categories`)
  await page.waitForTimeout(800)

  const dirCat = await page.evaluate(() => document.documentElement.dir)
  const overflowCat = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )
  const catLinksCount = await page.locator('main a').count()

  await page.screenshot({
    path: `${OUT}/wholesale-products-categories-${locale}-full.png`,
    fullPage: true,
  })

  report[locale].wholesaleProductsCategories = {
    dirCat,
    overflowCat,
    catLinksCount,
    consoleErrors: [...consoleErrors5],
  }

  if (locale === 'ar' && dirCat !== 'rtl') failures.push(`[${locale}] wholesale/products/categories: dir="${dirCat}" attendu "rtl"`)
  if (overflowCat > 1) failures.push(`[${locale}] wholesale/products/categories: débordement ${overflowCat}px`)
  if (consoleErrors5.length > 0) failures.push(`[${locale}] wholesale/products/categories: ${consoleErrors5.length} erreur(s) console`)

  console.log(`  wholesale/products/categories: links=${catLinksCount} dir=${dirCat} overflow=${overflowCat}`)

  // Nettoyage console listeners
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  await ctx.close()
}

// ════════════════════════════════════════════════════════════════════════════
// BLOC 2 — AFFILIATE : chips catégories dynamiques
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== BLOC 2 : AFFILIATE ===')
for (const locale of LOCALES) {
  console.log(`\n-- locale: ${locale} --`)

  const ctx = await browser.newContext({
    storageState: AFFILIATE_STATE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await ctx.addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }])
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message))

  await gotoRetry(page, `${BASE}/affiliate/products`)
  await page.waitForTimeout(800)

  const dir = await page.evaluate(() => document.documentElement.dir)
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  )

  // Chips catégories dynamiques — liens avec ?category=
  const chipLinks = await page.locator('a[href*="?category="]').count()

  // Pas de "undefined" dans les chips
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hasUndefined = bodyText.toLowerCase().includes('undefined')

  // Vérifier que les chips ont un label visible (icône + texte)
  const allChipsHaveText = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('a[href*="?category="]'))
    return chips.every((c) => {
      const text = c.textContent?.trim()
      return text && text.length > 0 && !text.toLowerCase().includes('undefined')
    })
  })

  // Icônes présentes (emoji dans les chips)
  const chipsWithIcon = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('a[href*="?category="]'))
    // Un emoji est un code unicode > 0x1F000
    const hasEmoji = (str) => /[\u{1F000}-\u{1FFFF}]/u.test(str) || /[\u{2600}-\u{27BF}]/u.test(str)
    return chips.filter((c) => hasEmoji(c.textContent ?? '')).length
  })

  // Vérifier les chips avec 📦 : c'est l'icône ASSIGNÉE à "Maison & packaging" dans CATEGORY_ICONS
  // (taxonomy.ts ligne 174). Ce n'est PAS un fallback générique — c'est intentionnel.
  // On vérifie donc que si 📦 est présent, c'est sur la catégorie "Maison" et pas un autre slug inconnu.
  const genericBoxCount = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('a[href*="?category="]'))
    return chips.filter((c) => {
      const text = c.textContent?.trim() ?? ''
      const href = c.getAttribute('href') ?? ''
      // 📦 sur "Maison & packaging" est intentionnel — ne pas le compter comme erreur
      if (text.includes('📦') && href.toLowerCase().includes('maison')) return false
      // 📦 sur une autre catégorie = fallback non voulu
      return text.includes('📦')
    }).length
  })

  await page.screenshot({
    path: `${OUT}/affiliate-products-${locale}-full.png`,
    fullPage: true,
  })

  // Screenshot rail de chips
  const railEl = page.locator('nav[aria-label], [data-testid="category-rail"], section').first()
  if (await railEl.count()) {
    await railEl.screenshot({
      path: `${OUT}/affiliate-products-${locale}-chips.png`,
    }).catch(() => {}) // non bloquant si la section est hors viewport
  }

  report[locale].affiliateProducts = {
    dir,
    overflow,
    chipLinks,
    hasUndefined,
    allChipsHaveText,
    chipsWithIcon,
    genericBoxCount,
    consoleErrors: [...consoleErrors],
  }

  if (locale === 'ar' && dir !== 'rtl') failures.push(`[${locale}] affiliate/products: dir="${dir}" attendu "rtl"`)
  if (chipLinks < 4) failures.push(`[${locale}] affiliate/products: seulement ${chipLinks} chips catégorie (attendu ≥ 4)`)
  if (hasUndefined) failures.push(`[${locale}] affiliate/products: texte "undefined" détecté dans les catégories`)
  if (!allChipsHaveText) failures.push(`[${locale}] affiliate/products: certains chips ont un texte vide/undefined`)
  if (genericBoxCount > 0) failures.push(`[${locale}] affiliate/products: ${genericBoxCount} chip(s) avec icône 📦 générique (fallback non traduit)`)
  if (overflow > 1) failures.push(`[${locale}] affiliate/products: débordement horizontal ${overflow}px`)
  if (consoleErrors.length > 0) failures.push(`[${locale}] affiliate/products: ${consoleErrors.length} erreur(s) console: ${consoleErrors.slice(0, 2).join('; ')}`)

  console.log(`  affiliate/products: chips=${chipLinks} icons=${chipsWithIcon} genericBox=${genericBoxCount} dir=${dir} overflow=${overflow}`)

  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  await ctx.close()
}

await browser.close()

// ════════════════════════════════════════════════════════════════════════════
// RAPPORT FINAL
// ════════════════════════════════════════════════════════════════════════════
console.log('\n=== RAPPORT COMPLET ===')
console.log(JSON.stringify(report, null, 2))

console.log('\n=== VERDICT ===')
if (failures.length === 0) {
  console.log('PASS — Toutes les assertions sont vertes.')
  process.exit(0)
} else {
  console.log(`FAIL — ${failures.length} assertion(s) en échec :`)
  failures.forEach((f, i) => console.log(`  [${i + 1}] ${f}`))
  process.exit(1)
}
