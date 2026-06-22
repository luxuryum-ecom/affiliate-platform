'use client'

import { useActionState } from 'react'
import { setManageCountrySourcingPermission } from '@/app/actions/agent-countries'
import type { ActionState } from '@/types/orders'

const INITIAL: ActionState = { error: null, success: false }

const BTN_ON =
  'inline-flex items-center gap-2 rounded-lg border border-gold-400 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-500 hover:bg-gold-400/20 disabled:opacity-50 transition-colors'
const BTN_OFF =
  'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 disabled:opacity-50 transition-colors'

export type CapabilityToggleLabels = {
  grantLabel: string
  revokeLabel: string
  pendingLabel: string
  successGrant: string
  successRevoke: string
  errorFallback: string
  statusActive: string
  statusInactive: string
}

function Feedback({
  state,
  labels,
}: {
  state: ActionState
  labels: Pick<CapabilityToggleLabels, 'errorFallback'>
}) {
  if (state.success) return null
  if (state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-medium text-danger-fg">
        {state.error || labels.errorFallback}
      </p>
    )
  }
  return null
}

export function CapabilityToggle({
  userId,
  currentlyEnabled,
  labels,
}: {
  userId: string
  currentlyEnabled: boolean
  labels: CapabilityToggleLabels
}) {
  const [state, action, isPending] = useActionState(
    setManageCountrySourcingPermission,
    INITIAL,
  )

  const nextEnabled = !currentlyEnabled

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
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
