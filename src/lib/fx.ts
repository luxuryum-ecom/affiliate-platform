import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * FX helpers — central exchange-rate lookups (pivot MAD).
 * Source of truth: migration 050 (`current_exchange_rates`) + 051 helper functions.
 * MAD is the internal pivot; conversions live only at the edges (quote in/out).
 */

/**
 * Current rate of `code` vs MAD (number of MAD for 1 unit of `code`).
 * Returns null if the currency is unknown / has no rate.
 */
export async function getRateToMad(
  supabase: ServerClient,
  code: string,
): Promise<number | null> {
  if (code === 'MAD') return 1
  const { data, error } = (await supabase.rpc('fx_rate_to_mad', { p_code: code })) as {
    data: number | string | null
    error: unknown
  }
  if (error || data === null || data === undefined) return null
  const rate = typeof data === 'string' ? parseFloat(data) : data
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/**
 * Map of current rates vs MAD by currency code, e.g. { MAD: 1, USD: 10, ... }.
 * Always includes MAD: 1. Used to feed client-side conversion previews.
 */
export async function getRatesMap(supabase: ServerClient): Promise<Record<string, number>> {
  const { data } = (await supabase
    .from('current_exchange_rates')
    .select('quote_code, rate_vs_mad')) as {
    data: { quote_code: string; rate_vs_mad: number | string }[] | null
    error: unknown
  }
  const rates: Record<string, number> = { MAD: 1 }
  for (const r of data ?? []) {
    rates[r.quote_code] = typeof r.rate_vs_mad === 'string' ? parseFloat(r.rate_vs_mad) : r.rate_vs_mad
  }
  return rates
}

/**
 * Operational currency of the client's destination country + its rate vs MAD.
 * Falls back to MAD (rate 1) when the country label cannot be resolved.
 */
export async function getClientCurrency(
  supabase: ServerClient,
  destinationCountry: string | null | undefined,
): Promise<{ currency: string; rate: number }> {
  if (!destinationCountry) return { currency: 'MAD', rate: 1 }
  const { data, error } = (await supabase.rpc('client_currency_for', {
    p_label: destinationCountry,
  })) as { data: string | null; error: unknown }
  const currency = !error && data ? data : 'MAD'
  const rate = (await getRateToMad(supabase, currency)) ?? 1
  return { currency, rate }
}
