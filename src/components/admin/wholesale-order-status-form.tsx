'use client'

import { useState, useTransition } from 'react'
import { updateWholesaleOrderStatus } from '@/app/actions/orders'
import type { WholesaleOrderStatus } from '@/types/database'

const TRANSITIONS: Record<WholesaleOrderStatus, WholesaleOrderStatus[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['sourcing', 'cancelled'],
  sourcing:  ['shipped', 'cancelled'],
  shipped:   ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

const LABELS: Record<WholesaleOrderStatus, string> = {
  pending:   'En attente',
  confirmed: 'Confirmée',
  sourcing:  'En sourcing',
  shipped:   'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

export function WholesaleOrderStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string
  currentStatus: WholesaleOrderStatus
}) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<WholesaleOrderStatus | ''>('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const options = TRANSITIONS[currentStatus] ?? []
  if (options.length === 0)
    return <p className="text-xs text-gray-400 italic">Statut final.</p>

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const result = await updateWholesaleOrderStatus(orderId, selected as WholesaleOrderStatus, notes || undefined)
      setMsg({ ok: result.success, text: result.error ?? 'Statut mis à jour.' })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau statut</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as WholesaleOrderStatus)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Sélectionner…</option>
          {options.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Note agent (optionnel)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Remarque interne…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
        />
      </div>
      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending || !selected}
        className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Mise à jour…' : 'Confirmer'}
      </button>
    </form>
  )
}
