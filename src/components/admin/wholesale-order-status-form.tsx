'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
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

export function WholesaleOrderStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string
  currentStatus: WholesaleOrderStatus
}) {
  const t  = useTranslations('admin.wholesaleStatusForm')
  const tc = useTranslations('admin.common')
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<WholesaleOrderStatus | ''>('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const options = TRANSITIONS[currentStatus] ?? []
  if (options.length === 0)
    return <p className="text-xs text-faint italic">{t('statusFinal')}</p>

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const result = await updateWholesaleOrderStatus(orderId, selected as WholesaleOrderStatus, notes || undefined)
      setMsg({ ok: result.success, text: result.error ?? t('statusUpdated') })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('newStatus')}</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as WholesaleOrderStatus)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          <option value="">{tc('select')}</option>
          {options.map((s) => <option key={s} value={s}>{tc(`wholesaleStatus.${s}`)}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('agentNote')}</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('agentNotePlaceholder')}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>
      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`}>
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending || !selected}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? tc('updating') : t('confirm')}
      </button>
    </form>
  )
}
