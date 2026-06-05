'use client'

import { useTransition } from 'react'
import { runRfqMatchingForSourcing, notifyMatchedSuppliers, updateMatchStatus } from '@/app/actions/rfq-engine'
import type { RfqMatchStatus } from '@/types/database'

export function RunMatchingButton({ sourcingId }: { sourcingId: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await runRfqMatchingForSourcing(sourcingId) })}
      className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? '...' : '⚡ Lancer matching'}
    </button>
  )
}

export function NotifyButton({ matchIds, ineligibleCount = 0 }: { matchIds: string[]; ineligibleCount?: number }) {
  const [isPending, startTransition] = useTransition()
  const handleClick = () => {
    const ineligibleNote = ineligibleCount > 0
      ? `\n⚠ ${ineligibleCount} fournisseur${ineligibleCount > 1 ? 's' : ''} inéligible${ineligibleCount > 1 ? 's' : ''} (aucune catégorie commune) exclu${ineligibleCount > 1 ? 's' : ''} de cette notification.`
      : ''
    const confirmed = window.confirm(
      `Notifier ${matchIds.length} fournisseur${matchIds.length > 1 ? 's' : ''} éligible${matchIds.length > 1 ? 's' : ''} ?${ineligibleNote}\n\n` +
      `Action : changement de statut interne "nouveau → notifié".\n` +
      `Aucun email ni WhatsApp n'est envoyé automatiquement.\n\n` +
      `Les fournisseurs verront l'opportunité sur leur espace /supplier/opportunities.`
    )
    if (!confirmed) return
    startTransition(async () => { await notifyMatchedSuppliers(matchIds) })
  }
  return (
    <button
      disabled={isPending || matchIds.length === 0}
      onClick={handleClick}
      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? '...' : `🔔 Notifier ${matchIds.length} fournisseur${matchIds.length > 1 ? 's' : ''}`}
    </button>
  )
}

export function MatchStatusButton({
  matchId,
  newStatus,
  label,
}: {
  matchId: string
  newStatus: RfqMatchStatus
  label: string
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateMatchStatus(matchId, newStatus) })}
      className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 transition-colors"
    >
      {isPending ? '...' : label}
    </button>
  )
}
