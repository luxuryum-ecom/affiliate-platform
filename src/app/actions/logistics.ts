'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
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
  if (!settings) {
    return isCasablanca ? 25 : 40
  }
  return isCasablanca
    ? Number(settings.casablanca_delivery_fee_mad)
    : Number(settings.default_delivery_fee_mad)
}

/**
 * Admin-only: update the singleton logistics settings row.
 * All three fees are required and must be non-negative numbers.
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

  if (isNaN(casablancaFee) || casablancaFee < 0)
    return fail('Frais Casablanca invalide.')
  if (isNaN(defaultFee) || defaultFee < 0)
    return fail('Frais livraison par défaut invalide.')
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
