'use client'

import { useActionState, useState } from 'react'
import { requestSupplierProductQuote, type SupplierProductState } from '@/app/actions/supplier-products'
import {
  PURCHASE_PROFILE_LABELS,
  VOLUME_TIER_LABELS,
  BUYER_PURCHASE_PROFILES,
  BUYER_VOLUME_TIERS,
} from '@/lib/rfq-buyer-intake'

const initial: SupplierProductState = { error: null }

interface Props {
  supplierProductId: string
  minQuantity: number
}

export function MarketplaceQuoteForm({ supplierProductId, minQuantity }: Props) {
  const [state, action, isPending] = useActionState(requestSupplierProductQuote, initial)
  const [open, setOpen] = useState(false)

  if (state?.success) {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-100 px-4 py-3 rounded-lg">
        Demande envoyée. Notre équipe vous contactera via WhatsApp.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
      >
        Demander un devis
      </button>
    )
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplier_product_id" value={supplierProductId} />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Quantité souhaitée
        </label>
        <input
          name="quantity_requested"
          type="number"
          min={minQuantity}
          defaultValue={minQuantity}
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        />
        <p className="text-xs text-gray-400 mt-0.5">Min. {minQuantity} u.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Type d&apos;activité</label>
        <select
          name="buyer_purchase_profile"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">Sélectionner...</option>
          {BUYER_PURCHASE_PROFILES.map((value) => (
            <option key={value} value={value}>
              {PURCHASE_PROFILE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Volume estimé</label>
        <select
          name="buyer_volume_tier"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">Sélectionner...</option>
          {BUYER_VOLUME_TIERS.map((value) => (
            <option key={value} value={value}>
              {VOLUME_TIER_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Plus le volume est élevé, plus les conditions tarifaires peuvent être avantageuses.
        </p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
        <p>20 pcs → Prix standard</p>
        <p>100 pcs → Remise grossiste</p>
        <p>500 pcs → Prix usine privilégié</p>
        <p>1000+ pcs → Négociation directe plateforme</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Pays de destination</label>
        <input
          name="destination_country"
          type="text"
          defaultValue="Maroc"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Ville (optionnel)</label>
        <input
          name="destination_city"
          type="text"
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder="ex: Casablanca"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          WhatsApp <span className="text-red-500">*</span>
        </label>
        <input
          name="whatsapp_number"
          type="tel"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder="+212 6XXXXXXXX"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optionnel)</label>
        <textarea
          name="buyer_notes"
          rows={2}
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="Couleurs, tailles, variantes..."
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  )
}
