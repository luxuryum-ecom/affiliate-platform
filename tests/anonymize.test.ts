import { describe, it, expect } from 'vitest'
import { anonymizedProfileFields, DELETED_PROFILE_NAME } from '@/lib/account/anonymize'

// ─── B8 / RGPD — champs d'anonymisation (pur) ────────────────────────────────

describe('anonymizedProfileFields', () => {
  const iso = '2026-07-07T12:00:00.000Z'
  const f = anonymizedProfileFields(iso)

  it('vide TOUTE la PII (null) sauf le nom (NOT NULL → libellé neutre)', () => {
    expect(f.full_name).toBe(DELETED_PROFILE_NAME)
    expect(f.phone).toBeNull()
    expect(f.company_name).toBeNull()
    expect(f.ice).toBeNull()
    expect(f.registre_commerce).toBeNull()
    expect(f.billing_address).toBeNull()
    expect(f.city).toBeNull()
    expect(f.bank_account).toBeNull() // RIB — PII financière (P1-1 @security)
    expect(f.declared_niche).toBeNull()
  })

  it('marque le compte supprimé + horodate', () => {
    expect(f.status).toBe('deleted')
    expect(f.anonymized_at).toBe(iso)
  })

  it('verrouille la liste EXACTE des champs (aucune PII oubliée, rien en trop)', () => {
    expect(Object.keys(f).sort()).toEqual(
      [
        'anonymized_at',
        'bank_account',
        'billing_address',
        'city',
        'company_name',
        'declared_niche',
        'full_name',
        'ice',
        'phone',
        'registre_commerce',
        'status',
      ].sort(),
    )
  })

  it('ne touche PAS l’email (vit dans auth.users, anonymisé côté auth)', () => {
    expect('email' in f).toBe(false)
  })
})
