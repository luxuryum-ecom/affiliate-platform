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
                    className="max-h-24 rounded-lg border border-line object-cover mb-1"
                  />
                </a>
              ) : (
                <a
                  href={p.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted hover:text-foreground hover:underline truncate transition-colors"
                >
                  📄 {PROOF_TYPES.find((tp) => tp.value === p.proof_type)?.label ?? p.proof_type}
                </a>
              )}
              <span className="text-faint ms-1 shrink-0">
                {new Date(p.uploaded_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.success && (
        <p className="text-xs text-success-fg bg-success-soft border border-success rounded px-2 py-1">
          {t('proofSuccess')}
        </p>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t('proofTypeLabel')}</label>
          <select
            name="proofType"
            defaultValue="bank_receipt"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            {PROOF_TYPES.map((tp) => (
              <option key={tp.value} value={tp.value}>{tp.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('proofFileLabel')}{' '}
            <span className="text-faint">{t('proofFileHint')}</span>
          </label>
          <input
            name="file"
            type="file"
            accept="image/*,.pdf"
            className="w-full text-xs text-muted file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 file:cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('proofUrlLabel')}{' '}
            <span className="text-faint">{t('proofUrlHint')}</span>
          </label>
          <input
            name="fileUrl"
            type="url"
            placeholder="https://…"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('proofNoteLabel')}
          </label>
          <input
            name="notes"
            type="text"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        {state.error && (
          <p className="text-xs text-danger-fg bg-danger-soft px-2 py-1 rounded border border-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full text-xs px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? t('proofSubmitting') : t('proofSubmit')}
        </button>
      </form>
    </div>
  )
}
