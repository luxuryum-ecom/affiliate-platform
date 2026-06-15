'use client'

import { useState, useActionState } from 'react'
import { respondToQuote } from '@/app/actions/quote-requests'

export interface QuoteDecisionLabels {
  acceptBtn: string
  rejectBtn: string
  confirmAcceptTitle: string
  confirmAcceptBody: string
  confirmRejectTitle: string
  confirmRejectBody: string
  cancelBtn: string
  confirmBtn: string
  pendingBtn: string
  decisionSaved: string
}

interface Props {
  requestId: string
  labels: QuoteDecisionLabels
}

export function QuoteDecisionButtons({ requestId, labels }: Props) {
  const [state, action, isPending] = useActionState(respondToQuote, { error: null })
  const [confirmAction, setConfirmAction] = useState<
    'accepted_by_client' | 'rejected_by_client' | null
  >(null)

  if (state.success) {
    return (
      <p className="text-xs text-success-fg font-medium py-2">
        {labels.decisionSaved}
      </p>
    )
  }

  return (
    <>
      {!confirmAction && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmAction('accepted_by_client')}
            className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            {labels.acceptBtn}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('rejected_by_client')}
            className="flex-1 py-2.5 border border-danger text-danger-fg hover:bg-danger-soft text-sm font-medium rounded-lg transition-colors"
          >
            {labels.rejectBtn}
          </button>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full shadow-xl border border-line">
            <h2 className="text-base font-semibold text-foreground mb-2">
              {confirmAction === 'accepted_by_client'
                ? labels.confirmAcceptTitle
                : labels.confirmRejectTitle}
            </h2>
            <p className="text-sm text-muted mb-5">
              {confirmAction === 'accepted_by_client'
                ? labels.confirmAcceptBody
                : labels.confirmRejectBody}
            </p>
            <form action={action}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="decision" value={confirmAction} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={isPending}
                  className="flex-1 py-2.5 border border-line text-muted text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {labels.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className={`flex-1 py-2.5 text-primary-foreground text-sm font-medium rounded-lg transition-opacity disabled:opacity-50 hover:opacity-90 ${
                    confirmAction === 'accepted_by_client'
                      ? 'bg-primary'
                      : 'bg-danger-fg'
                  }`}
                >
                  {isPending ? labels.pendingBtn : labels.confirmBtn}
                </button>
              </div>
            </form>
            {state.error && (
              <p className="mt-3 text-xs text-danger-fg">{state.error}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
