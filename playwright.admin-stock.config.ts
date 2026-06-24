/**
 * Config Playwright dédiée au spec admin-stock (feature WMS-1 admin UI).
 *
 * GARDE-FOU CAUSE RACINE (incident 2026-06-24) : ce spec ÉCRIT en base.
 * Le serveur de test est donc FORCÉ sur le Supabase LOCAL (identifiants lus via
 * « supabase status »), JAMAIS sur .env.local / la prod. On lance « next dev »
 * (et non « next start ») pour que les variables NEXT_PUBLIC_* soient prises au
 * runtime depuis l'env local injecté, sans dépendre d'un build figé sur la prod.
 * reuseExistingServer = false : on ne se branche jamais sur un serveur déjà lancé
 * (qui pourrait pointer sur la prod).
 *
 * Pré-requis : « supabase start » (sinon getLocalSupabaseEnv lève « REFUS … »).
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv() // local-only garanti, sinon throw

const PORT = 3100 // port dédié au test local — n'entre pas en collision avec un dev sur 3000
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /admin-stock\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-admin-stock' }]],
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    video: 'off',
  },

  projects: [
    {
      name: 'admin-stock',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `./node_modules/.bin/next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Force l'app de test sur le Supabase LOCAL (surcharge .env.local : Next ne
    // réécrit pas une variable déjà présente dans process.env).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
