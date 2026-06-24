/**
 * GARDE-FOU — refuse tout test/script d'ÉCRITURE pointé sur une base non-locale.
 *
 * Cause racine de l'incident 2026-06-24 : un test runtime a seedé la PROD
 * (.env.local pointe sur le cloud) via service_role. Plus jamais : tout test
 * qui écrit en base DOIT cibler le Supabase LOCAL (127.0.0.1:54321).
 *
 * Usage :
 *   import { assertLocalSupabase } from './lib/assert-local-supabase.mjs'
 *   assertLocalSupabase(BASE_URL)   // throw si l'URL n'est pas localhost/127.0.0.1
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function assertLocalSupabase(url, ctx = 'test') {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `REFUS: ${ctx} pointé sur une base NON-LOCALE (URL=${url || 'absente'}). ` +
      `Les tests/scripts qui écrivent en base ne tournent QUE sur le Supabase local ` +
      `(127.0.0.1:54321). Lance « supabase start » et utilise les clés LOCALES — ` +
      `JAMAIS .env.local / la prod.`,
    )
  }
  return url
}
