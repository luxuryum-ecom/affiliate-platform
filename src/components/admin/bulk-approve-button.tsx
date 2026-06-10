'use client'

import { useState, useTransition } from 'react'
import { bulkApproveCommissions } from '@/app/actions/commissions'

interface BulkApproveButtonProps {
  /** IDs of all pending commissions currently visible in the list. */
  pendingIds: string[]
}

export function BulkApproveButton({ pendingIds }: BulkApproveButtonProps) {
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
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
        <span>✓</span>
        <span>{result.updated} commission{result.updated !== 1 ? 's' : ''} approuvée{result.updated !== 1 ? 's' : ''}.</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {result?.error && (
        <p className="text-xs text-red-600">{result.error}</p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Approbation…
          </>
        ) : (
          <>
            ✓ Approuver {pendingIds.length} commission{pendingIds.length !== 1 ? 's' : ''} en attente
          </>
        )}
      </button>
    </div>
  )
}
