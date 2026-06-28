/**
 * Config Playwright — Réserve R3 : garde FSM updateOrderStatus anti-double-comptage.
 *
 * GARDE-FOU RÈGLE #8 : cible EXCLUSIVEMENT le Supabase LOCAL (127.0.0.1:54321).
 * JAMAIS sur .env.local / la prod.
 *
 * Pré-requis :
 *   1. supabase start
 *   2. npx playwright test --config=playwright.r3.config.ts
 *      (le seed est inline dans le spec beforeAll)
 */
import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

const LOCAL = getLocalSupabaseEnv()

const PORT = 3302 // port dédié R3
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /etape7-r3-fsm-guard\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-r3' }]],
  timeout: 180_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    video: 'off',
  },

  projects: [
    {
      name: 'r3',
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
    // Force l'app de test sur le Supabase LOCAL.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
