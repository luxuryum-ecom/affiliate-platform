'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { MIN_DELIVERY_FEE_MAD, MIN_DELIVERY_FEE_CASABLANCA_MAD } from '@/lib/utils'
import type { ActionState } from '@/types/orders'
import type { City } from '@/types/database'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

// ─── READ ─────────────────────────────────────────────────────────────────────

export async function getCities(): Promise<City[]> {
  const supabase = await createClient()
  const { data } = (await supabase
    .from('cities')
    .select('*')
    .order('name')) as { data: City[] | null; error: unknown }
  return data ?? []
}

/**
 * Resolve the COD delivery fee for a given customer city name.
 *
 * Lookup order:
 *   1. Active city row in `cities` table (case-insensitive match)
 *   2. Fallback: `logistics_settings.default_delivery_fee_mad`
 *   3. Hard fallback: 35 MAD (national default)
 *
 * In all cases the result is floored — the affiliate always pays delivery,
 * never 0, even on legacy rows stored at 0 (D5: runtime floor only, no data
 * migration). The floor is differentiated (D1): Casablanca (hub) = 25 MAD,
 * rest of Morocco / default = 35 MAD. This is the single chokepoint feeding the
 * commission calculation in `orders.ts`.
 *
 * Called from `placeOrder` — runs without an authenticated session.
 */
export async function resolveDeliveryFeeByCity(customerCity: string): Promise<number> {
  const supabase = await createClient()

  // Plancher différencié : Casablanca (hub) = 25 MAD, reste du Maroc = 35 MAD.
  const isCasablanca = customerCity.trim().toLowerCase() === 'casablanca'
  const floor = isCasablanca ? MIN_DELIVERY_FEE_CASABLANCA_MAD : MIN_DELIVERY_FEE_MAD

  const { data: cityRow } = (await supabase
    .from('cities')
    .select('delivery_fee_mad')
    .ilike('name', customerCity.trim())
    .eq('is_active', true)
    .maybeSingle()) as { data: { delivery_fee_mad: number } | null; error: unknown }

  if (cityRow) return Math.max(floor, Number(cityRow.delivery_fee_mad))

  // Fallback to logistics_settings default fee for unlisted cities
  const { data: settings } = (await supabase
    .from('logistics_settings')
    .select('default_delivery_fee_mad')
    .eq('id', 'default')
    .single()) as { data: { default_delivery_fee_mad: number } | null; error: unknown }

  return Math.max(floor, settings ? Number(settings.default_delivery_fee_mad) : 35)
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function addCity(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const name = (formData.get('name') as string)?.trim()
  const fee  = parseFloat(formData.get('delivery_fee_mad') as string)

  if (!name)               return fail('Nom de la ville requis.')
  if (isNaN(fee) || fee <= 0)
    return fail('Frais de livraison invalide — la livraison doit être supérieure à 0 MAD.')

  const { error } = await supabase
    .from('cities')
    .insert({ name, delivery_fee_mad: fee })

  if (error) {
    if (error.code === '23505') return fail('Cette ville existe déjà.')
    return fail(error.message)
  }

  revalidatePath('/admin/cities')
  return ok
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateCity(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const id        = (formData.get('id') as string)?.trim()
  const name      = (formData.get('name') as string)?.trim()
  const fee       = parseFloat(formData.get('delivery_fee_mad') as string)
  const isActive  = formData.get('is_active') === 'true'

  if (!id)                   return fail('ID ville manquant.')
  if (!name)                 return fail('Nom de la ville requis.')
  if (isNaN(fee) || fee <= 0)
    return fail('Frais de livraison invalide — la livraison doit être supérieure à 0 MAD.')

  const { error } = await supabase
    .from('cities')
    .update({ name, delivery_fee_mad: fee, is_active: isActive })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') return fail('Ce nom de ville est déjà utilisé.')
    return fail(error.message)
  }

  revalidatePath('/admin/cities')
  return ok
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteCity(cityId: string): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  if (!cityId) return fail('ID ville manquant.')

  const { error } = await supabase
    .from('cities')
    .delete()
    .eq('id', cityId)

  if (error) return fail(error.message)

  revalidatePath('/admin/cities')
  return ok
}

// ─── TOGGLE ACTIVE ────────────────────────────────────────────────────────────

export async function toggleCityActive(cityId: string, active: boolean): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const { error } = await supabase
    .from('cities')
    .update({ is_active: active })
    .eq('id', cityId)

  if (error) return fail(error.message)

  revalidatePath('/admin/cities')
  return ok
}
