import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';

const OUT = '.nav-proofs/lot-b2';
const BASE = 'http://localhost:3000';
const PRODUCT_ID = 'ecb39fab-e940-42e1-9f68-e7a41a00a929'; // Djellaba Homme Laine Fine

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
  console.log(`  ✓ ${name}`);
}

async function newPage(ctx) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') console.error('  [console error]', m.text()); });
  return p;
}

// ─── DESKTOP CONTEXT ────────────────────────────────────────────────
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// 1. Public product page FR
console.log('\n1. Public product page FR (desktop)');
{
  const page = await newPage(desktop);
  const url = `${BASE}/fr/products/${PRODUCT_ID}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(3000);
  await shot(page, '01-product-fr-desktop.png');
  // Scroll mid-page to capture variant selector / delivery block
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);
  await shot(page, '01b-product-fr-desktop-scroll.png');
  await page.close();
}

// 2. Public product page EN
console.log('\n2. Public product page EN (desktop)');
{
  const page = await newPage(desktop);
  const url = `${BASE}/en/products/${PRODUCT_ID}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(2000);
  await shot(page, '02-product-en-desktop.png');
  await page.close();
}

// 3. Public product page AR
console.log('\n3. Public product page AR/RTL (desktop)');
{
  const page = await newPage(desktop);
  const url = `${BASE}/ar/products/${PRODUCT_ID}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(2000);
  await shot(page, '03-product-ar-desktop.png');
  await page.close();
}

// 4. Wholesale products list (may redirect to login)
console.log('\n4. Wholesale products list (desktop)');
{
  const page = await newPage(desktop);
  const url = `${BASE}/fr/wholesale/products`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(2000);
  await shot(page, '04-wholesale-products-list.png');
  await page.close();
}

// 5. Wholesale marketplace
console.log('\n5. Wholesale marketplace (desktop)');
{
  const page = await newPage(desktop);
  const url = `${BASE}/fr/wholesale/marketplace`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(2000);
  await shot(page, '05-wholesale-marketplace.png');
  await page.close();
}

// ─── MOBILE CONTEXT ─────────────────────────────────────────────────
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });

// 6. Public product page FR mobile
console.log('\n6. Public product page FR (mobile 390px)');
{
  const page = await newPage(mobile);
  const url = `${BASE}/fr/products/${PRODUCT_ID}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('  status:', res?.status(), '| final URL:', page.url());
  await page.waitForTimeout(2000);
  await shot(page, '06-product-fr-mobile.png');
  await page.close();
}

await browser.close();
console.log('\n✅ All screenshots saved to', OUT);
