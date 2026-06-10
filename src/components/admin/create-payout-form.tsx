'use client'

import { useActionState, useEffect, useState } from 'react'
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

const initial: CreatePayoutState = { error: null, success: false, payoutId: null, amount: null }

const INPUT =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50'

export function CreatePayoutForm({ affiliates }: CreatePayoutFormProps) {
  const [state, action, isPending] = useActionState(createPayout, initial)
  const [selectedId, setSelectedId] = useState('')

  // Clé d'idempotence stable pour ce rendu du formulaire : un double-clic soumet
  // la MÊME clé → la RPC ne crée qu'un seul versement. Générée côté client (après
  // montage) pour éviter tout décalage d'hydratation SSR.
  const [idempotencyKey, setIdempotencyKey] = useState('')
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  const eligibleAffiliates = affiliates.filter((a) => a.approvedCommissionCount > 0)
  const selected = eligibleAffiliates.find((a) => a.id === selectedId) ?? null

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-green-800">Paiement enregistré</p>
        <p className="text-xs text-green-700 mt-1">
          Montant versé&nbsp;: <span className="font-bold">{formatMAD(state.amount ?? 0)}</span>
        </p>
        <p className="text-xs text-green-700 mt-0.5">
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
      {/* Clé d'idempotence — anti double-versement. Non modifiable par l'utilisateur. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Affilié <span className="text-red-500">*</span>
        </label>
        <select
          name="affiliateId"
          required
          disabled={isPending}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={INPUT}
        >
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

      {/* Montant DÉRIVÉ — lecture seule. L'admin ne saisit rien, il valide. */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Montant à verser (calculé automatiquement)
        </label>
        <div className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 tabular-nums font-semibold text-gray-900">
          {selected ? formatMAD(selected.approvedCommissionTotal) : '—'}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Somme exacte des commissions approuvées de l&apos;affilié. Non modifiable :
          le montant ne peut pas diverger des commissions soldées.
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

      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        ⚠ Vérifiez manuellement les preuves de paiement avant de valider. La validation est toujours humaine — aucune approbation automatique.
      </p>

      <button
        type="submit"
        disabled={isPending || !selected || !idempotencyKey}
        className="w-full py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isPending
          ? 'Enregistrement…'
          : selected
            ? `Valider le versement de ${formatMAD(selected.approvedCommissionTotal)}`
            : 'Valider le versement'}
      </button>
    </form>
  )
}
