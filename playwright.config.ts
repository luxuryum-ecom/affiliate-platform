import { defineConfig, devices } from '@playwright/test'
import { loadEnvLocal } from './e2e/env'

loadEnvLocal()

// Port configurable via SMOKE_PORT (défaut 3000). Permet de lancer le smoke sur un
// autre port (ex. 3100) quand le 3000 est occupé par un autre projet — sans conflit.
const PORT = Number(process.env.SMOKE_PORT ?? 3000)
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

  // Smoke contre un BUILD DE PRODUCTION (`next start`), PAS `next dev`.
  // Raison : sous `next dev`, la compilation à froid simultanée de plusieurs routes provoque
  // des erreurs transitoires (ex. « No intl context found ») → faux positifs. La prod n'a pas
  // cette course et teste exactement ce qui ship. Le build doit exister AVANT :
  //   - `pnpm smoke` fait `next build && playwright test` ;
  //   - le hook pre-push fait `next build` puis `playwright test`.
  // Binaire direct = contournement du gotcha pnpm sharp/unrs-resolver.
  // ⚠️ Ne pas laisser un `next dev` tourner sur le port : reuseExistingServer le réutiliserait.
  webServer: {
    command: `./node_modules/.bin/next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
