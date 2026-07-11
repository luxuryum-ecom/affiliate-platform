/**
 * Config Playwright — captures Lot F (relevés PDF) : formulaire payout (méthode),
 * fiche livreur (section relevés signables), espace affilié « Mes relevés », FR/AR.
 *
 * GARDE-FOU RÈGLE #8 : next dev forcé sur le Supabase LOCAL (jamais .env.local/prod).
 * Pré-requis : « supabase start » + « node scripts/seed-lot-f-captures-local.mjs ».
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv()
const PORT = 3302
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /lot-f-captures\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
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
  projects: [{ name: 'lot-f-captures', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `./node_modules/.bin/next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
