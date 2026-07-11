'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { generateCourierStatement } from '@/app/actions/statements'

/**
 * Générateur de relevé livreur signable (module Livreurs, Lot F). Données
 * sérialisables uniquement — `generateCourierStatement` est importée
 * directement (server action 'use server'), pas transmise en prop (RÈGLE
 * ABSOLUE CLAUDE.md #2). Le calcul (RPC `generate_courier_statement`) vit
 * entièrement côté serveur — ce composant ne fait qu'appeler l'action et
 * afficher son résultat.
 */

interface CourierStatementGeneratorProps {
  courierId: string
}

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CourierStatementGenerator({ courierId }: CourierStatementGeneratorProps) {
  const t = useTranslations('admin.courierStatements')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [statementId, setStatementId] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatementId(null)

    startTransition(async () => {
      const res = await generateCourierStatement(courierId, periodStart, periodEnd)
      if (res.error || !res.statementId) {
        setError(res.error ?? t('generatorError', { message: '' }))
        return
      }
      setStatementId(res.statementId)
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">{t('sectionTitle')}</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="statement-period-start">
            {t('generatorStartLabel')}
          </label>
          <input
            id="statement-period-start"
            type="date"
            required
            value={periodStart}
            disabled={isPending}
            onChange={(e) => setPeriodStart(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="statement-period-end">
            {t('generatorEndLabel')}
          </label>
          <input
            id="statement-period-end"
            type="date"
            required
            value={periodEnd}
            disabled={isPending}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className={INPUT}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !periodStart || !periodEnd}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {isPending ? t('generatorSubmitting') : t('generatorSubmit')}
        </button>
      </form>

      {error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      {statementId && (
        <p className="text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('generatorSuccess')}{' '}
          <a
            href={`/api/statements/courier/${statementId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline font-medium"
          >
            {t('downloadLink')}
          </a>
        </p>
      )}
    </div>
  )
}
