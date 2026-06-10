'use client'

import { useActionState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { addWholesaleOrderProof } from '@/app/actions/orders'
import type { OrderProof } from '@/types/database'
import type { ActionState } from '@/types/orders'

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
  const t = useTranslations('wholesale.orderDetail')
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, isPending] = useActionState(
    async (_prev: ActionState, formData: FormData) => {
      const result = await addWholesaleOrderProof(_prev, formData)
      if (result.success) formRef.current?.reset()
      return result
    },
    { error: null, success: false } as ActionState
  )

  // Proof type options using i18n labels
  const PROOF_TYPES = [
    { value: 'bank_receipt',   label: t('proofTypeBankReceipt') },
    { value: 'transfer_proof', label: t('proofTypeTransfer') },
    { value: 'other',          label: t('proofTypeOther') },
  ]

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
                  📄 {PROOF_TYPES.find((tp) => tp.value === p.proof_type)?.label ?? p.proof_type}
                </a>
              )}
              <span className="text-gray-400 ms-1 shrink-0">
                {new Date(p.uploaded_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.success && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          {t('proofSuccess')}
        </p>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('proofTypeLabel')}</label>
          <select
            name="proofType"
            defaultValue="bank_receipt"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {PROOF_TYPES.map((tp) => (
              <option key={tp.value} value={tp.value}>{tp.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('proofFileLabel')}{' '}
            <span className="text-gray-400">{t('proofFileHint')}</span>
          </label>
          <input
            name="file"
            type="file"
            accept="image/*,.pdf"
            className="w-full text-xs text-gray-700 file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700 file:cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('proofUrlLabel')}{' '}
            <span className="text-gray-400">{t('proofUrlHint')}</span>
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
            {t('proofNoteLabel')}
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
          {isPending ? t('proofSubmitting') : t('proofSubmit')}
        </button>
      </form>
    </div>
  )
}
