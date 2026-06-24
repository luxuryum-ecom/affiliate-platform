import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'
import { getLocalSupabaseEnv } from './e2e/assert-local-supabase'

loadEnvLocal() // mots de passe comptes test (SMOKE_*) uniquement
// Defense-in-depth : purge les vars de connexion PROD injectées par loadEnvLocal (inertes
// ici car non relues, mais on empêche tout futur helper e2e de les lire). Connexion = locale.
delete process.env.NEXT_PUBLIC_SUPABASE_URL
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
delete process.env.SUPABASE_SERVICE_ROLE_KEY
const LOCAL = getLocalSupabaseEnv() // connexion Supabase LOCALE garantie (sinon throw)

const PORT = 3203
const BASE_URL = `http://localhost:${PORT}`

/**
 * Config DÉDIÉE au LOT "rôles 2 étages".
 *
 * DURCISSEMENT SÉCURITÉ (incident 2026-06-24) : ce spec mute la base via l'UI
 * (confirmations de commandes, capacités). Le serveur app est donc FORCÉ sur le
 * Supabase LOCAL (next dev + env local injecté + reuseExistingServer:false + port dédié) :
 * les écritures via l'UI ne peuvent JAMAIS toucher la prod. La connexion service_role du
 * spec est elle aussi locale (getLocalSupabaseEnv). loadEnvLocal ne sert qu'aux SMOKE_*.
 *   Lancement : ./node_modules/.bin/playwright test --config=playwright.roles.config.ts
 *
 * Mobile RÉEL : chaque test fixe lui-même le viewport 390×844 (mobile-first).
 * Exécution SÉRIELLE (le spec partage l'état DB entre scénarios D→I).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /roles-2-etages-v2\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-roles', open: 'never' }]],
  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    ...devices['Desktop Chrome'],
  },

  webServer: {
    command: `./node_modules/.bin/next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
