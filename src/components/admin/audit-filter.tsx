'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { AUDIT_ACTIONS } from '@/lib/audit/actions'

/**
 * Filtre par type d'action du journal d'audit. Navigue vers ?action=… (lecture
 * serveur). Reçoit les libellés résolus (strings) en props — aucune fonction
 * passée par le serveur (règle #2).
 */
export function AuditFilter({
  allLabel,
  filterLabel,
  actionLabels,
}: {
  allLabel: string
  filterLabel: string
  actionLabels: Record<string, string>
}) {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('action') ?? ''
  const [isPending, startTransition] = useTransition()

  function onChange(value: string) {
    const qs = new URLSearchParams()
    if (value) qs.set('action', value)
    startTransition(() => router.push(`/admin/audit${qs.toString() ? `?${qs}` : ''}`))
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-faint">{filterLabel}</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
      >
        <option value="">{allLabel}</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {actionLabels[a] ?? a}
          </option>
        ))}
      </select>
    </label>
  )
}
