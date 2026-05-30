'use client'

import { useState, useTransition } from 'react'
import { updateQuoteRequestStatus } from '@/app/actions/quote-requests'
import type { QuoteRequestStatus } from '@/types/database'

const ALL_STATUSES: QuoteRequestStatus[] = [
  'new', 'studying', 'quoted', 'negotiating', 'approved', 'rejected', 'converted_to_order',
]

const LABELS: Record<QuoteRequestStatus, string> = {
  new:                'Nouveau',
  studying:           'En étude',
  quoted:             'Devisé',
  negotiating:        'En négociation',
  approved:           'Approuvé',
  rejected:           'Refusé',
  converted_to_order: 'Converti en commande',
}

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
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<QuoteRequestStatus>(currentStatus)
  const [notes, setNotes] = useState(currentNotes ?? '')
  const [notesPublic, setNotesPublic] = useState(currentNotesPublic)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateQuoteRequestStatus(requestId, selected, notes, notesPublic)
      setMsg({ ok: result.success, text: result.error ?? 'Mis à jour.' })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as QuoteRequestStatus)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes admin</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Devis, conditions, commentaires internes…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none resize-none"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={notesPublic}
          onChange={(e) => setNotesPublic(e.target.checked)}
          className="rounded"
        />
        <span className="text-xs text-gray-600">Rendre les notes visibles au grossiste</span>
      </label>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}
