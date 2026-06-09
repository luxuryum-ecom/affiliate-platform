'use client'

import { useActionState } from 'react'
import { submitWholesaleOrder } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'

interface SubmitOrderLabels {
  deliverySection: string
  deliveryOptional: string
  fieldCity: string
  fieldCityPlaceholder: string
  fieldAddress: string
  fieldAddressPlaceholder: string
  fieldNotes: string
  fieldNotesPlaceholder: string
  submitOrder: string
  submittingOrder: string
}

const defaultLabels: SubmitOrderLabels = {
  deliverySection: 'Informations de livraison',
  deliveryOptional: '(optionnel)',
  fieldCity: 'Ville',
  fieldCityPlaceholder: 'Ex: Casablanca',
  fieldAddress: 'Adresse',
  fieldAddressPlaceholder: 'Ex: 123 Rue Mohammed V',
  fieldNotes: "Note pour l'équipe",
  fieldNotesPlaceholder: 'Délai souhaité, instructions spéciales, variantes…',
  submitOrder: 'Soumettre la commande grossiste',
  submittingOrder: 'Envoi de la commande…',
}

const initialState: ActionState = { error: null, success: false }

export function SubmitWholesaleOrderForm({ labels = defaultLabels }: { labels?: SubmitOrderLabels }) {
  const [state, action, isPending] = useActionState(submitWholesaleOrder, initialState)

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {/* Delivery details */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {labels.deliverySection}{' '}
            <span className="font-normal normal-case text-gray-400">{labels.deliveryOptional}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{labels.fieldCity}</label>
              <input
                name="city"
                placeholder={labels.fieldCityPlaceholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{labels.fieldAddress}</label>
              <input
                name="address"
                placeholder={labels.fieldAddressPlaceholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">{labels.fieldNotes}</label>
            <textarea
              name="buyer_notes"
              rows={2}
              placeholder={labels.fieldNotesPlaceholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? labels.submittingOrder : labels.submitOrder}
        </button>
      </form>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
    </div>
  )
}
