/**
 * Configuration Playwright dédiée aux tests sourcing-affectation.
 * Lance un projet chromium autonome sans dépendre du setup smoke existant.
 * Usage : npx playwright test --config=playwright.sourcing.config.ts
 */
import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const BASE_URL = 'http://localhost:3000'

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

  // Réutilise le serveur dev existant (déjà lancé sur 3000)
  webServer: {
    command: './node_modules/.bin/next dev -p 3000',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
