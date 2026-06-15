// Authentifie une fois chaque rôle disposant d'identifiants (.env.local) et
// sauvegarde sa session (storageState) pour les smoke tests des routes protégées.
// Un rôle sans creds est « skip » proprement (pas un échec) — ses routes ne seront pas testées.
import { test as setup, expect } from '@playwright/test'
import { ROLES } from './roles'

for (const role of ROLES) {
  setup(`auth ${role.key}`, async ({ page }) => {
    setup.skip(
      !role.hasCreds,
      `Pas d'identifiants pour le rôle "${role.key}" (définir ${role.envPrefix}_EMAIL / ${role.envPrefix}_PASSWORD dans .env.local). Routes de ce rôle NON testées.`,
    )

    await page.goto('/login')
    await page.locator('#email').fill(role.email!)
    await page.locator('#password').fill(role.password!)
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      page.locator('button[type="submit"]').click(),
    ])

    // On doit être connecté : plus sur /login et pas d'erreur d'identifiants.
    expect(page.url(), `Connexion ${role.key} échouée (resté sur /login)`).not.toContain('/login')

    await page.context().storageState({ path: role.storageState })
  })
}
