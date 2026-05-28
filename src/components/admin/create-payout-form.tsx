'use client'

import { useActionState } from 'react'
import { createPayout, type CreatePayoutState } from '@/app/actions/payouts'
import { formatMAD } from '@/lib/utils'

interface Affiliate {
  id: string
  full_name: string
  approvedCommissionTotal: number
  approvedCommissionCount: number
}

interface CreatePayoutFormProps {
  affiliates: Affiliate[]
}

const initial: CreatePayoutState = { error: null, success: false, payoutId: null }

const INPUT =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50'

export function CreatePayoutForm({ affiliates }: CreatePayoutFormProps) {
  const [state, action, isPending] = useActionState(createPayout, initial)

  const eligibleAffiliates = affiliates.filter((a) => a.approvedCommissionCount > 0)

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-green-800">Paiement enregistré</p>
        <p className="text-xs text-green-700 mt-1">
          Référence&nbsp;: <span className="font-mono font-bold">{state.payoutId?.slice(0, 8).toUpperCase()}</span>
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-green-700 underline hover:no-underline"
        >
          Créer un autre paiement
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Affilié <span className="text-red-500">*</span>
        </label>
        <select name="affiliateId" required disabled={isPending} className={INPUT}>
          <option value="">Sélectionner un affilié…</option>
          {eligibleAffiliates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name} — {formatMAD(a.approvedCommissionTotal)} approuvé
              ({a.approvedCommissionCount} commission{a.approvedCommissionCount !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
        {eligibleAffiliates.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            Aucune commission approuvée en attente de paiement.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Montant versé (MAD) <span className="text-red-500">*</span>
        </label>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          disabled={isPending}
          placeholder="0.00"
          className={INPUT}
        />
        <p className="text-xs text-gray-400 mt-1">
          Montant réellement transféré (peut différer du total si versement partiel).
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Référence de virement
        </label>
        <input
          name="reference"
          type="text"
          disabled={isPending}
          placeholder="N° virement, CCP, CIH…"
          className={INPUT}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
        <input
          name="notes"
          type="text"
          disabled={isPending}
          placeholder="Remarques optionnelles"
          className={INPUT}
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || eligibleAffiliates.length === 0}
        className="w-full py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer le paiement'}
      </button>
    </form>
  )
}
