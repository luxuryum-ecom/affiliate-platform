'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { MIN_DELIVERY_FEE_MAD, MIN_DELIVERY_FEE_CASABLANCA_MAD } from '@/lib/utils'
import type { ActionState } from '@/types/orders'
import type { LogisticsSettings } from '@/types/database'

const fail = (msg: string): ActionState => ({ error: msg, success: false })

/**
 * Fetch the singleton logistics settings row.
 * Returns null only if the migration has not been applied yet.
 */
export async function getLogisticsSettings(): Promise<LogisticsSettings | null> {
  const supabase = await createClient()
  const { data } = (await supabase
    .from('logistics_settings')
    .select('*')
    .eq('id', 'default')
    .single()) as { data: LogisticsSettings | null; error: unknown }
  return data
}

/**
 * Resolve the COD delivery fee for a given customer city.
 * Uses the logistics_settings singleton row.
 * Falls back to hardcoded defaults if settings row is missing.
 *
 * Casablanca (case-insensitive) → casablanca_delivery_fee_mad
 * All other cities              → default_delivery_fee_mad
 */
export async function resolveDeliveryFee(customerCity: string): Promise<number> {
  const settings = await getLogisticsSettings()
  const isCasablanca = customerCity.trim().toLowerCase() === 'casablanca'
  // Plancher différencié : Casablanca (hub) = 25 MAD, reste du Maroc = 35 MAD.
  const floor = isCasablanca ? MIN_DELIVERY_FEE_CASABLANCA_MAD : MIN_DELIVERY_FEE_MAD
  if (!settings) {
    return Math.max(floor, isCasablanca ? 25 : 35)
  }
  return Math.max(
    floor,
    isCasablanca
      ? Number(settings.casablanca_delivery_fee_mad)
      : Number(settings.default_delivery_fee_mad)
  )
}

/**
 * Admin-only: update the singleton logistics settings row.
 * Delivery fees (Casablanca + default) must be strictly > 0 — the affiliate
 * always pays delivery, never 0. The return fee may be 0 (it is not a delivery
 * fee, D3).
 */
export async function updateLogisticsSettings(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const casablancaFee = parseFloat(formData.get('casablanca_delivery_fee_mad') as string)
  const defaultFee    = parseFloat(formData.get('default_delivery_fee_mad') as string)
  const returnFee     = parseFloat(formData.get('return_fee_mad') as string)

  if (isNaN(casablancaFee) || casablancaFee <= 0)
    return fail('Frais Casablanca invalide — la livraison doit être supérieure à 0 MAD.')
  if (isNaN(defaultFee) || defaultFee <= 0)
    return fail('Frais livraison par défaut invalide — la livraison doit être supérieure à 0 MAD.')
  if (isNaN(returnFee) || returnFee < 0)
    return fail('Frais de retour invalide.')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('logistics_settings')
    .upsert({
      id:                          'default',
      casablanca_delivery_fee_mad: casablancaFee,
      default_delivery_fee_mad:    defaultFee,
      return_fee_mad:              returnFee,
      updated_at:                  new Date().toISOString(),
      updated_by:                  user?.id ?? null,
    })
    .eq('id', 'default')

  if (error) return fail(error.message)

  revalidatePath('/admin/logistics')
  return { error: null, success: true }
}
