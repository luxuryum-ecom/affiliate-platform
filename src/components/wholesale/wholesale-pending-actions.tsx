'use client'

import { useActionState } from 'react'
import { cancelWholesaleOrderBuyer, updateWholesaleOrderBuyerNote } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'

interface Props {
  orderId: string
  currentNote: string | null
}

const init: ActionState = { error: null, success: false }

export function WholesalePendingActions({ orderId, currentNote }: Props) {
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelWholesaleOrderBuyer, init)
  const [noteState, noteAction, notePending] = useActionState(updateWholesaleOrderBuyerNote, init)

  function handleCancel(e: React.FormEvent) {
    if (!window.confirm('Annuler définitivement cette commande ?')) e.preventDefault()
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Modifier la commande</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Commande en attente — vous pouvez mettre à jour votre note ou l&apos;annuler avant traitement.
        </p>
      </div>

      <form action={noteAction} className="space-y-2">
        <input type="hidden" name="orderId" value={orderId} />
        <label className="block text-xs font-medium text-gray-600">Note pour l&apos;équipe</label>
        <textarea
          name="buyer_notes"
          defaultValue={currentNote ?? ''}
          rows={2}
          placeholder="Délai souhaité, instructions spéciales…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
        {noteState.error && (
          <p className="text-xs text-red-600">{noteState.error}</p>
        )}
        {noteState.success && (
          <p className="text-xs text-green-600">Note mise à jour.</p>
        )}
        <button
          type="submit"
          disabled={notePending}
          className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {notePending ? 'Sauvegarde…' : 'Sauvegarder la note'}
        </button>
      </form>

      <hr className="border-gray-100" />

      <form action={cancelAction} onSubmit={handleCancel}>
        <input type="hidden" name="orderId" value={orderId} />
        {cancelState.error && (
          <p className="text-xs text-red-600 mb-2">{cancelState.error}</p>
        )}
        <button
          type="submit"
          disabled={cancelPending}
          className="px-4 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {cancelPending ? 'Annulation…' : 'Annuler la commande'}
        </button>
      </form>
    </div>
  )
}
