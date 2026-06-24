/**
 * GARDE-FOU e2e — refuse tout test d'ÉCRITURE pointé sur une base non-locale,
 * et fournit les identifiants Supabase LOCAUX (jamais .env.local / la prod).
 *
 * Cause racine de l'incident 2026-06-24 : le spec admin-stock chargeait .env.local
 * (= cloud prod) et seedait la prod via service_role. Plus jamais.
 *
 *   import { assertLocalSupabase, getLocalSupabaseEnv } from './assert-local-supabase'
 *   const { url, anonKey, serviceKey } = getLocalSupabaseEnv()   // local-only, garanti
 */
import { execSync } from 'node:child_process'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function assertLocalSupabase(url: string, ctx = 'test'): string {
  let host = ''
  try { host = new URL(url).hostname } catch { host = '' }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `REFUS: ${ctx} pointé sur une base NON-LOCALE (URL=${url || 'absente'}). ` +
      `Les tests qui écrivent en base ne tournent QUE sur le Supabase local ` +
      `(127.0.0.1:54321). Lance « supabase start » et utilise les clés LOCALES — ` +
      `JAMAIS .env.local / la prod.`,
    )
  }
  return url
}

export interface LocalSupabaseEnv {
  url: string
  anonKey: string
  serviceKey: string
}

/**
 * Lit les identifiants Supabase LOCAUX via « supabase status --output env ».
 * Ne lit JAMAIS .env.local. Vérifie que l'URL est bien locale (fail-fast sinon).
 * Lève une erreur claire si le Supabase local n'est pas démarré.
 */
export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  let out = ''
  try {
    out = execSync('supabase status --output env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error(
      'REFUS: impossible de lire « supabase status ». Le Supabase LOCAL doit tourner ' +
      '(lance « supabase start ») — les tests d\'écriture ne ciblent jamais la prod.',
    )
  }
  const pick = (key: string): string => {
    const m = out.match(new RegExp(`^${key}="?(.*?)"?$`, 'm'))
    return (m?.[1] ?? '').trim()
  }
  const url = pick('API_URL')
  const anonKey = pick('ANON_KEY')
  const serviceKey = pick('SERVICE_ROLE_KEY')
  assertLocalSupabase(url, 'getLocalSupabaseEnv')
  if (!anonKey || !serviceKey) {
    throw new Error('REFUS: clés Supabase locales introuvables (supabase start ?).')
  }
  return { url, anonKey, serviceKey }
}
