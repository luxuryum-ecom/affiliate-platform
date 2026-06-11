'use client'

import { useActionState } from 'react'
import { saveAffiliateProductPrice, type AffiliatePriceState } from '@/app/actions/affiliate-prices'

const affiliatePriceInitialState: AffiliatePriceState = { error: null, success: false, cleared: false }
import { formatMAD } from '@/lib/utils'

export interface AffiliatePriceStrings {
  myPrice: string
  /** ICU template: {amount} */
  priceVsCatalog: string
  /** ICU template: {price} */
  priceNotSet: string
  priceSave: string
  priceSaving: string
  /** ICU template: {min} */
  priceReset: string
  /** ICU template: {min} */
  priceMin: string
  priceSavedOk: string
  priceResetOk: string
}

interface AffiliatePriceFormProps {
  productId: string
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

  const markup = currentCustomPrice !== null ? currentCustomPrice - platformPrice : 0
  const minFormatted = formatMAD(platformPrice)

  return (
    <div className="border-t border-line pt-3 mt-1">
      <p className="text-xs font-medium text-muted mb-1.5">{strings.myPrice}</p>

      {currentCustomPrice !== null ? (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-accent-fg tabular-nums">
            {formatMAD(currentCustomPrice)}
          </span>
          {markup > 0 && (
            <span className="text-xs text-faint tabular-nums">
              {interpolate(strings.priceVsCatalog, { amount: formatMAD(markup) })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-faint mb-1.5">
          {interpolate(strings.priceNotSet, { price: minFormatted })}
        </p>
      )}

      <form action={action} className="flex gap-1.5 items-start">
        <input type="hidden" name="productId" value={productId} />
        <div className="flex-1 min-w-0">
          <input
            type="number"
            name="customSellPriceMad"
            defaultValue={currentCustomPrice ?? ''}
            min={platformPrice}
            step="1"
            placeholder={interpolate(strings.priceMin, { min: String(platformPrice) })}
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

      {state.error && (
        <p className="text-xs text-danger-fg mt-1">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-success-fg mt-1">
          {state.cleared ? strings.priceResetOk : strings.priceSavedOk}
        </p>
      )}

      <p className="text-xs text-faint mt-1 leading-tight">
        {interpolate(strings.priceReset, { min: minFormatted })}
      </p>
    </div>
  )
}
