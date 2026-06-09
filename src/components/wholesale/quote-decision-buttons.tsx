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
      <p className="text-xs text-green-700 font-medium py-2">
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
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {labels.acceptBtn}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction('rejected_by_client')}
            className="flex-1 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
          >
            {labels.rejectBtn}
          </button>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              {confirmAction === 'accepted_by_client'
                ? labels.confirmAcceptTitle
                : labels.confirmRejectTitle}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
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
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {labels.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className={`flex-1 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    confirmAction === 'accepted_by_client'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isPending ? labels.pendingBtn : labels.confirmBtn}
                </button>
              </div>
            </form>
            {state.error && (
              <p className="mt-3 text-xs text-red-600">{state.error}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
