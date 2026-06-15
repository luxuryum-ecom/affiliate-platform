'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { runRfqMatchingForSourcing, notifyMatchedSuppliers, updateMatchStatus } from '@/app/actions/rfq-engine'
import type { RfqMatchStatus } from '@/types/database'

export function RunMatchingButton({ sourcingId }: { sourcingId: string }) {
  const t = useTranslations('admin.rfqActions')
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await runRfqMatchingForSourcing(sourcingId) })}
      className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
    >
      {isPending ? t('running') : t('runMatching')}
    </button>
  )
}

export function NotifyButton({ matchIds, ineligibleCount = 0 }: { matchIds: string[]; ineligibleCount?: number }) {
  const t = useTranslations('admin.rfqActions')
  const [isPending, startTransition] = useTransition()
  const handleClick = () => {
    const ineligibleNote = ineligibleCount > 0
      ? t('confirmIneligible', { count: ineligibleCount })
      : ''
    const confirmed = window.confirm(
      t('confirmNotify', { count: matchIds.length }) + ineligibleNote + '\n\n' +
      t('confirmAction') + '\n' +
      t('confirmNoEmail') + '\n\n' +
      t('confirmOpportunity')
    )
    if (!confirmed) return
    startTransition(async () => { await notifyMatchedSuppliers(matchIds) })
  }
  return (
    <button
      disabled={isPending || matchIds.length === 0}
      onClick={handleClick}
      className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
    >
      {isPending ? t('notifying') : t('notifyCount', { count: matchIds.length })}
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
  const t = useTranslations('admin.rfqActions')
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateMatchStatus(matchId, newStatus) })}
      className="text-xs px-2.5 py-1 bg-surface-2 hover:bg-line text-foreground rounded-lg disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
    >
      {isPending ? t('actionPending') : label}
    </button>
  )
}
