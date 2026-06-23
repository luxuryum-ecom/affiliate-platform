import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const PORT = 3000
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://localhost:${PORT}`

/**
 * Config DÉDIÉE au LOT "rôles 2 étages".
 *
 * Pourquoi un fichier séparé de playwright.config.ts :
 *   - Le spec roles-2-etages-v2 mute la base PROD (confirmations, capacités) et
 *     se connecte lui-même (pas de storageState). Il NE DOIT PAS tourner dans le
 *     `pnpm smoke` (= rendu des routes principales, filet pré-push). Le garder
 *     hors du testMatch par défaut le laisse strictement opt-in.
 *   - Lancement explicite :
 *       ./node_modules/.bin/next build
 *       ./node_modules/.bin/next start -p 3000   (ou laisser webServer le démarrer)
 *       ./node_modules/.bin/playwright test --config=playwright.roles.config.ts
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

  // Build de PROD (`next start`), pas `next dev` (cf. raison dans playwright.config.ts).
  // reuseExistingServer : réutilise un `next start` déjà lancé sur le port.
  webServer: {
    command: './node_modules/.bin/next start -p 3000',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
