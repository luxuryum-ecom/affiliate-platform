'use client'

import { useActionState } from 'react'
import { submitRfqOffer } from '@/app/actions/rfq-engine'

const initial = { error: null, success: false }

export default function OfferForm({ matchId }: { matchId: string }) {
  const [state, action, isPending] = useActionState(submitRfqOffer, initial)

  if (state.success) {
    return (
      <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        Réponse envoyée avec succès.
      </div>
    )
  }

  return (
    <form action={action} className="space-y-3 pt-3 border-t border-gray-100">
      <input type="hidden" name="rfq_match_id" value={matchId} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Type de réponse</label>
        <select
          name="response_type"
          required
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Choisir...</option>
          <option value="offer">📨 Soumettre une offre</option>
          <option value="decline">❌ Décliner</option>
          <option value="clarification">❓ Demander une clarification</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Prix/unité (USD)</label>
          <input
            name="unit_price_usd"
            type="number"
            step="0.01"
            min={0}
            placeholder="2.50"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">MOQ offert</label>
          <input
            name="moq_offered"
            type="number"
            min={1}
            placeholder="500"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Délai (jours)</label>
          <input
            name="lead_time_days"
            type="number"
            min={1}
            placeholder="15"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
        <textarea
          name="message"
          rows={2}
          placeholder="Précisions, conditions, questions..."
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Envoi...' : 'Envoyer la réponse'}
      </button>
    </form>
  )
}
