'use client'

import { useActionState, useRef } from 'react'
import { addWholesaleOrderProof } from '@/app/actions/orders'
import type { OrderProof } from '@/types/database'
import type { ActionState } from '@/types/orders'

const PROOF_TYPES = [
  { value: 'bank_receipt',   label: 'Reçu bancaire' },
  { value: 'transfer_proof', label: 'Preuve de virement' },
  { value: 'other',          label: 'Autre' },
]

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

function isImageUrl(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return IMAGE_EXTS.some((ext) => path.endsWith(`.${ext}`))
  } catch {
    return false
  }
}

interface Props {
  orderId: string
  existingProofs: OrderProof[]
}

export function WholesaleProofForm({ orderId, existingProofs }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, isPending] = useActionState(
    async (_prev: ActionState, formData: FormData) => {
      const result = await addWholesaleOrderProof(_prev, formData)
      if (result.success) formRef.current?.reset()
      return result
    },
    { error: null, success: false } as ActionState
  )

  return (
    <div className="space-y-3">
      {/* Existing proofs with preview */}
      {existingProofs.length > 0 && (
        <ul className="space-y-2">
          {existingProofs.map((p) => (
            <li key={p.id} className="text-xs">
              {isImageUrl(p.file_url) ? (
                <a href={p.file_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={p.file_url}
                    alt={p.proof_type}
                    className="max-h-24 rounded-lg border border-gray-200 object-cover mb-1"
                  />
                </a>
              ) : (
                <a
                  href={p.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate"
                >
                  📄 {PROOF_TYPES.find((t) => t.value === p.proof_type)?.label ?? p.proof_type}
                </a>
              )}
              <span className="text-gray-400 ml-1 shrink-0">
                {new Date(p.uploaded_at).toLocaleDateString('fr-MA')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.success && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          ✓ Justificatif envoyé.
        </p>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            name="proofType"
            defaultValue="bank_receipt"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {PROOF_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fichier <span className="text-gray-400">(PDF, image — max 10 Mo)</span>
          </label>
          <input
            name="file"
            type="file"
            accept="image/*,.pdf"
            className="w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700 file:cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Ou URL externe <span className="text-gray-400">(si pas de fichier)</span>
          </label>
          <input
            name="fileUrl"
            type="url"
            placeholder="https://…"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Note (optionnel)
          </label>
          <input
            name="notes"
            type="text"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>

        {state.error && (
          <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full text-xs px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? 'Envoi…' : 'Envoyer le justificatif'}
        </button>
      </form>
    </div>
  )
}
