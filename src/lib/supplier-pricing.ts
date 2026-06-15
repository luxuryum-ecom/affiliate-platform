// ─── Tarification fournisseur : devise du pays → conversion MAD ──────────────
// Réutilise l'infra FX (getRateToMad / exchange_rates, migrations 050-051).
// RÈGLE ABSOLUE : jamais de MAD fabriqué. Pas de pays → soumission BLOQUÉE.
// Devise sans taux / prix absent / conversion absurde → suggested_*_mad = NULL.

import type { createClient } from '@/lib/supabase/server'
import type { PlatformMarginType } from '@/types/database'
import { getRateToMad } from '@/lib/fx'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Garde-fou anti-débordement : le pivot doit tenir dans numeric(10,2) et rester
// plausible. Cohérent avec le plafond prix de l'extraction Telegram.
const MAX_PRICE_MAD = 1_000_000

export type PricingReason = 'ok' | 'no_country' | 'no_rate' | 'no_price'

/**
 * État « no_rate » dérivé (PUR, sans DB) : devise étrangère SANS taux figé → le
 * prix MAD n'a pas pu être calculé (reste NULL, affiché « Sur devis »). Sert au
 * surfaçage UI (fournisseur + admin) — JAMAIS au calcul. Condition canonique
 * validée @finance, alignée sur composePricing (branche rate == null) :
 *   source_currency non-null, ≠ 'MAD', et fx_rate absent.
 * 'MAD' est exclu (invariant DB sp_mad_identity ⇒ fx_rate = 1, jamais NULL).
 * `fx_rate IS NULL` suffit à exclure no_price (qui a un taux) et ok ; on ne teste
 * pas mad (redondant : fx_rate NULL ⇒ mad NULL par construction).
 */
export function isAwaitingFxRate(p: {
  source_currency: string | null
  fx_rate_source_to_mad: number | null
}): boolean {
  return p.source_currency != null && p.source_currency !== 'MAD' && p.fx_rate_source_to_mad == null
}

export type SupplierPricing = {
  source_currency: string | null
  price_source: number | null
  fx_rate_source_to_mad: number | null
  suggested_wholesale_price_mad: number | null
  reason: PricingReason
  /** false = pays fournisseur manquant → la soumission DOIT être bloquée. */
  canSubmit: boolean
}

/**
 * Conversion PURE devise source → MAD. Jamais de MAD fabriqué : toute entrée
 * douteuse (null, ≤ 0, non finie, débordement) → null. Arrondi 2 décimales via
 * centiers entiers. Le taux NULL ne devient JAMAIS 1.
 *
 * ⚠️ @finance : Math.round a un biais au demi-centime (1.005 → 1.00). ACCEPTABLE
 * ici car c'est une SUGGESTION en pending_review, hors ledger, revue par l'admin.
 * NE PAS réutiliser pour le moteur commissions/ledger (y arrondir côté numeric
 * Postgres ou avec epsilon).
 */
export function convertToMad(priceSource: number | null, rate: number | null): number | null {
  if (priceSource == null || rate == null) return null
  if (!Number.isFinite(priceSource) || !Number.isFinite(rate)) return null
  if (priceSource <= 0 || rate <= 0) return null
  const mad = Math.round(priceSource * rate * 100) / 100
  if (!Number.isFinite(mad) || mad <= 0) return null
  if (mad > MAX_PRICE_MAD) return null // débordement / absurde → null + flag, jamais tronquer
  return mad
}

