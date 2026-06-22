'use client'

import { useTransition, useState } from 'react'
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
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleChange(code: CountryCode, checked: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setAgentCountry({ agentId, countryCode: code, linked: checked })
      if (result.error) setError(result.error || errorFallback)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-3">
        {COUNTRY_CODES.map((code) => {
          const isLinked = linkedCodes.includes(code)
          const labelKey = LABEL_MAP[code]
          return (
            <label
              key={code}
              className={`inline-flex items-center gap-1.5 text-xs font-medium select-none ${
                isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={isLinked}
                disabled={isPending}
                onChange={(e) => handleChange(code, e.target.checked)}
                className="h-4 w-4 rounded border-line accent-gold-500"
              />
              <span className="text-foreground">{countryLabels[labelKey]}</span>
            </label>
          )
        })}
      </div>

      {isPending && (
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
