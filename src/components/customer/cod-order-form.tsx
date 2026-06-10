'use client'

import { useActionState, useEffect, useState } from 'react'
import { placeOrder } from '@/app/actions/orders'
import type { OrderFormState } from '@/types/orders'
import { recordAffiliateClick } from '@/app/actions/affiliate-clicks'
import { formatMAD } from '@/lib/utils'
import {
  getOrCreateSessionId,
  storeAttribution,
  readAttribution,
} from '@/lib/affiliate-attribution'
import { WhatsAppCodButton } from '@/components/customer/whatsapp-cod-button'

interface CodOrderFormProps {
  productId: string
  affiliateIdFromUrl: string | null
  productName: string
  sellPrice: number
  maxQty: number
}

const initialState: OrderFormState = { error: null, success: false, orderId: null }

const INPUT =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50'

export function CodOrderForm({
  productId,
  affiliateIdFromUrl,
  productName,
  sellPrice,
  maxQty,
}: CodOrderFormProps) {
  const [state, action, isPending] = useActionState(placeOrder, initialState)
  const [qty, setQty] = useState(1)
  const [attribution, setAttribution] = useState<{
    affiliateId: string | null
    clickId: string | null
  }>({ affiliateId: affiliateIdFromUrl, clickId: null })

  useEffect(() => {
    const sessionId = getOrCreateSessionId()

    if (affiliateIdFromUrl) {
      // Fresh visit via ?ref= link: record click server-side, then store attribution
      // with the real clickId so subsequent visits and the order submission both have it.
      setAttribution({ affiliateId: affiliateIdFromUrl, clickId: null })
      recordAffiliateClick(affiliateIdFromUrl, productId, sessionId).then(({ clickId }) => {
        storeAttribution({ affiliateId: affiliateIdFromUrl, productId, clickId, sessionId })
        setAttribution({ affiliateId: affiliateIdFromUrl, clickId })
      })
    } else {
      // Return visit without ?ref=: recover affiliate + clickId from 30-day localStorage window.
      const stored = readAttribution(productId)
      if (stored) {
        setAttribution({ affiliateId: stored.affiliateId, clickId: stored.clickId })
      }
    }
  }, [affiliateIdFromUrl, productId])

  const total = sellPrice * qty

  if (state.success && state.orderId) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-2">
        <p className="text-2xl">✓</p>
        <p className="font-semibold text-green-800">Commande enregistrée !</p>
        <p className="text-sm text-green-700">
          Référence&nbsp;:{' '}
          <span className="font-mono font-bold">{state.orderId.slice(0, 8).toUpperCase()}</span>
        </p>
        <p className="text-xs text-green-600 pt-1">
          Notre équipe vous contactera sous 24&nbsp;h pour confirmer votre commande COD.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        {attribution.affiliateId && (
          <input type="hidden" name="affiliateId" value={attribution.affiliateId} />
        )}
        {attribution.clickId && (
          <input type="hidden" name="attributionClickId" value={attribution.clickId} />
        )}
        <input type="hidden" name="quantity" value={qty} />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Quantité</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-lg"
            >
              −
            </button>
            <span className="w-12 text-center font-semibold text-gray-900 text-lg">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty}
              className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-lg"
            >
              +
            </button>
            <span className="text-sm text-gray-500 ml-auto">
              Total&nbsp;: <strong className="text-gray-900">{formatMAD(total)}</strong>
            </span>
          </div>
        </div>

        <hr className="border-gray-100" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nom complet <span className="text-red-500">*</span>
            </label>
            <input
              name="customer_name"
              type="text"
              required
              disabled={isPending}
              placeholder="Votre nom et prénom"
              className={INPUT}
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Téléphone <span className="text-red-500">*</span>
            </label>
            <input
              name="customer_phone"
              type="tel"
              required
              disabled={isPending}
              placeholder="06 00 00 00 00"
              className={INPUT}
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ville <span className="text-red-500">*</span>
            </label>
            <input
              name="customer_city"
              type="text"
              required
              disabled={isPending}
              placeholder="Casablanca, Rabat, Marrakech…"
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Adresse de livraison <span className="text-red-500">*</span>
            </label>
            <textarea
              name="customer_address"
              required
              disabled={isPending}
              rows={2}
              placeholder="N° rue, quartier, immeuble…"
              className={INPUT + ' resize-none'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Remarques (optionnel)
            </label>
            <input
              name="notes"
              type="text"
              disabled={isPending}
              placeholder="Couleur, taille…"
              className={INPUT}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-800">
          💵 Paiement à la livraison (COD) — {formatMAD(total)}
        </div>

        {state.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || maxQty === 0}
          className="w-full py-3.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isPending
            ? 'Envoi en cours…'
            : maxQty === 0
            ? 'Produit épuisé'
            : 'Commander en COD'}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">ou</span>
        </div>
      </div>

      <WhatsAppCodButton productName={productName} sellPrice={sellPrice} />

      <p className="text-xs text-center text-gray-400 leading-relaxed">
        En commandant, vous acceptez d&apos;être contacté(e) pour confirmer la livraison.
      </p>
    </div>
  )
}
