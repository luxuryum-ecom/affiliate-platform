'use client'

import { useState, useTransition } from 'react'
import { updateOrderStatus } from '@/app/actions/orders'
import type { OrderStatus } from '@/types/database'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_confirmation: ['confirmed'],
  confirmed:            ['shipped'],
  shipped:              ['delivered', 'returned'],
  delivered:            ['returned'],
  returned:             [],
  cancelled:            [],
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: 'En attente de confirmation',
  confirmed: 'Confirmée',
  shipped:   'Expédiée',
  delivered: 'Livrée',
  returned:  'Retournée',
  cancelled: 'Annulée',
}

interface OrderStatusFormProps {
  orderId: string
  currentStatus: OrderStatus
}

export function OrderStatusForm({ orderId, currentStatus }: OrderStatusFormProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('')
  const [deliveryCompany, setDeliveryCompany] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [codReceived, setCodReceived] = useState('')
  const [returnReason, setReturnReason] = useState('')

  const transitions = VALID_TRANSITIONS[currentStatus] ?? []
  if (transitions.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">Statut final — aucune transition possible.</p>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStatus) return

    startTransition(async () => {
      const result = await updateOrderStatus(orderId, selectedStatus as OrderStatus, {
        deliveryCompany: deliveryCompany || undefined,
        trackingNumber: trackingNumber || undefined,
        notes: notes || undefined,
        codReceived: codReceived ? parseFloat(codReceived) : undefined,
        returnReason: returnReason || undefined,
      })
      setMessage({ ok: result.success, text: result.error ?? 'Statut mis à jour.' })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Nouveau statut
        </label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Sélectionner…</option>
          {transitions.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Shipping fields */}
      {selectedStatus === 'shipped' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Transporteur
              </label>
              <input
                type="text"
                value={deliveryCompany}
                onChange={(e) => setDeliveryCompany(e.target.value)}
                placeholder="Amana, Aramex…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                N° de suivi
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="ABC123456"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
              />
            </div>
          </div>
        </>
      )}

      {/* COD received */}
      {selectedStatus === 'delivered' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Montant COD reçu (MAD)
          </label>
          <input
            type="number"
            step="0.01"
            value={codReceived}
            onChange={(e) => setCodReceived(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>
      )}

      {/* Return reason */}
      {selectedStatus === 'returned' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Motif du retour
          </label>
          <input
            type="text"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="Client absent, refus, autre…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Note interne (optionnel)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Remarque interne…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
        />
      </div>

      {message && (
        <p className={`text-xs px-3 py-2 rounded-lg ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !selectedStatus}
        className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Mise à jour…' : 'Confirmer le changement'}
      </button>
    </form>
  )
}
