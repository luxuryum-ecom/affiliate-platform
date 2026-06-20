// qa-run.mjs
import { chromium } from '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const PROOF_DIR = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/.mobile-proofs';
const AUTH_DIR = '/Users/abderrahimbougjdi/AI-FACTORY/affiliate-platform/e2e/.auth';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const results = [];

function log(test, status, details) {
  results.push({ test, status, details });
  console.log(`[${status}] ${test}:`, JSON.stringify(details, null, 2));
}

async function setLocale(page, locale) {
  await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }]);
}

async function checkNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const ok = result.scrollWidth <= result.innerWidth;
  log(`overflow-${label}`, ok ? 'PASS' : 'FAIL', result);
  return ok;
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Load auth states
  const affiliateAuth = fs.existsSync(`${AUTH_DIR}/affiliate.json`) ? JSON.parse(fs.readFileSync(`${AUTH_DIR}/affiliate.json`, 'utf8')) : null;
  const wholesaleAuth = fs.existsSync(`${AUTH_DIR}/wholesale.json`) ? JSON.parse(fs.readFileSync(`${AUTH_DIR}/wholesale.json`, 'utf8')) : null;

  console.log('Auth files:', { affiliate: !!affiliateAuth, wholesale: !!wholesaleAuth });

  // =========== P1 — Catalogue affilié ===========
  console.log('\n=== P1 — Catalogue affilié /affiliate/products ===');

  let firstProductId = null;
  let affiliateId = null;

  for (const [locale, viewport, suffix] of [
    ['fr', MOBILE, 'p1-affilie-catalogue-fr-mobile'],
    ['ar', MOBILE, 'p1-affilie-catalogue-ar-mobile'],
    ['en', MOBILE, 'p1-affilie-catalogue-en-mobile'],
    ['fr', DESKTOP, 'p1-affilie-catalogue-fr-desktop'],
  ]) {
    const ctx = await browser.newContext({
      viewport,
      storageState: affiliateAuth || undefined,
    });
    const page = await ctx.newPage();
    await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }]);

    await page.goto(`${BASE}/affiliate/products`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check RTL for AR
    if (locale === 'ar') {
      const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
      log(`P1-rtl-${suffix}`, dir === 'rtl' ? 'PASS' : 'FAIL', { dir });
    }

    // Count cards per row using bounding boxes
    const cards = await page.$$('a[href^="/affiliate/products/"]');
    const boxes = [];
    for (const card of cards) {
      const box = await card.boundingBox();
      if (box) boxes.push(box);
    }

    if (boxes.length > 0) {
      const firstY = Math.round(boxes[0].y);
      const firstRowCards = boxes.filter(b => Math.abs(Math.round(b.y) - firstY) < 20);
      const cardsPerRow = firstRowCards.length;
      const isMobile = viewport.width === 390;
      const expectedCols = isMobile ? 2 : 4;
      log(`P1-cards-per-row-${suffix}`, cardsPerRow === expectedCols ? 'PASS' : 'FAIL', { cardsPerRow, expected: expectedCols, totalCards: boxes.length });

      // Grab first product ID from first card href
      if (!firstProductId && locale === 'fr') {
        const href = await cards[0].getAttribute('href');
        firstProductId = href?.split('/').pop();
        console.log('firstProductId:', firstProductId);
      }
    } else {
      log(`P1-cards-per-row-${suffix}`, 'FAIL', { error: 'no cards found' });
    }

    // Check CTA button
    const cta = await page.$('[class*="bg-primary"]');
    if (cta) {
      const ctaBox = await cta.boundingBox();
      const ctaText = await cta.innerText().catch(() => '');
      log(`P1-cta-${suffix}`, ctaBox && ctaBox.height >= 44 ? 'PASS' : 'FAIL', { height: ctaBox?.height, text: ctaText });
    } else {
      // Try alternative selector
      const ctaAlt = await page.$('a[href^="/affiliate/products/"] button, a[href^="/affiliate/products/"] [class*="btn"]');
      log(`P1-cta-${suffix}`, 'FAIL', { error: 'CTA bg-primary not found', altFound: !!ctaAlt });
    }

    // Check #5 commission block color
    const commissionEl = await page.$('[class*="text-yellow"], [class*="text-amber"], [class*="bg-yellow"], [class*="bg-amber"]');
    log(`P1-commission-block-${suffix}`, commissionEl ? 'PASS' : 'INFO', { found: !!commissionEl });

    // Check no overflow (mobile only)
    if (viewport.width === 390) {
      await checkNoHorizontalOverflow(page, `P1-${locale}-mobile`);
    }

    await page.screenshot({ path: `${PROOF_DIR}/${suffix}.png`, fullPage: false });
    console.log(`Screenshot saved: ${suffix}.png`);

    await ctx.close();
  }

  // =========== P2 — Fiche affilié ===========
  console.log('\n=== P2 — Fiche affilié /affiliate/products/[id] ===');

  if (firstProductId) {
    for (const [locale, suffix] of [['fr', 'p2-affilie-fiche-fr-mobile'], ['ar', 'p2-affilie-fiche-ar-mobile']]) {
      const ctx = await browser.newContext({
        viewport: MOBILE,
        storageState: affiliateAuth || undefined,
      });
      const page = await ctx.newPage();
      await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }]);

      await page.goto(`${BASE}/affiliate/products/${firstProductId}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Check 2x2 stats grid
      const statCells = await page.$$('[class*="grid"] > div, [class*="stats"] > div, dl > div, [role="group"] > div');
      const statBoxes = [];
      for (const cell of statCells.slice(0, 8)) {
        const box = await cell.boundingBox();
        if (box && box.width > 50) statBoxes.push(box);
      }

      if (statBoxes.length >= 4) {
        const firstY = Math.round(statBoxes[0].y);
        const secondY = Math.round(statBoxes[1].y);
        const thirdY = Math.round(statBoxes[2].y);
        const sameFirstRow = Math.abs(firstY - secondY) < 10;
        const differentSecondRow = Math.abs(firstY - thirdY) >= 10;
        log(`P2-stats-2x2-${locale}`, sameFirstRow && differentSecondRow ? 'PASS' : 'WARN', {
          y0: statBoxes[0]?.y, y1: statBoxes[1]?.y, y2: statBoxes[2]?.y, y3: statBoxes[3]?.y,
          cellCount: statBoxes.length,
        });
      } else {
        log(`P2-stats-2x2-${locale}`, 'WARN', { cellsFound: statBoxes.length, note: 'Could not verify 2x2 grid' });
      }

      await checkNoHorizontalOverflow(page, `P2-${locale}`);

      await page.screenshot({ path: `${PROOF_DIR}/${suffix}.png`, fullPage: false });
      console.log(`Screenshot saved: ${suffix}.png`);

      await ctx.close();
    }
  } else {
    log('P2-fiche', 'FAIL', { error: 'No firstProductId found from P1' });
  }

  // =========== P3 — Fiche publique ===========
  console.log('\n=== P3 — Fiche produit publique /products/[id] ===');

  if (firstProductId) {
    for (const [locale, suffix] of [['fr', 'p3-public-fiche-fr-mobile'], ['ar', 'p3-public-fiche-ar-mobile']]) {
      const ctx = await browser.newContext({ viewport: MOBILE });
      const page = await ctx.newPage();
      await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }]);

      await page.goto(`${BASE}/products/${firstProductId}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Check stock badge text
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (locale === 'fr') {
        const hasStockMaroc = bodyText.includes('Stock Maroc') || bodyText.includes('stock Maroc');
        const hasOldLabel = bodyText.includes('Stock local Maroc') || bodyText.includes('local');
        log(`P3-stock-badge-fr`, hasStockMaroc && !hasOldLabel ? 'PASS' : 'FAIL', {
          hasStockMaroc,
          hasOldLabel,
          snippet: bodyText.substring(0, 500),
        });
      } else {
        // AR — check badge exists (translated)
        const badgeEls = await page.$$('[class*="badge"], [class*="chip"], [class*="tag"]');
        log(`P3-stock-badge-ar`, badgeEls.length > 0 ? 'PASS' : 'WARN', { badgeCount: badgeEls.length });
      }

      await checkNoHorizontalOverflow(page, `P3-${locale}`);

      await page.screenshot({ path: `${PROOF_DIR}/${suffix}.png`, fullPage: false });
      console.log(`Screenshot saved: ${suffix}.png`);

      await ctx.close();
    }
  } else {
    log('P3-public', 'FAIL', { error: 'No firstProductId found' });
  }

  // =========== P4 — Sélecteur activité wholesale ===========
  console.log('\n=== P4 — Sélecteur activité /wholesale/marketplace/[id] ===');

  // Get first wholesale product ID
  let wholesaleProductId = null;
  {
    const ctx = await browser.newContext({
      viewport: MOBILE,
      storageState: wholesaleAuth || undefined,
    });
    const page = await ctx.newPage();
    await page.context().addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }]);
    await page.goto(`${BASE}/wholesale/marketplace`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const links = await page.$$('a[href^="/wholesale/marketplace/"]');
    if (links.length > 0) {
      const href = await links[0].getAttribute('href');
      wholesaleProductId = href?.split('/').pop();
      console.log('wholesaleProductId:', wholesaleProductId);
    }
    await ctx.close();
  }

  const frenchOptions = ['Boutique physique', 'Revendeur actif', 'E-commerce', 'Distributeur', 'Importateur', 'Petit volume', 'Volume moyen', 'Gros volume'];

  if (wholesaleProductId) {
    for (const [locale, suffix] of [['ar', 'p4-selecteur-activite-ar-mobile'], ['en', 'p4-selecteur-activite-en-mobile']]) {
      const ctx = await browser.newContext({
        viewport: MOBILE,
        storageState: wholesaleAuth || undefined,
      });
      const page = await ctx.newPage();
      await page.context().addCookies([{ name: 'LOCALE', value: locale, domain: 'localhost', path: '/' }]);

      await page.goto(`${BASE}/wholesale/marketplace/${wholesaleProductId}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Try to open the quote form
      const ctaBtn = await page.$('button[class*="primary"], button[class*="cta"], [data-testid="quote-cta"], button:has-text("Demander"), button:has-text("Quote"), button:has-text("عرض"), button:has-text("Request")');
      if (ctaBtn) {
        await ctaBtn.click();
        await page.waitForTimeout(1000);
      }

      // Check select options
      const profileSelect = await page.$('select[name="buyer_purchase_profile"]');
      const volumeSelect = await page.$('select[name="buyer_volume_tier"]');

      if (profileSelect) {
        const profileOptions = await profileSelect.evaluate(el =>
          Array.from(el.options).map(o => o.text)
        );
        const hasFrenchOption = profileOptions.some(o => frenchOptions.some(f => o.includes(f)));
        log(`P4-profile-select-${locale}`, !hasFrenchOption ? 'PASS' : 'FAIL', { options: profileOptions, hasFrenchOption });
      } else {
        log(`P4-profile-select-${locale}`, 'WARN', { error: 'select[name=buyer_purchase_profile] not found' });
      }

      if (volumeSelect) {
        const volumeOptions = await volumeSelect.evaluate(el =>
          Array.from(el.options).map(o => o.text)
        );
        const hasFrenchOption = volumeOptions.some(o => frenchOptions.some(f => o.includes(f)));
        log(`P4-volume-select-${locale}`, !hasFrenchOption ? 'PASS' : 'FAIL', { options: volumeOptions, hasFrenchOption });
      } else {
        log(`P4-volume-select-${locale}`, 'WARN', { error: 'select[name=buyer_volume_tier] not found' });
      }

      await page.screenshot({ path: `${PROOF_DIR}/${suffix}.png`, fullPage: false });
      console.log(`Screenshot saved: ${suffix}.png`);

      await ctx.close();
    }
  } else {
    log('P4-selecteur', 'FAIL', { error: 'No wholesale product ID found' });
  }

  // =========== P5 — Marketplace Stock Maroc ===========
  console.log('\n=== P5 — Marketplace /wholesale/marketplace ===');

  {
    const ctx = await browser.newContext({
      viewport: MOBILE,
      storageState: wholesaleAuth || undefined,
    });
    const page = await ctx.newPage();
    await page.context().addCookies([{ name: 'LOCALE', value: 'fr', domain: 'localhost', path: '/' }]);

    await page.goto(`${BASE}/wholesale/marketplace`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Check "Stock Maroc" appears, not "Stock local Maroc"
    const hasStockMaroc = bodyText.includes('Stock Maroc');
    const hasLocalLabel = bodyText.toLowerCase().includes('stock local') || bodyText.toLowerCase().includes('local maroc');

    log('P5-stock-maroc-label', hasStockMaroc && !hasLocalLabel ? 'PASS' : 'FAIL', {
      hasStockMaroc,
      hasLocalLabel,
      snippet: bodyText.substring(0, 800),
    });

    await page.screenshot({ path: `${PROOF_DIR}/p5-marketplace-stockmaroc-fr-mobile.png`, fullPage: false });
    console.log('Screenshot saved: p5-marketplace-stockmaroc-fr-mobile.png');

    await ctx.close();
  }

  // =========== SUMMARY ===========
  await browser.close();

  console.log('\n========== QA SUMMARY ==========');
  for (const r of results) {
    console.log(`[${r.status}] ${r.test}`);
  }

  // Write results JSON
  fs.writeFileSync(`${PROOF_DIR}/results.json`, JSON.stringify(results, null, 2));
  console.log('\nResults saved to .mobile-proofs/results.json');
  console.log('Screenshots saved to .mobile-proofs/');
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
