import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { resolveDeliveryFeeByCity } from '@/app/actions/cities'
import { makeClient } from './_supabase-mock'

/** city = tarif stocké dans `cities` (null = ville absente) ; settings = default_delivery_fee_mad (null = pas de ligne). */
function setup({ city, settings }: { city: number | null; settings: number | null }) {
  ;(createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeClient({
      resolve: (table) => {
        if (table === 'cities') return { data: city === null ? null : { delivery_fee_mad: city }, error: null }
        if (table === 'logistics_settings')
          return { data: settings === null ? null : { default_delivery_fee_mad: settings }, error: null }
        return { data: null, error: null }
      },
    }) as unknown as Awaited<ReturnType<typeof createClient>>,
  )
}

describe('resolveDeliveryFeeByCity — plancher différencié Casa 25 / national 35', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Casablanca tarif 25 → 25', async () => {
    setup({ city: 25, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Casablanca')).toBe(25)
  })

  it('Casablanca insensible à la casse et aux espaces', async () => {
    setup({ city: 25, settings: 40 })
    expect(await resolveDeliveryFeeByCity('  casablanca ')).toBe(25)
  })

  it('Casablanca tarif 10 en base → remonté au plancher 25', async () => {
    setup({ city: 10, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Casablanca')).toBe(25)
  })

  it('autre ville tarif 35 → 35', async () => {
    setup({ city: 35, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Rabat')).toBe(35)
  })

  it('autre ville tarif 20 → remonté au plancher national 35', async () => {
    setup({ city: 20, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Rabat')).toBe(35)
  })

  it('ville à 0 en base (non-Casa) → plancher 35', async () => {
    setup({ city: 0, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Tanger')).toBe(35)
  })

  it('ville à 0 en base (Casa) → plancher 25', async () => {
    setup({ city: 0, settings: 40 })
    expect(await resolveDeliveryFeeByCity('Casablanca')).toBe(25)
  })

  it('ville absente → défaut logistique (40) planché', async () => {
    setup({ city: null, settings: 40 })
    expect(await resolveDeliveryFeeByCity('VilleInconnue')).toBe(40)
  })

  it('ville absente + défaut logistique trop bas (20) → plancher national 35', async () => {
    setup({ city: null, settings: 20 })
    expect(await resolveDeliveryFeeByCity('VilleInconnue')).toBe(35)
  })

  it('ville absente + aucune ligne logistics → hard fallback 35', async () => {
    setup({ city: null, settings: null })
    expect(await resolveDeliveryFeeByCity('VilleInconnue')).toBe(35)
  })
})
