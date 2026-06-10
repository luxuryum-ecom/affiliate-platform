'use client'

import { useActionState } from 'react'
import { convertQuoteToOrder } from '@/app/actions/quote-requests'
import type { ConvertQuoteFormState } from '@/app/actions/quote-requests'

const initial: ConvertQuoteFormState = { error: null }

export function ConvertQuoteButton({ requestId }: { requestId: string }) {
  const [state, action, isPending] = useActionState(convertQuoteToOrder, initial)

  return (
    <form action={action}>
      <input type="hidden" name="request_id" value={requestId} />
      {state.error && (
        <p className="text-xs text-red-600 mb-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
      >
        {isPending ? 'Création en cours…' : 'Créer commande'}
      </button>
    </form>
  )
}
