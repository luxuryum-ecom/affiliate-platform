'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { parseRateInput } from '@/lib/rate'

export type UpsertRateFormState = { error: string | null; success?: boolean }

/**
 * Append a new exchange rate (admin only). MIN-2 (audit Étape 1) :
 * les taux s'écrivent par le serveur avec validation, jamais en INSERT client brut.
 * La table exchange_rates est append-only (triggers migration 050) : un nouveau
 * taux = une nouvelle ligne, l'historique reste auditable.
 */
export async function upsertExchangeRate(
  _prev: UpsertRateFormState,
  formData: FormData,
): Promise<UpsertRateFormState> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Erreur.' }

  const quoteCode = (formData.get('quote_code') as string)?.trim().toUpperCase()
  // TAUX — validé en CHAÎNE décimale stricte (rate.ts, ≤8 déc, > 0), passé verbatim
  // à la colonne numeric(18,8) : zéro parseFloat. Précision DB native conservée.
  const rateR = parseRateInput(formData.get('rate_vs_mad'))

  if (!quoteCode) return { error: 'Devise requise.' }
  if (!rateR.ok) return { error: 'Taux invalide (doit être > 0).' }

  // La devise doit exister et être active dans le référentiel.
  const { data: currency } = (await supabase
    .from('currencies')
    .select('code, active')
    .eq('code', quoteCode)
    .single()) as { data: { code: string; active: boolean } | null; error: unknown }

  if (!currency) return { error: `Devise inconnue : ${quoteCode}.` }
  if (!currency.active) return { error: `Devise inactive : ${quoteCode}.` }

  const { error: dbError } = await supabase.from('exchange_rates').insert({
    quote_code: quoteCode,
    rate_vs_mad: rateR.value,
    source: 'manual',
    created_by: userId,
  })

  if (dbError) return { error: dbError.message }

  revalidatePath('/admin/settings')
  return { error: null, success: true }
}
