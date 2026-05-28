'use client'

import { useActionState } from 'react'
import { addOrderProof } from '@/app/actions/commissions'
import type { OrderProof, ProofType } from '@/types/database'

const PROOF_TYPES: { value: ProofType; label: string }[] = [
  { value: 'delivery_receipt', label: 'Reçu livraison' },
  { value: 'transfer_proof', label: 'Preuve virement COD' },
  { value: 'bank_receipt', label: 'Reçu bancaire' },
  { value: 'return_receipt', label: 'Reçu retour' },
  { value: 'other', label: 'Autre' },
]

interface OrderProofFormProps {
  orderId: string
  existingProofs: OrderProof[]
}

export function OrderProofForm({ orderId, existingProofs }: OrderProofFormProps) {
  const [state, action, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      return addOrderProof(formData)
    },
    { error: null }
  )

  return (
    <div className="space-y-3">
      {existingProofs.length > 0 && (
        <ul className="space-y-1.5">
          {existingProofs.map((p) => (
            <li key={p.id} className="text-xs">
              <a
                href={p.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {p.proof_type}
              </a>
              <span className="text-gray-400 ml-2">
                {new Date(p.uploaded_at).toLocaleDateString('fr-MA')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            name="proofType"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            defaultValue="delivery_receipt"
          >
            {PROOF_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            URL du fichier (Storage / lien)
          </label>
          <input
            name="fileUrl"
            type="url"
            required
            placeholder="https://…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note (optionnel)</label>
          <input
            name="notes"
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {state.error && (
          <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? 'Envoi…' : 'Ajouter une preuve'}
        </button>
      </form>
    </div>
  )
}
