'use client'

import { useActionState } from 'react'
import { prepareQuote } from '@/app/actions/quote-requests'
import type { QuoteRequest } from '@/types/database'

interface Props {
  requestId: string
  quantityRequested: number
  currentQuote: Pick<
    QuoteRequest,
    | 'quoted_unit_price_mad'
    | 'quoted_quantity'
    | 'quoted_transport_total_mad'
    | 'quoted_shipping_mode'
    | 'quoted_delivery_delay'
    | 'quote_validity_date'
    | 'quote_public_note'
  >
}

const initialState = { error: null }

export function PrepareQuoteForm({ requestId, quantityRequested, currentQuote }: Props) {
  const [state, action, isPending] = useActionState(prepareQuote, initialState)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Prix unitaire (MAD) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="quoted_unit_price_mad"
            step="0.01"
            min="0.01"
            required
            defaultValue={currentQuote.quoted_unit_price_mad ?? ''}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Quantité <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="quoted_quantity"
            min="1"
            required
            defaultValue={currentQuote.quoted_quantity ?? quantityRequested}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Transport + douane total (MAD) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="quoted_transport_total_mad"
          step="0.01"
          min="0"
          required
          defaultValue={currentQuote.quoted_transport_total_mad ?? ''}
          placeholder="0.00"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mode de transport</label>
        <input
          type="text"
          name="quoted_shipping_mode"
          defaultValue={currentQuote.quoted_shipping_mode ?? ''}
          placeholder="ex. Aérien door-to-door, Maritime FCL…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Délai de livraison estimé</label>
        <input
          type="text"
          name="quoted_delivery_delay"
          defaultValue={currentQuote.quoted_delivery_delay ?? ''}
          placeholder="ex. 21–28 jours ouvrés"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Validité du devis</label>
        <input
          type="date"
          name="quote_validity_date"
          defaultValue={currentQuote.quote_validity_date ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Note publique au client</label>
        <textarea
          name="quote_public_note"
          rows={3}
          defaultValue={currentQuote.quote_public_note ?? ''}
          placeholder="Conditions particulières, remarques visibles par le client…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none resize-none"
        />
      </div>

      {state.error && (
        <p className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700">
          Devis enregistré — statut mis à jour en &laquo;&nbsp;Devis préparé&nbsp;&raquo;.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer le devis'}
      </button>
    </form>
  )
}
