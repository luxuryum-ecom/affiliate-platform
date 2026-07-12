/**
 * Config Playwright — captures du Lot G « Agent Gardien » : cockpit desktop
 * /admin/guardian (FR/AR) + écrans mobiles /admin/couriers/{reception,inventory}
 * en viewport 390×844 (règle gravée).
 *
 * GARDE-FOU RÈGLE #8 : serveur de test forcé sur le Supabase LOCAL (clés lues via
 * « supabase status »), JAMAIS .env.local / la prod.
 * Pré-requis : « supabase start » + « node scripts/seed-guardian-captures-local.mjs --seed »
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv()
const PORT = 3310
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /guardian-captures\.spec\.ts/,
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
  projects: [{ name: 'guardian-captures', use: { ...devices['Desktop Chrome'] } }],
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
