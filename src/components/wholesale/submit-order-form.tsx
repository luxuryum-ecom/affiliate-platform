'use client'

import { useActionState } from 'react'
import { submitWholesaleOrder } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'

const initialState: ActionState = { error: null, success: false }

export function SubmitWholesaleOrderForm() {
  const [state, action, isPending] = useActionState(submitWholesaleOrder, initialState)

  return (
    <div className="space-y-2">
      <form action={action}>
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Envoi de la commande…' : 'Soumettre la commande grossiste'}
        </button>
      </form>

      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
    </div>
  )
}
