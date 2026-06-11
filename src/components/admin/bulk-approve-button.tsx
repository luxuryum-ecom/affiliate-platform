'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { bulkApproveCommissions } from '@/app/actions/commissions'

interface BulkApproveButtonProps {
  /** IDs of all pending commissions currently visible in the list. */
  pendingIds: string[]
}

export function BulkApproveButton({ pendingIds }: BulkApproveButtonProps) {
  const t = useTranslations('admin.bulkApprove')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ updated: number; error: string | null } | null>(null)

  if (pendingIds.length === 0) return null

  const handleClick = () => {
    setResult(null)
    startTransition(async () => {
      const res = await bulkApproveCommissions(pendingIds)
      setResult(res)
    })
  }

  if (result && !result.error) {
    return (
      <div className="flex items-center gap-2 text-sm text-success-fg bg-success-soft border border-success rounded-lg px-4 py-2">
        <span>✓</span>
        <span>{t('success', { count: result.updated })}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {result?.error && (
        <p className="text-xs text-danger-fg">{result.error}</p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            {t('approving')}
          </>
        ) : (
          <>
            ✓ {t('pendingCount', { count: pendingIds.length })}
          </>
        )}
      </button>
    </div>
  )
}
