'use client'

import { useActionState } from 'react'
import { addSupplierIssue } from '@/app/actions/supplier-issues'
import type { Profile } from '@/types/database'

type Props = {
  suppliers: Pick<Profile, 'id' | 'full_name'>[]
}

const ISSUE_LABELS: Record<string, string> = {
  delay: 'Retard de livraison',
  quality_problem: 'Problème qualité',
  wrong_quantity: 'Quantité incorrecte',
  communication_problem: 'Problème de communication',
  other: 'Autre',
}

export default function AddIssueForm({ suppliers }: Props) {
  const [state, action, isPending] = useActionState(addSupplierIssue, { error: null })

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
          Incident enregistré.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fournisseur *</label>
          <select
            name="supplier_id"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">— Sélectionner —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type d&apos;incident *</label>
          <select
            name="issue_type"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">— Sélectionner —</option>
            {Object.entries(ISSUE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Jours de livraison
            <span className="text-gray-400 font-normal ml-1">(optionnel — pour calcul moyenne)</span>
          </label>
          <input
            type="number"
            name="delivery_days"
            min={1}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="ex: 14"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Note interne
            <span className="text-gray-400 font-normal ml-1">(optionnel)</span>
          </label>
          <input
            type="text"
            name="notes"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Détails de l'incident…"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Enregistrement…' : "Enregistrer l'incident"}
        </button>
      </div>
    </form>
  )
}
