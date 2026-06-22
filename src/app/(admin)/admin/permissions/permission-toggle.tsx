'use client'

import { useActionState } from 'react'
import { setValidateCategoriesPermission } from '@/app/actions/staff-permissions'
import type { ActionState } from '@/types/orders'

const INITIAL: ActionState = { error: null, success: false }

// ─── Styles (miroir suggestion-actions.tsx) ──────────────────────────────────

const BTN_ON =
  'inline-flex items-center gap-2 rounded-lg border border-gold-400 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-500 hover:bg-gold-400/20 disabled:opacity-50 transition-colors'
const BTN_OFF =
  'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-50 transition-colors'

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

// ─── Feedback inline ──────────────────────────────────────────────────────────

function Feedback({
  state,
  labels,
}: {
  state: ActionState
  labels: Pick<ToggleLabels, 'errorFallback'>
}) {
  if (state.success) return null // La page se revalide → l'état courant s'affiche
  if (state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-medium text-danger-fg">
        {state.error || labels.errorFallback}
      </p>
    )
  }
  return null
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
  const [state, action, isPending] = useActionState(
    setValidateCategoriesPermission,
    INITIAL,
  )

  // Après succès, la page se revalide (revalidatePath dans l'action) et
  // le composant remonte avec le nouvel état — pas besoin de gérer localement.
  const nextEnabled = !currentlyEnabled

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {/* Indicateur d'état courant */}
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            currentlyEnabled ? 'text-success-fg' : 'text-faint'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              currentlyEnabled ? 'bg-success-fg' : 'bg-line'
            }`}
          />
          {currentlyEnabled ? labels.statusActive : labels.statusInactive}
        </span>

        {/* Bouton de bascule */}
        <form action={action}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="enabled" value={String(nextEnabled)} />
          <button
            type="submit"
            disabled={isPending}
            className={currentlyEnabled ? BTN_ON : BTN_OFF}
          >
            {isPending
              ? labels.pendingLabel
              : currentlyEnabled
                ? labels.revokeLabel
                : labels.grantLabel}
          </button>
        </form>
      </div>

      <Feedback state={state} labels={labels} />
    </div>
  )
}
