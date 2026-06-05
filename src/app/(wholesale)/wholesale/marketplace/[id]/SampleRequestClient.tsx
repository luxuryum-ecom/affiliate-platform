'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { submitSampleRequest } from '@/app/actions/sample-requests'

const initial = { error: null, success: false }

const REQUEST_TYPES = [
  { value: 'photos',          label: 'Photos produit' },
  { value: 'video',           label: 'Vidéo produit' },
  { value: 'technical_sheet', label: 'Fiche technique' },
  { value: 'sample',          label: 'Échantillon physique' },
]

export default function SampleRequestClient({ supplierProductId }: { supplierProductId: string }) {
  const [state, action, isPending] = useActionState(submitSampleRequest, initial)

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-green-800">Demande envoyée</p>
        <p className="text-xs text-green-600 mt-1">
          Notre équipe traitera votre demande et vous contactera sous 24–48h.
        </p>
        <Link
          href="/wholesale/samples"
          className="inline-block mt-3 text-xs text-green-700 underline underline-offset-2 hover:no-underline"
        >
          Suivre ma demande →
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="supplier_product_id" value={supplierProductId} />

      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Type de demande</label>
        <select
          name="request_type"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Sélectionner...</option>
          {REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Message (optionnel)</label>
        <textarea
          name="message"
          rows={3}
          placeholder="Précisions sur votre demande (coloris, dimensions, format...)..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Envoi en cours...' : 'Envoyer la demande'}
      </button>
    </form>
  )
}
