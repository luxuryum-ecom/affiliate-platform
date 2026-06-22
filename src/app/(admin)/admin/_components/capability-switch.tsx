'use client'

/**
 * CapabilitySwitch — toggle factorisé, data-driven, optimiste.
 *
 * Remplace permission-toggle.tsx ET capability-toggle.tsx (quasi-clones).
 * Le composant importe lui-même les server actions — aucune fonction n'est
 * passée en prop (règle CLAUDE.md absolue : jamais de callback en prop CC).
 *
 * kind='capability' → appelle setStaffPermission({ userId, capability, enabled })
 * kind='volet'      → appelle setVoletSupervisor({ userId, volet, enabled })
 *
 * Pattern optimiste : flip immédiat → revalidatePath → useEffect resynce depuis prop.
 * Rollback sur erreur réseau OU erreur retournée par l'action.
 */

import { useState, useTransition, useEffect } from 'react'
import { setStaffPermission, setVoletSupervisor } from '@/app/actions/staff-permissions'

// ─── Styles ──────────────────────────────────────────────────────────────────

const BTN_ON =
  'inline-flex items-center gap-2 rounded-lg border border-gold-400 bg-gold-400/10 px-3 py-1.5 text-xs font-semibold text-gold-500 hover:bg-gold-400/20 transition-colors'
const BTN_OFF =
  'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 transition-colors'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SwitchLabels = {
  grantLabel: string
  revokeLabel: string
  pendingLabel: string
  errorFallback: string
  statusActive: string
  statusInactive: string
}

export type CapabilitySwitchProps = {
  userId: string
  currentlyEnabled: boolean
  labels: SwitchLabels
} & (
  | { kind: 'capability'; capabilityOrVolet: string }
  | { kind: 'volet'; capabilityOrVolet: string }
)

// ─── Composant ───────────────────────────────────────────────────────────────

export function CapabilitySwitch({
  userId,
  currentlyEnabled,
  labels,
  kind,
  capabilityOrVolet,
}: CapabilitySwitchProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // État optimiste local — flip immédiat au clic.
  // Resynced depuis la prop quand revalidatePath déclenche un re-rendu RSC parent.
  const [optimisticEnabled, setOptimisticEnabled] = useState(currentlyEnabled)

  useEffect(() => {
    setOptimisticEnabled(currentlyEnabled)
  }, [currentlyEnabled])

  function handleClick() {
    setError(null)
    const nextEnabled = !optimisticEnabled
    // Flip optimiste — retour visuel immédiat.
    setOptimisticEnabled(nextEnabled)

    startTransition(async () => {
      try {
        let result
        if (kind === 'volet') {
          result = await setVoletSupervisor({
            userId,
            volet: capabilityOrVolet as Parameters<typeof setVoletSupervisor>[0]['volet'],
            enabled: nextEnabled,
          })
        } else {
          result = await setStaffPermission({
            userId,
            capability: capabilityOrVolet,
            enabled: nextEnabled,
          })
        }
        if (result?.error) {
          // Rollback sur refus serveur.
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
          disabled={isPending}
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
