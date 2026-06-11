'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateWholesaleImportStatus } from '@/app/actions/orders'
import type { WholesaleImportStatus } from '@/types/database'

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
  const t  = useTranslations('admin.wholesaleImportForm')
  const tc = useTranslations('admin.common')
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
        text: result.error ?? (isLocalStock ? t('updatedLocal') : t('updatedImport')),
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
        <div className="mb-3 px-3 py-2 bg-accent-soft border border-accent rounded-lg">
          <p className="text-xs text-accent-fg">{t('currentStatus')}</p>
          <p className="text-sm font-semibold text-accent-fg">
            {t(`statusLabel.${currentImportStatus}`)}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {isLocalStock ? t('newStatus') : t('newStatusImport')}
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as WholesaleImportStatus)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="">{tc('select')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statusLabel.${s}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('note')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notePlaceholder')}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        {msg && (
          <p
            className={`text-xs px-3 py-2 rounded-lg ${
              msg.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'
            }`}
          >
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
    </div>
  )
}
