/**
 * Config Playwright dédiée aux preuves vitrine (QA runtime).
 * Réutilise les storageState existants (e2e/.auth/).
 * Le serveur Next.js doit être déjà lancé sur :3000.
 */
import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const BASE_URL = 'http://localhost:3000'

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

  // Serveur DÉJÀ LANCÉ → reuseExistingServer=true, timeout 0.
  webServer: {
    command: './node_modules/.bin/next start -p 3000',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 10_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
