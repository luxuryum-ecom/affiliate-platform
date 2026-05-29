'use client'

import { useActionState } from 'react'
import { saveAffiliateProductPrice, type AffiliatePriceState } from '@/app/actions/affiliate-prices'

const affiliatePriceInitialState: AffiliatePriceState = { error: null, success: false, cleared: false }
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

  // After revalidatePath, the server re-renders with the updated currentCustomPrice prop.
  // Show the server-rendered prop directly — no client-side caching needed.
  const markup = currentCustomPrice !== null ? currentCustomPrice - platformPrice : 0

  return (
    <div className="border-t border-gray-100 pt-3 mt-1">
      <p className="text-xs font-medium text-gray-600 mb-1.5">Mon prix de vente</p>

      {currentCustomPrice !== null ? (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold text-blue-700 tabular-nums">
            {formatMAD(currentCustomPrice)}
          </span>
          {markup > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">
              +{formatMAD(markup)} vs catalogue
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-1.5">
          Non défini — prix catalogue ({formatMAD(platformPrice)})
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
          {state.cleared ? 'Prix réinitialisé au prix catalogue.' : 'Prix enregistré.'}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1 leading-tight">
        Laissez vide pour réinitialiser au prix catalogue. Min.&nbsp;{formatMAD(platformPrice)}.
      </p>
    </div>
  )
}
