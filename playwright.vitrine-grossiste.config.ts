/**
 * Config Playwright dédiée — vérification vitrine grossiste intelligente.
 * Lance la spec e2e/vitrine-grossiste.spec.ts uniquement.
 * Workers=1 (sériel), hors pnpm smoke.
 * Le serveur Next.js doit être DÉJÀ lancé sur :3000 (reuseExistingServer=true).
 */
import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const BASE_URL = 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  testMatch: /vitrine-grossiste\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-vitrine-grossiste' }],
  ],
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
      name: 'vitrine-grossiste',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Serveur déjà lancé → reuseExistingServer=true, pas de timeout bloquant.
  webServer: {
    command: './node_modules/.bin/next start -p 3000',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 10_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
