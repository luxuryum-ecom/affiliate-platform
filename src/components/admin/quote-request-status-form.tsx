'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateQuoteRequestStatus } from '@/app/actions/quote-requests'
import type { QuoteRequestStatus } from '@/types/database'

const ALL_STATUSES: QuoteRequestStatus[] = [
  'new', 'studying', 'quoted', 'quote_prepared',
  'accepted_by_client', 'rejected_by_client',
  'negotiating', 'approved', 'rejected', 'converted_to_order',
]

export function QuoteRequestStatusForm({
  requestId,
  currentStatus,
  currentNotes,
  currentNotesPublic,
}: {
  requestId: string
  currentStatus: QuoteRequestStatus
  currentNotes: string | null
  currentNotesPublic: boolean
}) {
  const t = useTranslations('admin.quoteStatusForm')
  const tc = useTranslations('admin.common')
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<QuoteRequestStatus>(currentStatus)
  const [notes, setNotes] = useState(currentNotes ?? '')
  const [notesPublic, setNotesPublic] = useState(currentNotesPublic)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const STATUS_LABEL: Record<QuoteRequestStatus, string> = {
    new:                t('statusNew'),
    studying:           t('statusStudying'),
    quoted:             t('statusQuoted'),
    quote_prepared:     t('statusQuotePrepared'),
    accepted_by_client: t('statusAcceptedByClient'),
    rejected_by_client: t('statusRejectedByClient'),
    negotiating:        t('statusNegotiating'),
    approved:           t('statusApproved'),
    rejected:           t('statusRejected'),
    converted_to_order: t('statusConvertedToOrder'),
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateQuoteRequestStatus(requestId, selected, notes, notesPublic)
      setMsg({ ok: result.success, text: result.error ?? t('successMessage') })
    })
  }

  const inputCls = "w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelStatus')}</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as QuoteRequestStatus)}
          className={inputCls}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelNotes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={t('placeholderNotes')}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={notesPublic}
          onChange={(e) => setNotesPublic(e.target.checked)}
          className="rounded border-line focus:ring-gold-400"
        />
        <span className="text-xs text-muted">{t('notesPublicLabel')}</span>
      </label>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${
          msg.ok
            ? 'bg-success-subtle text-success border-success-line'
            : 'bg-danger-subtle text-danger border-danger-line'
        }`}>
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending ? t('submitting') : t('submitLabel')}
      </button>
    </form>
  )
}
