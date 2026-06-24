/**
 * Configuration Playwright dédiée aux tests sourcing-affectation.
 *
 * DURCISSEMENT SÉCURITÉ (incident 2026-06-24) : le serveur app de test est FORCÉ sur
 * le Supabase LOCAL — les écritures déclenchées via l'UI ne peuvent JAMAIS toucher la prod.
 *   • getLocalSupabaseEnv() : fail-fast (« REFUS … ») si le local n'est pas dispo.
 *   • webServer.env injecte l'URL/anon/service LOCAUX → surcharge .env.local (Next ne
 *     réécrit pas une variable déjà présente dans process.env).
 *   • next dev (et non next start) → NEXT_PUBLIC_* pris au runtime, pas figés sur un build prod.
 *   • reuseExistingServer:false → jamais de réutilisation muette d'un serveur pointé prod.
 *   • port DÉDIÉ → pas de collision avec un dev sur :3000 ; le spec aligne son BASE_URL dessus.
 * loadEnvLocal() est conservé UNIQUEMENT pour les mots de passe des comptes test (SMOKE_*),
 * qui ne sont pas la connexion base ; la connexion Supabase est forcée locale ci-dessus.
 *
 * Usage : npx playwright test --config=playwright.sourcing.config.ts
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

const PORT = 3201
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: /sourcing-affectation\.spec\.ts/,
  fullyParallel: false, // Tests dépendants d'un état partagé en base → sériel
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
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
      name: 'chromium',
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
