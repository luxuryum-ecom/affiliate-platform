/**
 * Config Playwright dédiée aux captures du registre livreurs
 * (/admin/couriers + /admin/couriers/[id]) en FR/AR.
 *
 * GARDE-FOU RÈGLE #8 : ce spec NAVIGUE sur des pages liées à des données seedées
 * en LOCAL. Le serveur de test est forcé sur le Supabase LOCAL (identifiants lus
 * via « supabase status »), JAMAIS sur .env.local / la prod.
 *
 * Pré-requis : « supabase start » + « node scripts/seed-couriers-captures-local.mjs --seed »
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv() // local-only garanti, sinon throw

const PORT = 3301 // port dédié — n'entre pas en collision avec 3000/3200/3300
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /couriers-captures\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-couriers' }]],
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
      name: 'couriers-captures',
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
