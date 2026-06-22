'use client'

import { useState, useTransition, useEffect } from 'react'
import { setValidateCategoriesPermission } from '@/app/actions/staff-permissions'
import type { ActionState } from '@/types/orders'

const INITIAL: ActionState = { error: null, success: false }

// ─── Styles (miroir suggestion-actions.tsx) ──────────────────────────────────

const BTN_ON =
  'inline-flex items-center gap-2 rounded-lg border border-gold-400 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-500 hover:bg-gold-400/20 transition-colors'
const BTN_OFF =
  'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 transition-colors'

// ─── Types des labels passés depuis le Server Component ──────────────────────

export type ToggleLabels = {
  grantLabel: string
  revokeLabel: string
  pendingLabel: string
  successGrant: string
  successRevoke: string
  errorFallback: string
  statusActive: string
  statusInactive: string
}

// ─── Toggle par salarié ───────────────────────────────────────────────────────

export function PermissionToggle({
  userId,
  currentlyEnabled,
  labels,
}: {
  userId: string
  currentlyEnabled: boolean
  labels: ToggleLabels
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Optimistic local state — flips immediately on click.
  // Resynced from prop after revalidatePath completes (RSC re-renders parent).
  const [optimisticEnabled, setOptimisticEnabled] = useState(currentlyEnabled)

  useEffect(() => {
    setOptimisticEnabled(currentlyEnabled)
  }, [currentlyEnabled])

  function handleClick() {
    setError(null)
    const nextEnabled = !optimisticEnabled
    // Optimistic flip — immediate visual feedback.
    setOptimisticEnabled(nextEnabled)

    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('user_id', userId)
        formData.set('enabled', String(nextEnabled))
        const result = await setValidateCategoriesPermission(INITIAL, formData)
        if (result?.error) {
          // Rollback to previous state.
          setOptimisticEnabled(!nextEnabled)
          setError(result.error || labels.errorFallback)
        }
      } catch {
        // Erreur réseau (fetch avorté, perte de connexion mobile) : rollback + message,
        // jamais de promesse rejetée non capturée (sinon crash Error Boundary).
        setOptimisticEnabled(!nextEnabled)
        setError(labels.errorFallback)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {/* Indicateur d'état optimiste */}
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            optimisticEnabled ? 'text-success-fg' : 'text-faint'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              optimisticEnabled ? 'bg-success-fg' : 'bg-line'
            }`}
          />
          {optimisticEnabled ? labels.statusActive : labels.statusInactive}
        </span>

        {/* Bouton de bascule */}
        <button
          type="button"
          onClick={handleClick}
          className={`${optimisticEnabled ? BTN_ON : BTN_OFF} ${isPending ? 'opacity-60' : ''}`}
        >
          {isPending
            ? labels.pendingLabel
            : optimisticEnabled
              ? labels.revokeLabel
              : labels.grantLabel}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  )
}
