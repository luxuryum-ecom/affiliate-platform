'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from './_guards'
import type { ImportTariff, TariffCountry, ImportPricingMode, ImportPriceUnit } from '@/types/database'

export type TariffFormState = { error: string | null }

// ─── Fetch all tariffs (admin reads all; others read active via RLS) ──────────

export async function getTariffs(): Promise<ImportTariff[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('import_tariffs')
    .select('*')
    .order('country')
    .order('created_at') as { data: ImportTariff[] | null; error: unknown }

  if (error) return []
  return data ?? []
}

// ─── Fetch active tariffs by country (used on wholesale pages) ────────────────

export async function getActiveTariffByCountry(country: string): Promise<ImportTariff | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('import_tariffs')
    .select('*')
    .eq('country', country)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: ImportTariff | null; error: unknown }

  return data
}

// ─── Upsert (create or update) ────────────────────────────────────────────────

const VALID_COUNTRIES: TariffCountry[] = ['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre']
const VALID_PRICING_MODES: ImportPricingMode[] = ['door_to_door_per_kg', 'sea_freight_cbm_or_kg']
const VALID_UNITS: ImportPriceUnit[] = ['kg', 'cbm']

export async function upsertTariff(
  _prevState: TariffFormState,
  formData: FormData
): Promise<TariffFormState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = (formData.get('id') as string) || null
  const country = (formData.get('country') as string)?.trim() as TariffCountry
  const pricing_mode = (formData.get('pricing_mode') as string) as ImportPricingMode
  const price_mad_raw = formData.get('price_mad') as string
  const price_mad = parseFloat(price_mad_raw)
  const unit = (formData.get('unit') as string) as ImportPriceUnit
  const delivery_days_raw = formData.get('delivery_days') as string
  const delivery_days = delivery_days_raw ? parseInt(delivery_days_raw) || null : null
  const notes_raw = (formData.get('notes') as string)?.trim()
  const notes = notes_raw || null
  const active = formData.get('active') !== 'false'

  if (!VALID_COUNTRIES.includes(country))
    return { error: 'Pays invalide.' }
  if (!VALID_PRICING_MODES.includes(pricing_mode))
    return { error: 'Mode de tarification invalide.' }
  if (isNaN(price_mad) || price_mad < 0)
    return { error: 'Le prix doit être un nombre positif.' }
  if (!VALID_UNITS.includes(unit))
    return { error: 'Unité invalide.' }

  const payload = { country, pricing_mode, price_mad, unit, delivery_days, notes, active }

  if (id) {
    const { error } = await supabase.from('import_tariffs').update(payload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('import_tariffs').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/import-tariffs')
  return { error: null }
}

// ─── Toggle active ────────────────────────────────────────────────────────────

export async function toggleTariffActive(id: string, active: boolean): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase.from('import_tariffs').update({ active }).eq('id', id)
  revalidatePath('/admin/import-tariffs')
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTariff(id: string): Promise<void> {
  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase.from('import_tariffs').delete().eq('id', id)
  revalidatePath('/admin/import-tariffs')
}
