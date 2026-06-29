'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { promoteToAgent } from '@/app/actions/users'

/**
 * Contrôle admin de promotion d'un compte en agent (personnel interne / dépôt).
 * Affiché sur /admin/users/[id]. Reçoit uniquement des strings/booléens sérialisables
 * (règle #2). La promotion est une action conséquente → confirmation avant envoi.
 */
export function AgentPromoteControl({
  profileId,
  isAgent,
  labels,
}: {
  profileId: string
  isAgent: boolean
  labels: {
    button: string
    pending: string
    already: string
    confirm: string
  }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (isAgent) {
    return (
      <span className="text-xs px-3 py-1 rounded-full font-medium bg-success-soft text-success-fg border border-success">
        {labels.already}
      </span>
    )
  }

  function handlePromote() {
    if (!window.confirm(labels.confirm)) return
    const fd = new FormData()
    fd.set('profileId', profileId)
    startTransition(async () => {
      await promoteToAgent(fd)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handlePromote}
      disabled={isPending}
      className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? labels.pending : labels.button}
    </button>
  )
}
