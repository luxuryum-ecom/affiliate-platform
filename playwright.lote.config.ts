/**
 * Config Playwright dédiée aux captures des écrans du Lot E (notifications,
 * module Livreurs) — `/courier` (dashboard mobile) en FR/AR + cloche admin
 * `/admin/dashboard` (desktop).
 *
 * GARDE-FOU RÈGLE #8 : ce spec NAVIGUE sur des pages liées à des données seedées
 * en LOCAL. Le serveur de test est forcé sur le Supabase LOCAL (identifiants lus
 * via « supabase status »), JAMAIS sur .env.local / la prod.
 *
 * RÈGLE CAPTURES : /courier/* = VIEWPORT MOBILE 390×844 (iPhone) ; écrans admin
 * = DESKTOP. Deux projets Playwright distincts ci-dessous.
 *
 * Pré-requis : « supabase start » + « node scripts/seed-lote-captures-local.mjs --seed »
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv() // local-only garanti, sinon throw

const PORT = 3305 // port dédié — n'entre pas en collision avec 3000/3200/3300-3304
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /lote-captures\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-lote' }]],
  timeout: 120_000,
  expect: { timeout: 25_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
    actionTimeout: 25_000,
    video: 'off',
  },

  projects: [
    {
      name: 'lote-mobile-courier',
      testMatch: /lote-captures\.spec\.ts/,
      grep: /@mobile/,
      use: {
        // Calque devices['iPhone 13'] côté viewport/touch/userAgent sans dépendre
        // du navigateur WebKit (souvent absent en local) — Chromium suffit pour
        // une capture d'écran mobile 390×844.
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
    {
      name: 'lote-desktop-admin',
      testMatch: /lote-captures\.spec\.ts/,
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `./node_modules/.bin/next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Force l'app de test sur le Supabase LOCAL (surcharge .env.local).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
