'use client'

import { useActionState } from 'react'
import { saveAffiliateProductPrice, affiliatePriceInitialState } from '@/app/actions/affiliate-prices'
import { formatMAD } from '@/lib/utils'

interface AffiliatePriceFormProps {
  productId: string
  platformPrice: number
  currentCustomPrice: number | null
}

export function AffiliatePriceForm({
  productId,
  platformPrice,
  currentCustomPrice,
}: AffiliatePriceFormProps) {
  const [state, action, isPending] = useActionState(
    saveAffiliateProductPrice,
    affiliatePriceInitialState
  )

  const isSet = currentCustomPrice !== null && !state.success
  const displayPrice = state.success ? null : currentCustomPrice

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <p className="text-xs font-medium text-gray-600 mb-1.5">Mon prix de vente</p>

      {displayPrice !== null ? (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-blue-700 tabular-nums">
            {formatMAD(displayPrice)}
          </span>
          <span className="text-xs text-gray-400">
            +{formatMAD(displayPrice - platformPrice + (displayPrice > platformPrice ? 0 : 0))} vs catalogue
          </span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-1.5">
          Non défini — prix catalogue utilisé ({formatMAD(platformPrice)})
        </p>
      )}

      <form action={action} className="flex gap-1.5 items-start">
        <input type="hidden" name="productId" value={productId} />
        <div className="flex-1 min-w-0">
          <input
            type="number"
            name="customSellPriceMad"
            defaultValue={isSet ? currentCustomPrice! : ''}
            min={platformPrice}
            step="1"
            placeholder={`Min. ${platformPrice} MAD`}
            disabled={isPending}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 text-xs px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? '…' : 'Enregistrer'}
        </button>
      </form>

      {state.error && (
        <p className="text-xs text-red-600 mt-1">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600 mt-1">
          {isSet ? 'Prix mis à jour.' : 'Prix réinitialisé au prix catalogue.'}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1 leading-tight">
        Laissez vide pour utiliser le prix catalogue. Min.&nbsp;{formatMAD(platformPrice)}.
      </p>
    </div>
  )
}
