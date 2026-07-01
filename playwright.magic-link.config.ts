/**
 * playwright.magic-link.config.ts
 * Configuration dédiée à la validation e2e du LOT magic-link — onboarding fournisseur Telegram.
 *
 * SERVEUR : réutilise le `next dev` déjà en cours sur :3000 (LOCAL Supabase).
 *   reuseExistingServer: true — ne démarre PAS de nouveau serveur.
 *   IMPORTANT : le serveur doit avoir été démarré AVEC TELEGRAM_BOT_USERNAME=MozounaSupplierBot
 *   (ajouté dans .env.development.local). Redémarrer next dev si ce n'est pas le cas.
 *
 * GARANTIES LOCALS :
 *   - assertLocalSupabase() dans le spec refuse si l'URL REST Supabase n'est pas locale.
 *   - getLocalSupabaseEnv() lit les clés via `supabase status`, jamais .env.local.
 *   - Exécution SÉRIELLE (shared DB state entre les scénarios).
 *   - Teardown obligatoire : état DB identique à l'état initial.
 *
 * Lance : ./node_modules/.bin/playwright test --config=playwright.magic-link.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

export default defineConfig({
  testDir:       './e2e',
  testMatch:     /magic-link-supplier\.spec\.ts/,
  fullyParallel: false,
  workers:       1,
  retries:       0,
  forbidOnly:    !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-magic-link', open: 'never' }],
  ],
  timeout:  120_000,
  expect:   { timeout: 15_000 },

  use: {
    baseURL:           BASE_URL,
    trace:             'retain-on-failure',
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    navigationTimeout: 30_000,
    actionTimeout:     15_000,
    locale:            'fr-FR',   // force Accept-Language: fr → i18n résout en FR (cookie LOCALE)
    ...devices['Desktop Chrome'],
  },

  // Réutilise le next dev déjà en cours sur :3000 (LOCAL Supabase).
  // NE PAS passer reuseExistingServer: false ici — risque de démarrer un 2e serveur
  // sans garantie de pointer sur LOCAL (incident 2026-06-24).
  webServer: {
    command:             './node_modules/.bin/next dev -p 3000',
    url:                 BASE_URL,
    reuseExistingServer: true,
    timeout:             120_000,
    stdout:              'ignore',
    stderr:              'pipe',
  },
})
