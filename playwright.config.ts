import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

const PORT = 3000
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Le rendu réel des routes est le but : pas de parallélisme agressif pour rester lisible.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  // Bornes dures : un blocage échoue vite au lieu de pendre indéfiniment.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  projects: [
    // 1) Authentifie les rôles disposant d'identifiants → storageState par rôle.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // 2) Smoke : rend chaque route principale. Dépend de l'auth.
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Démarre next dev via le binaire direct (contourne le gotcha pnpm sharp/unrs-resolver).
  // Réutilise un serveur déjà lancé en local ; en CI on le démarre toujours.
  webServer: {
    command: './node_modules/.bin/next dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
