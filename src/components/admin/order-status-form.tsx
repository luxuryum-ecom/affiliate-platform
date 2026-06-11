'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
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

interface OrderStatusFormProps {
  orderId: string
  currentStatus: OrderStatus
}

export function OrderStatusForm({ orderId, currentStatus }: OrderStatusFormProps) {
  const t = useTranslations('admin')
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
      <p className="text-xs text-faint italic">{t('orders.statusFinal')}</p>
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
      setMessage({ ok: result.success, text: result.error ?? t('orders.statusUpdated') })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {t('orders.newStatus')}
        </label>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          <option value="">{t('common.select')}</option>
          {transitions.map((s) => (
            <option key={s} value={s}>
              {t(`common.cod.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Shipping fields */}
      {selectedStatus === 'shipped' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {t('orders.carrier')}
              </label>
              <input
                type="text"
                value={deliveryCompany}
                onChange={(e) => setDeliveryCompany(e.target.value)}
                placeholder={t('orders.carrierPlaceholder')}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {t('orders.trackingNumber')}
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={t('orders.trackingPlaceholder')}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>
          </div>
        </>
      )}

      {/* COD received */}
      {selectedStatus === 'delivered' && (
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('orders.codReceived')}
          </label>
          <input
            type="number"
            step="0.01"
            value={codReceived}
            onChange={(e) => setCodReceived(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>
      )}

      {/* Return reason */}
      {selectedStatus === 'returned' && (
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('orders.returnReason')}
          </label>
          <input
            type="text"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder={t('orders.returnReasonPlaceholder')}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {t('orders.internalNote')}
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('orders.internalNotePlaceholder')}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      {message && (
        <p className={`text-xs px-3 py-2 rounded-lg ${message.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !selectedStatus}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? t('common.updating') : t('orders.confirmChange')}
      </button>
    </form>
  )
}
