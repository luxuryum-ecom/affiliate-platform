import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const BASE_URL = 'http://localhost:3000'

/**
 * Config DÉDIÉE au lot "durcissement go-live beta" (opt-in, hors `pnpm smoke`).
 * Le spec mute la base (crée/supprime 1 compte pending de test) et se connecte lui-même.
 * webServer = `next start` (build prod requis avant). Exécution sérielle.
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
    command: './node_modules/.bin/next start -p 3000',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
