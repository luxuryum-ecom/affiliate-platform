'use client'

import { useActionState, useState } from 'react'
import { placeOrder, type OrderFormState } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'

interface CodOrderFormProps {
  productId: string
  affiliateId: string | null
  sellPrice: number
  maxQty: number
}

const initialState: OrderFormState = { error: null, success: false, orderId: null }

const INPUT =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50'

export function CodOrderForm({ productId, affiliateId, sellPrice, maxQty }: CodOrderFormProps) {
  const [state, action, isPending] = useActionState(placeOrder, initialState)
  const [qty, setQty] = useState(1)

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
          Vous serez contacté(e) sous 24&nbsp;h pour confirmer la livraison.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {affiliateId && <input type="hidden" name="affiliateId" value={affiliateId} />}
      <input type="hidden" name="quantity" value={qty} />

      {/* Qty selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">
          Quantité
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-lg leading-none"
          >
            −
          </button>
          <span className="w-12 text-center font-semibold text-gray-900">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
            disabled={qty >= maxQty}
            className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-lg leading-none"
          >
            +
          </button>
          <span className="text-xs text-gray-400 ml-1">
            Total&nbsp;:{' '}
            <strong className="text-gray-900">{formatMAD(total)}</strong>
          </span>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Customer info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          />
        </div>
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
          placeholder="Ex : Casablanca, Rabat, Marrakech…"
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
          placeholder="Couleur, taille ou autre…"
          className={INPUT}
        />
      </div>

      {/* COD badge */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
        💵 Paiement à la livraison (COD) — {formatMAD(total)}
      </div>

      {/* Error */}
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || maxQty === 0}
        className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending
          ? 'Envoi en cours…'
          : maxQty === 0
          ? 'Produit épuisé'
          : 'Commander maintenant'}
      </button>

      <p className="text-xs text-center text-gray-400">
        En commandant, vous acceptez d&apos;être contacté(e) pour confirmer la livraison.
      </p>
    </form>
  )
}
