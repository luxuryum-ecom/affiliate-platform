'use client'

import { useActionState, useState } from 'react'
import { saveAffiliateProductPrice, type AffiliatePriceState } from '@/app/actions/affiliate-prices'
import { formatMAD } from '@/lib/utils'

const affiliatePriceInitialState: AffiliatePriceState = { error: null, success: false, cleared: false }

export interface AffiliatePriceStrings {
  myPrice: string
  /** ICU template: {amount} */
  priceVsCatalog: string
  /** ICU template: {price} */
  priceNotSet: string
  priceSave: string
  priceSaving: string
  priceSavedOk: string
  priceResetOk: string
  /** Bandeau d'encouragement (titre du bloc). */
  keepDifference: string
  /** ICU template: {amount} */
  gainPerSale: string
  /** ICU template: {min} */
  gainPlaceholder: string
  /** ICU template: {price} */
  suggestedLabel: string
  /** ICU template: {low} {high} */
  suggestedRange: string
  /** ICU template: {amount} */
  suggestedGain: string
}

interface AffiliatePriceFormProps {
  productId: string
  /** Prix catalogue = capital de l'affilié (déjà public). Aucune donnée coût/marge envoyée. */
  platformPrice: number
  currentCustomPrice: number | null
  strings: AffiliatePriceStrings
}

/** Minimal ICU-like interpolation for string templates with named params. */
function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

export function AffiliatePriceForm({
  productId,
  platformPrice,
  currentCustomPrice,
  strings,
}: AffiliatePriceFormProps) {
  const [state, action, isPending] = useActionState(
    saveAffiliateProductPrice,
    affiliatePriceInitialState
  )

  // Saisie contrôlée pour l'aperçu TEMPS RÉEL du gain.
  const [value, setValue] = useState<string>(
    currentCustomPrice != null ? String(currentCustomPrice) : ''
  )

  // Prix conseillé = catalogue × 1,25 ; fourchette +20 % / +30 %. Affichage pur.
  const suggested = Math.round(platformPrice * 1.25)
  const low = Math.round(platformPrice * 1.2)
  const high = Math.round(platformPrice * 1.3)

  // Gain/vente = prix saisi − catalogue (identique à la commission serveur, le
  // capital = prix catalogue). Aucun recalcul de marge/commission ici.
  const typed = value === '' ? null : Number(value)
  const gain = typed != null && Number.isFinite(typed) ? typed - platformPrice : 0

  return (
    <div className="border-t border-line pt-3 mt-1">
      <p className="text-xs font-bold text-accent-fg mb-2">💰 {strings.keepDifference}</p>

      {/* Prix conseillé — chip cliquable qui pré-remplit */}
      <button
        type="button"
        onClick={() => setValue(String(suggested))}
        className="w-full text-start mb-2 rounded-lg border border-gold-300 bg-accent-soft px-3 py-2 hover:bg-accent-soft/70 transition-colors"
      >
        <span className="block text-xs font-semibold text-accent-fg tabular-nums">
          {interpolate(strings.suggestedLabel, { price: formatMAD(suggested) })}
        </span>
        <span className="block text-xs text-success-fg tabular-nums">
          {interpolate(strings.suggestedGain, { amount: formatMAD(suggested - platformPrice) })}
        </span>
        <span className="block text-[11px] text-faint tabular-nums">
          {interpolate(strings.suggestedRange, { low: formatMAD(low), high: formatMAD(high) })}
        </span>
      </button>

      {currentCustomPrice !== null && (
        <p className="text-xs text-faint mb-1.5 tabular-nums">
          {interpolate(strings.priceVsCatalog, {
            amount: formatMAD(Math.max(0, currentCustomPrice - platformPrice)),
          })}
        </p>
      )}

      <p className="text-xs font-medium text-muted mb-1">{strings.myPrice}</p>
      <form action={action} className="flex gap-1.5 items-start">
        <input type="hidden" name="productId" value={productId} />
        <div className="flex-1 min-w-0">
          <input
            type="number"
            name="customSellPriceMad"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={platformPrice}
            step="1"
            placeholder={String(platformPrice)}
            disabled={isPending}
            className="w-full px-2.5 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2 tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 text-xs px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? strings.priceSaving : strings.priceSave}
        </button>
      </form>

      {/* Aperçu TEMPS RÉEL du gain */}
      {gain > 0 ? (
        <p className="text-xs font-semibold text-success-fg mt-1.5 tabular-nums">
          ✅ {interpolate(strings.gainPerSale, { amount: formatMAD(gain) })}
        </p>
      ) : (
        <p className="text-xs text-faint mt-1.5 leading-tight tabular-nums">
          {interpolate(strings.gainPlaceholder, { min: formatMAD(platformPrice) })}
        </p>
      )}

      {state.error && <p className="text-xs text-danger-fg mt-1">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-success-fg mt-1">
          {state.cleared ? strings.priceResetOk : strings.priceSavedOk}
        </p>
      )}
    </div>
  )
}
