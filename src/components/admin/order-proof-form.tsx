'use client'

import { useActionState, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { addOrderProof } from '@/app/actions/commissions'
import type { OrderProof, ProofType } from '@/types/database'

const PROOF_TYPES: ProofType[] = [
  'delivery_receipt',
  'transfer_proof',
  'bank_receipt',
  'return_receipt',
  'other',
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

interface OrderProofFormProps {
  orderId: string
  existingProofs: OrderProof[]
}

export function OrderProofForm({ orderId, existingProofs }: OrderProofFormProps) {
  const t = useTranslations('admin')
  const locale = useLocale()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, isPending] = useActionState(
    async (_prev: { error: string | null; success?: boolean }, formData: FormData) => {
      const result = await addOrderProof(formData)
      if (!result.error) formRef.current?.reset()
      return { ...result, success: !result.error }
    },
    { error: null, success: false }
  )

  const proofLabel = (value: string) =>
    PROOF_TYPES.includes(value as ProofType) ? t(`orders.proof.${value}`) : value

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
                  className="inline-flex items-center gap-1 text-gold-500 hover:text-gold-600 hover:underline"
                >
                  📄 {proofLabel(p.proof_type)}
                </a>
              )}
              <span className="text-faint ml-1">
                {new Date(p.uploaded_at).toLocaleDateString(locale)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.success && (
        <p className="text-xs text-success-fg bg-success-soft border border-success rounded px-2 py-1">
          ✓ {t('orders.proofAdded')}
        </p>
      )}

      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t('common.type')}</label>
          <select
            name="proofType"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            defaultValue="delivery_receipt"
          >
            {PROOF_TYPES.map((value) => (
              <option key={value} value={value}>
                {proofLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('orders.file')} <span className="text-faint">{t('orders.fileHint')}</span>
          </label>
          <input
            name="file"
            type="file"
            accept="image/*,.pdf"
            className="w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 file:cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('orders.fileUrl')} <span className="text-faint">{t('orders.fileUrlHint')}</span>
          </label>
          <input
            name="fileUrl"
            type="url"
            placeholder="https://…"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t('orders.noteOptional')}</label>
          <input
            name="notes"
            type="text"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        {state.error && (
          <p className="text-xs text-danger-fg bg-danger-soft px-2 py-1 rounded">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? t('common.sending') : t('orders.addProof')}
        </button>
      </form>
    </div>
  )
}
