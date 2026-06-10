'use client'

import { useState, useTransition } from 'react'
import { updateWholesaleImportStatus } from '@/app/actions/orders'
import type { WholesaleImportStatus } from '@/types/database'

export const IMPORT_STATUS_LABELS: Record<WholesaleImportStatus, string> = {
  awaiting_supplier: 'En attente fournisseur',
  purchased:         'Acheté',
  in_production:     'En production',
  ready_to_ship:     'Prêt à expédier',
  shipped:           'Expédié',
  customs_clearance: 'Dédouanement',
  delivered:         'Livré',
}

export const IMPORT_STATUS_BADGE: Record<WholesaleImportStatus, { label: string; cls: string }> = {
  awaiting_supplier: { label: 'Attente fournisseur', cls: 'bg-gray-100 text-gray-600' },
  purchased:         { label: 'Acheté',              cls: 'bg-amber-100 text-amber-700' },
  in_production:     { label: 'En production',       cls: 'bg-orange-100 text-orange-700' },
  ready_to_ship:     { label: 'Prêt à expédier',     cls: 'bg-yellow-100 text-yellow-700' },
  shipped:           { label: 'Expédié',             cls: 'bg-blue-100 text-blue-700' },
  customs_clearance: { label: 'Dédouanement',        cls: 'bg-purple-100 text-purple-700' },
  delivered:         { label: 'Livré (import)',      cls: 'bg-green-100 text-green-700' },
}

const ALL_STATUSES: WholesaleImportStatus[] = [
  'awaiting_supplier',
  'purchased',
  'in_production',
  'ready_to_ship',
  'shipped',
  'customs_clearance',
  'delivered',
]

export function WholesaleImportStatusForm({
  orderId,
  currentImportStatus,
  isLocalStock = false,
}: {
  orderId: string
  currentImportStatus: WholesaleImportStatus | null
  isLocalStock?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<WholesaleImportStatus | ''>('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const result = await updateWholesaleImportStatus(
        orderId,
        selected as WholesaleImportStatus,
        notes || undefined
      )
      setMsg({
        ok: result.success,
        text: result.error ?? (isLocalStock ? 'Statut mis à jour.' : 'Statut import mis à jour.'),
      })
      if (result.success) {
        setSelected('')
        setNotes('')
      }
    })
  }

  return (
    <div>
      {currentImportStatus && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
          <p className="text-xs text-blue-500">Statut actuel</p>
          <p className="text-sm font-semibold text-blue-800">
            {IMPORT_STATUS_LABELS[currentImportStatus]}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isLocalStock ? 'Nouveau statut' : 'Nouveau statut import'}
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as WholesaleImportStatus)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            <option value="">Sélectionner…</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {IMPORT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Note (optionnel)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: commande passée le…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>

        {msg && (
          <p
            className={`text-xs px-3 py-2 rounded-lg ${
              msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}
          >
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
    </div>
  )
}
