'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from './_guards'
import type { ImportTariff, TariffCountry, ImportShippingMode } from '@/types/database'
import { SHIPPING_MODE_LABELS, unitFromShippingMode } from '@/lib/tariff-utils'

export type TariffFormState = { error: string | null }

// ─── Fetch all tariffs (admin sees all; others see active via RLS) ─────────────

export async function getTariffs(): Promise<ImportTariff[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('import_tariffs')
    .select('*')
    .order('country')
    .order('shipping_mode') as { data: ImportTariff[] | null; error: unknown }

  return data ?? []
}

// ─── Fetch active tariff by country + shipping mode ───────────────────────────

export async function getActiveTariff(
  country: string,
  shippingMode: string
): Promise<ImportTariff | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('import_tariffs')
    .select('*')
    .eq('country', country)
    .eq('shipping_mode', shippingMode)
    .eq('active', true)
    .limit(1)
    .single() as { data: ImportTariff | null; error: unknown }

  return data
}

// ─── Upsert (create or update) ────────────────────────────────────────────────

const VALID_COUNTRIES: TariffCountry[] = ['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre']
const VALID_MODES: ImportShippingMode[] = ['air_door_to_door_kg', 'sea_textile_kg', 'sea_volume_cbm']

export async function upsertTariff(
  _prevState: TariffFormState,
  formData: FormData
): Promise<TariffFormState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = (formData.get('id') as string) || null
  const country = (formData.get('country') as string)?.trim() as TariffCountry
  const shipping_mode = (formData.get('shipping_mode') as string) as ImportShippingMode
  const price_raw = formData.get('transport_customs_price_mad') as string
  const transport_customs_price_mad = parseFloat(price_raw)
  const delivery_days_raw = formData.get('delivery_days') as string
  const delivery_days = delivery_days_raw ? parseInt(delivery_days_raw) || null : null
  const notes_raw = (formData.get('notes') as string)?.trim()
  const notes = notes_raw || null
  const active = formData.get('active') !== 'false'

  if (!VALID_COUNTRIES.includes(country))
    return { error: 'Pays invalide.' }
  if (!VALID_MODES.includes(shipping_mode))
    return { error: 'Mode de transport invalide.' }
  if (isNaN(transport_customs_price_mad) || transport_customs_price_mad < 0)
    return { error: 'Le prix transport & douane doit être un nombre positif.' }

  // Unit is auto-derived from shipping mode
  const unit = unitFromShippingMode(shipping_mode)

  const payload = {
    country,
    shipping_mode,
    transport_customs_price_mad,
    unit,
    delivery_days,
    notes,
    active,
    // Keep legacy fields in sync for backward compat
    pricing_mode: null,
    price_mad: transport_customs_price_mad,
  }

  if (id) {
    const { error } = await supabase.from('import_tariffs').update(payload).eq('id', id)
    if (error) {
      if (error.message.includes('import_tariffs_active_country_mode_uidx'))
        return { error: `Un tarif actif pour ${country} — ${SHIPPING_MODE_LABELS[shipping_mode]} existe déjà.` }
      return { error: error.message }
    }
  } else {
    const { error } = await supabase.from('import_tariffs').insert(payload)
    if (error) {
      if (error.message.includes('import_tariffs_active_country_mode_uidx'))
        return { error: `Un tarif actif pour ${country} — ${SHIPPING_MODE_LABELS[shipping_mode]} existe déjà.` }
      return { error: error.message }
    }
  }

  revalidatePath('/admin/import-tariffs')
  return { error: null }
}

// ─── Toggle active ────────────────────────────────────────────────────────────

export async function toggleTariffActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const { supabase, error } = await requireAdmin()
  if (error) return { error }

  const { error: dbError } = await supabase
    .from('import_tariffs')
    .update({ active })
    .eq('id', id)

  if (dbError) {
    if (dbError.message.includes('import_tariffs_active_country_mode_uidx'))
      return { error: 'Un tarif actif pour ce pays/mode existe déjà. Désactivez-le d\'abord.' }
    return { error: dbError.message }
  }

  revalidatePath('/admin/import-tariffs')
  return { error: null }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTariff(id: string): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase.from('import_tariffs').delete().eq('id', id)
  revalidatePath('/admin/import-tariffs')
}
