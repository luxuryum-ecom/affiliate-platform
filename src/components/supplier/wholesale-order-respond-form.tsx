'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { respondToWholesaleOrder } from '@/app/actions/orders'
import type { SupplierResponse } from '@/types/database'

export type RespondFormLabels = {
  available: string
  preparing: string
  onOrder: string
  responseLabel: string
  leadTimeLabel: string
  submit: string
  submitting: string
  success: string
}

export function WholesaleOrderRespondForm({
  orderId,
  currentResponse,
  currentLeadTime,
  labels,
}: {
  orderId: string
  currentResponse: SupplierResponse | null
  currentLeadTime: number | null
  labels: RespondFormLabels
}) {
  // useTranslations() sans namespace pour mapper les clés errors.* renvoyées par l'action
  const tErr = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedResponse, setSelectedResponse] = useState<SupplierResponse>(
    currentResponse ?? 'available'
  )
  const [leadTime, setLeadTime] = useState<number>(currentLeadTime ?? 0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const RESPONSE_OPTIONS: { value: SupplierResponse; label: string }[] = [
    { value: 'available', label: labels.available },
    { value: 'preparing', label: labels.preparing },
    { value: 'on_order', label: labels.onOrder },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await respondToWholesaleOrder(orderId, selectedResponse, leadTime)
      setMsg({
        ok: result.success,
        text: result.error ? tErr(result.error as Parameters<typeof tErr>[0]) : labels.success,
      })
      if (result.success) router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {labels.responseLabel}
        </label>
        <select
          value={selectedResponse}
          onChange={(e) => setSelectedResponse(e.target.value as SupplierResponse)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {RESPONSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {labels.leadTimeLabel}
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={leadTime}
          onChange={(e) => setLeadTime(Math.max(0, Math.floor(Number(e.target.value))))}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      {msg && (
        <p
          className={`text-xs px-3 py-2 rounded-lg ${
            msg.ok
              ? 'bg-success-soft text-success-fg'
              : 'bg-danger-soft text-danger-fg'
          }`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? labels.submitting : labels.submit}
      </button>
    </form>
  )
}
