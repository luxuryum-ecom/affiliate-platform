'use client'

import { useActionState } from 'react'
import { updateSupplierPayoutStatus } from '@/app/actions/supplier-payout'
import { formatMAD } from '@/lib/utils'
import type { SupplierPayoutStatus } from '@/types/database'

export const PAYOUT_STATUS_BADGE: Record<SupplierPayoutStatus, { label: string; cls: string }> = {
  not_due:        { label: 'Non exigible',      cls: 'bg-gray-100 text-gray-500' },
  pending:        { label: 'À verser',           cls: 'bg-amber-100 text-amber-700' },
  partially_paid: { label: 'Partiellement versé', cls: 'bg-blue-100 text-blue-700' },
  paid:           { label: 'Versé',              cls: 'bg-green-100 text-green-700' },
}

interface Props {
  quoteRequestId: string
  currentStatus: SupplierPayoutStatus
  payoutAmountMad: number | null
}

const initial = { error: null, success: false }

export function SupplierPayoutForm({ quoteRequestId, currentStatus, payoutAmountMad }: Props) {
  const [state, action, isPending] = useActionState(updateSupplierPayoutStatus, initial)
  const badge = PAYOUT_STATUS_BADGE[currentStatus]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Statut du reversement</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {payoutAmountMad != null && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Montant à verser</span>
            <span className={`font-bold tabular-nums text-sm ${payoutAmountMad >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatMAD(payoutAmountMad)}
            </span>
          </div>
        </div>
      )}

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={quoteRequestId} />

        <div>
          <label className="block text-xs text-gray-500 mb-1">Statut de reversement</label>
          <select
            name="supplier_payout_status"
            defaultValue={currentStatus}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 bg-white"
          >
            <option value="not_due">Non exigible</option>
            <option value="pending">À verser</option>
            <option value="partially_paid">Partiellement versé</option>
            <option value="paid">Versé</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Note (optionnelle)</label>
          <input
            type="text"
            name="notes"
            placeholder="Ex : virement effectué le 30/05"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          />
        </div>

        {state.error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Statut de reversement mis à jour.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Enregistrement…' : 'Mettre à jour le reversement'}
        </button>
      </form>
    </div>
  )
}
