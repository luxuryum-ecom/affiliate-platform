// Smoke tests : chaque route principale doit se RENDRE sans erreur.
// Le trou qui a laissé passer `stockAvailable` (fonction passée à un Client Component)
// est exactement ce que ces tests rattrapent — au rendu réel, pas au typecheck/build.
import { test } from '@playwright/test'
import { PUBLIC_ROUTES, ROLES } from './roles'
import { expectRouteRenders } from './render-check'

// ─── Routes publiques (sans auth) ──────────────────────────────────────────────
test.describe('smoke · public', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`rend ${route}`, async ({ page }) => {
      await expectRouteRenders(page, route)
    })
  }
})

// ─── Routes protégées (une session par rôle) ───────────────────────────────────
for (const role of ROLES) {
  test.describe(`smoke · ${role.key}`, () => {
    test.skip(
      !role.hasCreds,
      `Pas d'identifiants pour "${role.key}" — routes non testées (voir .env.local.example).`,
    )
    test.use({ storageState: role.storageState })

    for (const route of role.routes) {
      test(`rend ${route}`, async ({ page }) => {
        await expectRouteRenders(page, route)
      })
    }

    // Cas spécial : la fiche marketplace [id] — LA page qui crashait.
    // On prend un produit réel depuis la liste pour couvrir la route dynamique.
    if (role.key === 'wholesale') {
      test('rend /wholesale/marketplace/[id] (1er produit réel)', async ({ page }) => {
        await page.goto('/wholesale/marketplace')
        const firstProduct = page.locator('a[href*="/wholesale/marketplace/"]').first()
        const count = await firstProduct.count()
        test.skip(count === 0, 'Aucun produit dans la marketplace — route [id] non couverte.')
        const href = await firstProduct.getAttribute('href')
        test.skip(!href, 'Lien produit introuvable.')
        await expectRouteRenders(page, href!)
      })
    }
  })
}
