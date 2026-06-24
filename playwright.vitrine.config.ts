/**
 * Config Playwright dédiée aux preuves vitrine (QA runtime).
 * Réutilise les storageState existants (e2e/.auth/).
 *
 * DURCISSEMENT SÉCURITÉ (incident 2026-06-24) : le spec crée/supprime des données via
 * service_role ET agit via l'UI (approbation admin → création miroir). Le serveur app est
 * FORCÉ sur le Supabase LOCAL (next dev + env local injecté + reuseExistingServer:false +
 * port dédié) → aucune écriture ne peut toucher la prod. La connexion service_role du spec
 * est elle aussi locale (getLocalSupabaseEnv). loadEnvLocal ne sert qu'aux SMOKE_*.
 */
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

const PORT = 3204
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /vitrine-proofs\.spec\.ts/,
  fullyParallel: false, // séquentiel : les tests partagent des données créées dans beforeAll
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-vitrine' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'vitrine',
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
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL.serviceKey,
    },
  },
})
