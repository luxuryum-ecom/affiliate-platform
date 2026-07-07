/**
 * Migration 119 + B8 — Suppression de compte RGPD (anonymisation).
 *
 * Test d'INTÉGRATION réel contre le Supabase LOCAL UNIQUEMENT.
 * Protégé par assertLocalSupabase() + getLocalSupabaseEnv() (jamais .env.local / prod).
 * Aucun secret en dur — clés lues via `supabase status`.
 *
 * Prouve la GARANTIE MÉTIER : l'anonymisation vide la PII du profil ET conserve la
 * commande (buyer_id intact) → intégrité comptable préservée.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertLocalSupabase, getLocalSupabaseEnv } from '../e2e/assert-local-supabase'
import { anonymizedProfileFields, DELETED_PROFILE_NAME } from '../src/lib/account/anonymize'

const testTag = `del119-${Date.now()}`
let sb: SupabaseClient // service_role

let userId = ''
let orderId = ''

describe('Migration 119 — anonymisation compte + intégrité commande', () => {
  beforeAll(async () => {
    const env = getLocalSupabaseEnv()
    assertLocalSupabase(env.url, 'account-deletion-119-setup')
    sb = createClient(env.url, env.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await sb.auth.admin.createUser({
      email: `deluser-${testTag}@test.local`,
      password: 'DeleteRgpd119-2026!X',
      email_confirm: true,
      user_metadata: { role: 'wholesaler', full_name: 'Ahmed Test' },
    })
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
    userId = data.user.id

    // PII complète sur le profil.
    await sb
      .from('profiles')
      .update({
        role: 'wholesaler',
        status: 'approved',
        full_name: 'Ahmed Test',
        phone: '+212600000001',
        company_name: 'Ahmed SARL',
        ice: '001111111000077',
        registre_commerce: 'RC 99887',
        billing_address: '5 rue du Test, Rabat',
        city: 'Rabat',
        bank_account: 'RIB 011 780 0001234567890 12',
        declared_niche: 'Alimentaire',
      })
      .eq('id', userId)

    // Une commande gros de cet acheteur (l'intégrité doit survivre).
    const { data: ord, error: ordErr } = await sb
      .from('wholesale_orders')
      .insert({
        buyer_id: userId,
        total_amount: 5000,
        status: 'delivered',
        delivery_preference: 'delivery',
      })
      .select('id')
      .single()
    if (ordErr || !ord) throw new Error(`wholesale_orders: ${ordErr?.message}`)
    orderId = ord.id
  }, 120_000)

  afterAll(async () => {
    if (!sb) return
    if (orderId) await sb.from('wholesale_orders').delete().eq('id', orderId)
    if (userId) await sb.auth.admin.deleteUser(userId).catch(() => {})
  }, 60_000)

  it('anonymise TOUTE la PII du profil + statut deleted + horodatage', async () => {
    const nowIso = '2026-07-07T12:00:00.000Z'
    const { error } = await sb
      .from('profiles')
      .update(anonymizedProfileFields(nowIso))
      .eq('id', userId)
    expect(error).toBeNull()

    const { data: p } = await sb
      .from('profiles')
      .select('full_name, phone, company_name, ice, registre_commerce, billing_address, city, bank_account, declared_niche, status, anonymized_at')
      .eq('id', userId)
      .single()

    const prof = p as Record<string, unknown>
    expect(prof.full_name).toBe(DELETED_PROFILE_NAME)
    expect(prof.phone).toBeNull()
    expect(prof.company_name).toBeNull()
    expect(prof.ice).toBeNull()
    expect(prof.registre_commerce).toBeNull()
    expect(prof.billing_address).toBeNull()
    expect(prof.city).toBeNull()
    expect(prof.bank_account).toBeNull() // RIB — PII financière (P1-1 @security)
    expect(prof.declared_niche).toBeNull()
    expect(prof.status).toBe('deleted')
    expect(prof.anonymized_at).not.toBeNull()
  })

  it('CONSERVE la commande (buyer_id intact) — intégrité comptable', async () => {
    const { data: ord } = await sb
      .from('wholesale_orders')
      .select('id, buyer_id, total_amount, status')
      .eq('id', orderId)
      .single()

    const o = ord as { id: string; buyer_id: string; total_amount: number; status: string } | null
    expect(o).not.toBeNull()
    expect(o!.buyer_id).toBe(userId) // le lien comptable survit à l'anonymisation
    expect(Number(o!.total_amount)).toBe(5000)
    expect(o!.status).toBe('delivered')
  })
})
