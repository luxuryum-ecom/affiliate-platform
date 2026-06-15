// Vérifie qu'une route se REND réellement sans erreur serveur ni erreur de rendu.
// C'est précisément ce que ni tsc, ni le build, ni les tests unitaires ne voyaient
// (ex: « Functions cannot be passed directly to Client Components »).
import { expect, type Page } from '@playwright/test'

// Erreurs console connues comme bénignes (bruit dev / ressources externes) — à ignorer.
const BENIGN_CONSOLE = [
  /favicon/i,
  /Failed to load resource.*(404|net::ERR)/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
]

// Signatures d'erreurs de rendu qu'on veut absolument attraper.
const FATAL_MARKERS = [
  /Functions cannot be passed directly to Client Components/i,
  /Only plain objects.*can be passed to Client Components/i,
  /Objects are not valid as a React child/i,
  /Hydration failed/i,
  /Unhandled Runtime Error/i,
]

export async function expectRouteRenders(page: Page, route: string) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (BENIGN_CONSOLE.some((re) => re.test(text))) return
    consoleErrors.push(text)
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  const resp = await page.goto(route, { waitUntil: 'domcontentloaded' })

  // 1) Pas de réponse serveur en erreur (500 = crash de rendu serveur, le cas stockAvailable en prod).
  const status = resp?.status() ?? 0
  expect(status, `Statut HTTP de ${route}`).toBeLessThan(400)

  // Laisse le rendu client se stabiliser pour capter les erreurs RSC/hydration.
  // NB: on N'utilise PAS 'networkidle' — la connexion HMR de `next dev` reste ouverte
  // en permanence et l'état idle n'est jamais atteint (le test pendrait).
  await page.waitForTimeout(800)

  // 2) Pas d'erreur de rendu fatale (overlay Next dev / RSC).
  const allErrors = [...pageErrors, ...consoleErrors]
  const fatal = allErrors.filter((e) => FATAL_MARKERS.some((re) => re.test(e)))
  expect(fatal, `Erreur de rendu fatale sur ${route}`).toEqual([])

  // 3) Aucune exception JS non capturée.
  expect(pageErrors, `Exception JS non capturée sur ${route}`).toEqual([])

  // 4) Pas d'overlay d'erreur Next.
  // NB: en dev, <nextjs-portal> est TOUJOURS présent (indicateur de dev) — on ne teste donc
  // PAS sa présence. On cible le CONTENU d'erreur réel (texte de l'overlay erreur/build/serveur),
  // que Playwright voit même dans le shadow DOM du portail.
  await expect(
    page.getByText(
      /Unhandled Runtime Error|Server Error|Failed to compile|Build Error|Functions cannot be passed directly|Application error: a server-side exception/i,
    ),
    `Overlay d'erreur Next sur ${route}`,
  ).toHaveCount(0)
}