/**
 * Prix marketplace FINAL du canal fournisseur DIRECT = prix converti (`base`) +
 * marge plateforme Mozouna, SI le toggle `apply` du produit est activé.
 *
 * Miroir EXACT de `calculatePlatformPrice` (affilié) : arrondi MAD entier via
 * `Math.round` sur les DEUX branches (%, fixe) → granularité cohérente entre les
 * deux moteurs de marge. NE réutilise PAS `convertToMad` (qui garde 2 décimales et
 * porte un biais demi-centime tagué hors-ledger).
 *
 * RÈGLE ANTI-COURT-CIRCUIT : calcul SERVEUR uniquement, jamais exposé au grossiste
 * (il ne voit que le nombre final, ni la base, ni le taux de marge).
 *
 * - `apply = false` (défaut produit) → prix INCHANGÉ (= base, conserve les 2 déc
 *   éventuelles : identité stricte avec l'ancien `suggested_wholesale_price_mad`).
 * - `value` null / ≤ 0 → prix inchangé (pas de marge fabriquée).
 * - `base` null → null (pas de prix → pas de marge).
 *
 * @param base prix converti MAD (`suggested_wholesale_price_mad`)
 * @param apply toggle `apply_platform_margin` du produit
 * @param type  'percentage' (value = %) | 'fixed' (value = montant MAD)
 * @param value valeur de marge
 * @returns prix final (MAD entier si marge appliquée), ou `base`/`null` sinon
 */
export function applyPlatformMargin(
  base: number | null,
  apply: boolean,
  type: PlatformMarginType,
  value: number | null,
): number | null {
  if (base == null) return null
  if (!apply || value == null || value <= 0) return base
  const raw = type === 'percentage' ? base * (1 + value / 100) : base + value
  return Math.round(raw)
}

/**
 * Compose les champs de prix (PUR, sans DB) à partir de la devise + taux résolus.
 * - currency null      → no_country, canSubmit=false (BLOQUER la soumission).
 * - currency, rate null→ no_rate, produit créé mais mad NULL + flag (admin pose le taux).
 * - sinon              → conversion ; mad null si prix absent ou hors borne.
 */
export function composePricing(
  currency: string | null,
  rate: number | null,
  priceSource: number | null,
): SupplierPricing {
  if (!currency) {
    return {
      source_currency: null,
      price_source: priceSource,
      fx_rate_source_to_mad: null,
      suggested_wholesale_price_mad: null,
      reason: 'no_country',
      canSubmit: false,
    }
  }
  if (rate == null) {
    return {
      source_currency: currency,
      price_source: priceSource,
      fx_rate_source_to_mad: null,
      suggested_wholesale_price_mad: null,
      reason: 'no_rate',
      canSubmit: true,
    }
  }
  const mad = convertToMad(priceSource, rate)
  return {
    source_currency: currency,
    price_source: priceSource,
    fx_rate_source_to_mad: rate,
    suggested_wholesale_price_mad: mad,
    reason: mad == null ? 'no_price' : 'ok',
    canSubmit: true,
  }
}

/**
 * Devise de saisie du fournisseur = operational_currency de son PAYS de compte
 * (profiles.country_code → countries). NULL si pas de pays (jamais de fallback MAD).
 */
export async function resolveSupplierCurrency(
  supabase: ServerClient,
  supplierId: string,
): Promise<string | null> {
  const { data: prof } = await supabase
    .from('profiles')
    .select('country_code')
    .eq('id', supplierId)
    .maybeSingle()
  const code = (prof as { country_code: string | null } | null)?.country_code
  if (!code) return null

  const { data: country } = await supabase
    .from('countries')
    .select('operational_currency')
    .eq('code', code)
    .maybeSingle()
  return (country as { operational_currency: string } | null)?.operational_currency ?? null
}

/**
 * Orchestration : résout la devise du fournisseur, fige le taux admin (snapshot),
 * convertit. Réutilise getRateToMad (fx.ts) — MAD → 1, devise sans taux → null.
 */
export async function buildSupplierPricing(
  supabase: ServerClient,
  supplierId: string,
  priceSource: number | null,
): Promise<SupplierPricing> {
  const currency = await resolveSupplierCurrency(supabase, supplierId)
  if (!currency) return composePricing(null, null, priceSource)
  const rate = await getRateToMad(supabase, currency)
  return composePricing(currency, rate, priceSource)
}
