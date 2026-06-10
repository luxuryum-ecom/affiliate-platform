'use client'

import { useActionState } from 'react'
import { submitWholesaleOrder } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'

const initialState: ActionState = { error: null, success: false }

export function SubmitWholesaleOrderForm() {
  const [state, action, isPending] = useActionState(submitWholesaleOrder, initialState)

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {/* Delivery details */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Informations de livraison <span className="font-normal normal-case text-gray-400">(optionnel)</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ville</label>
              <input
                name="city"
                placeholder="Ex: Casablanca"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Adresse</label>
              <input
                name="address"
                placeholder="Ex: 123 Rue Mohammed V"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Note pour l&apos;équipe</label>
            <textarea
              name="buyer_notes"
              rows={2}
              placeholder="Délai souhaité, instructions spéciales, variantes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Envoi de la commande…' : 'Soumettre la commande grossiste'}
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
