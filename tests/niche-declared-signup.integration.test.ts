/**
 * Migration 117 — Niche DÉCLARÉE à l'inscription grossiste (couche 1 perso).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status`.
 *
 * Couverture :
 *  - Le trigger handle_new_user (mig 117) recopie `declared_niche` depuis la
 *    métadonnée du signup vers `profiles.declared_niche`.
 *  - Métadonnée absente → colonne NULL (NULLIF).
 *  - Métadonnée = chaîne vide → colonne NULL (NULLIF).
 *  - L'allowlist taxonomie (isValidCategory) accepte une catégorie canonique et
 *    rejette une valeur inconnue (garde applicative de la server action signUp).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { isValidCategory } from '../src/lib/taxonomy'

const TEST_PASSWORD = 'TestNiche117-2026!X'
const testTag = `niche117-${Date.now()}`

let sb: SupabaseClient // service_role — création d'utilisateurs + lecture profils
const createdUserIds: string[] = []

async function mkUserWithMeta(
  suffix: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const email = `${suffix}-${testTag}@test.local`
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error || !data.user) throw new Error(`mkUser(${suffix}): ${error?.message ?? 'user null'}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

async function readDeclaredNiche(userId: string): Promise<string | null> {
  const { data, error } = await sb
    .from('profiles')
    .select('declared_niche')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`readDeclaredNiche: ${error.message}`)
  return (data as { declared_niche: string | null }).declared_niche
}

describe('Migration 117 — niche déclarée au signup grossiste', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    console.log(`[guard] URL locale confirmée : ${env.url}`)
    assertLocalSupabase(env.url, 'niche117-integration-setup')
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  afterAll(async () => {
    for (const id of createdUserIds) {
      await sb.auth.admin.deleteUser(id).catch(() => {})
    }
    console.log('[cleanup] utilisateurs de test supprimés')
  })

  it('recopie la niche déclarée (catégorie valide) dans profiles.declared_niche', async () => {
    const id = await mkUserWithMeta('tw-valid', {
      role: 'wholesaler',
      full_name: `NicheBuyer ${testTag}`,
      declared_niche: 'Alimentaire',
    })
    expect(await readDeclaredNiche(id)).toBe('Alimentaire')
  })

  it('métadonnée absente → declared_niche NULL', async () => {
    const id = await mkUserWithMeta('tw-absent', {
      role: 'wholesaler',
      full_name: `NoNiche ${testTag}`,
    })
    expect(await readDeclaredNiche(id)).toBeNull()
  })

  it('métadonnée vide → declared_niche NULL (NULLIF)', async () => {
    const id = await mkUserWithMeta('tw-empty', {
      role: 'wholesaler',
      full_name: `EmptyNiche ${testTag}`,
      declared_niche: '',
    })
    expect(await readDeclaredNiche(id)).toBeNull()
  })

  it('allowlist taxonomie : accepte une catégorie canonique, rejette l’inconnue', () => {
    expect(isValidCategory('Alimentaire')).toBe(true)
    expect(isValidCategory('Textile')).toBe(true)
    expect(isValidCategory('N’importe quoi')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory(null)).toBe(false)
  })
})
