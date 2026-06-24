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

const PORT = 3202
const BASE_URL = `http://localhost:${PORT}`

/**
 * Config DÉDIÉE au lot "durcissement go-live beta" (opt-in, hors `pnpm smoke`).
 *
 * DURCISSEMENT SÉCURITÉ (incident 2026-06-24) : le spec mute la base (compte pending de
 * test, upsert service_role) et agit via l'UI. Le serveur app est FORCÉ sur le Supabase
 * LOCAL (next dev + env local injecté + reuseExistingServer:false + port dédié) → aucune
 * écriture (UI ou service_role) ne peut toucher la prod. loadEnvLocal ne sert qu'aux SMOKE_*.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /durcissement-beta\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-durcissement', open: 'never' }]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
