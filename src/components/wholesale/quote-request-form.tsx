'use client'

import { useActionState, useState } from 'react'
import { submitQuoteRequest } from '@/app/actions/quote-requests'
import type { QuoteRequestFormState } from '@/app/actions/quote-requests'

const initial: QuoteRequestFormState = { error: null }

export function QuoteRequestForm({
  productId,
  productName,
}: {
  productId: string
  productName: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action, isPending] = useActionState(submitQuoteRequest, initial)

  if (state.success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        Votre demande de devis a bien été envoyée. Nous vous contacterons via WhatsApp.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        Demander un devis
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Demande de devis — {productName}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          Annuler
        </button>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="product_id" value={productId} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Quantité <span className="text-red-500">*</span>
            </label>
            <input
              name="quantity_requested"
              type="number"
              min={1}
              required
              placeholder="Ex : 500"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              name="whatsapp_number"
              type="tel"
              required
              placeholder="+212 6XXXXXXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Pays de destination <span className="text-red-500">*</span>
            </label>
            <input
              name="destination_country"
              type="text"
              required
              placeholder="Ex : Maroc"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ville</label>
            <input
              name="destination_city"
              type="text"
              placeholder="Ex : Casablanca"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mode de transport préféré</label>
          <select
            name="preferred_shipping_mode"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">Pas de préférence</option>
            <option value="air_door_to_door_kg">Aérien door-to-door</option>
            <option value="sea_textile_kg">Maritime textile</option>
            <option value="sea_volume_cbm">Maritime volume (CBM)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Couleurs / variantes</label>
          <input
            name="colors_or_variants"
            type="text"
            placeholder="Ex : Rouge, Bleu, Noir"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tailles</label>
          <input
            name="sizes"
            type="text"
            placeholder="Ex : S, M, L, XL"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes / précisions</label>
          <textarea
            name="buyer_notes"
            rows={3}
            placeholder="Exigences particulières, délai souhaité, conditionnement…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none resize-none"
          />
        </div>

        {state.error && (
          <p className="text-xs px-3 py-2 bg-red-50 text-red-600 rounded-lg">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Envoi en cours…' : 'Envoyer la demande'}
        </button>
      </form>
    </div>
  )
}
