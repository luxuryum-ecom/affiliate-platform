'use client'

import { useActionState } from 'react'
import { updateWholesalePaymentStatus } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { WholesalePaymentStatus } from '@/types/database'

export const PAYMENT_STATUS_BADGE: Record<WholesalePaymentStatus, { label: string; cls: string }> = {
  no_deposit:        { label: 'Aucun acompte',       cls: 'bg-gray-100 text-gray-500' },
  deposit_requested: { label: 'Acompte demandé',     cls: 'bg-amber-100 text-amber-700' },
  deposit_received:  { label: 'Acompte reçu',        cls: 'bg-blue-100 text-blue-700' },
  fully_paid:        { label: 'Entièrement réglé',   cls: 'bg-green-100 text-green-700' },
}

interface Props {
  orderId: string
  totalAmount: number
  currentStatus: WholesalePaymentStatus
  depositAmount: number | null
  depositReceived: number
}

const initial = { error: null, success: false }

export function WholesalePaymentForm({
  orderId,
  totalAmount,
  currentStatus,
  depositAmount,
  depositReceived,
}: Props) {
  const [state, action, isPending] = useActionState(updateWholesalePaymentStatus, initial)

  const remainingBalance = totalAmount - depositReceived

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Suivi du paiement</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_BADGE[currentStatus].cls}`}>
          {PAYMENT_STATUS_BADGE[currentStatus].label}
        </span>
      </div>

      {/* Balance summary */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Total commande</span>
          <span className="font-semibold tabular-nums text-gray-900">{formatMAD(totalAmount)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Acompte demandé</span>
          <span className="font-medium tabular-nums text-gray-700">
            {depositAmount != null ? formatMAD(depositAmount) : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Acompte reçu</span>
          <span className="font-medium tabular-nums text-blue-700">{formatMAD(depositReceived)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-gray-200 pt-2">
          <span className="text-xs font-semibold text-gray-700">Solde restant</span>
          <span className={`font-bold tabular-nums text-sm ${remainingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatMAD(remainingBalance)}
          </span>
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs text-gray-500 mb-1">Statut de paiement</label>
          <select
            name="payment_status"
            defaultValue={currentStatus}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 bg-white"
          >
            <option value="no_deposit">Aucun acompte</option>
            <option value="deposit_requested">Acompte demandé</option>
            <option value="deposit_received">Acompte reçu</option>
            <option value="fully_paid">Entièrement réglé</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Montant de l&apos;acompte (MAD)</label>
          <div className="relative">
            <input
              type="number"
              name="deposit_amount"
              defaultValue={depositAmount ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Acompte reçu (MAD)</label>
          <div className="relative">
            <input
              type="number"
              name="deposit_received_amount"
              defaultValue={depositReceived}
              min={0}
              step={0.01}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Note (optionnelle)</label>
          <input
            type="text"
            name="notes"
            placeholder="Ex : virement reçu le 28/05"
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
            Paiement mis à jour.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Enregistrement…' : 'Mettre à jour le paiement'}
        </button>
      </form>
    </div>
  )
}
