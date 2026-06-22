'use client'

import { useTransition, useState, useEffect } from 'react'
import { setAgentCountry } from '@/app/actions/agent-countries'

const COUNTRY_CODES = ['CN', 'TR', 'EG', 'AE'] as const
type CountryCode = (typeof COUNTRY_CODES)[number]

export type CountryLabels = {
  cn: string
  tr: string
  eg: string
  ae: string
}

const LABEL_MAP: Record<CountryCode, keyof CountryLabels> = {
  CN: 'cn',
  TR: 'tr',
  EG: 'eg',
  AE: 'ae',
}

export function CountryCheckboxes({
  agentId,
  linkedCodes,
  countryLabels,
  pendingLabel,
  errorFallback,
}: {
  agentId: string
  linkedCodes: string[]
  countryLabels: CountryLabels
  pendingLabel: string
  errorFallback: string
}) {
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Optimistic local state — source of truth for display.
  // Initialised from server prop; resynced when the prop changes (after revalidate).
  const [optimisticCodes, setOptimisticCodes] = useState<Set<string>>(
    () => new Set(linkedCodes),
  )
  // Track which specific code is in-flight (for per-checkbox pending indicator).
  const [pendingCode, setPendingCode] = useState<string | null>(null)

  useEffect(() => {
    setOptimisticCodes(new Set(linkedCodes))
  }, [linkedCodes])

  function handleChange(code: CountryCode, checked: boolean) {
    setError(null)
    // Optimistic update — immediate visual feedback.
    setOptimisticCodes((prev) => {
      const next = new Set(prev)
      if (checked) next.add(code)
      else next.delete(code)
      return next
    })
    setPendingCode(code)

    startTransition(async () => {
      // Rollback partagé (refus serveur OU erreur réseau) : annule l'optimistic update.
      const rollback = () =>
        setOptimisticCodes((prev) => {
          const next = new Set(prev)
          if (checked) next.delete(code) // undo the add
          else next.add(code)            // undo the delete
          return next
        })
      try {
        const result = await setAgentCountry({ agentId, countryCode: code, linked: checked })
        if (result.error) {
          rollback()
          setError(result.error || errorFallback)
        }
      } catch {
        // Erreur réseau (fetch avorté, perte de connexion mobile) : rollback + message,
        // jamais de promesse rejetée non capturée (sinon crash Error Boundary).
        rollback()
        setError(errorFallback)
      } finally {
        setPendingCode(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-3">
        {COUNTRY_CODES.map((code) => {
          const isLinked = optimisticCodes.has(code)
          const isThisPending = pendingCode === code
          const labelKey = LABEL_MAP[code]
          return (
            <label
              key={code}
              className={`inline-flex items-center gap-1.5 text-xs font-medium select-none cursor-pointer ${
                isThisPending ? 'opacity-60' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isLinked}
                onChange={(e) => handleChange(code, e.target.checked)}
                className="h-4 w-4 rounded border-line accent-gold-500"
              />
              <span className="text-foreground">{countryLabels[labelKey]}</span>
            </label>
          )
        })}
      </div>

      {pendingCode !== null && (
        <p className="text-xs text-faint">{pendingLabel}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  )
}
