'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createTour } from '@/app/actions/courier-tours'

/**
 * Formulaire de création d'une tournée (Lot D). Données sérialisables
 * uniquement — `createTour` est importée directement (server action
 * 'use server'), pas transmise en prop (RÈGLE ABSOLUE CLAUDE.md #2).
 * Validation client EN PLUS de la validation zod côté serveur (déjà dans
 * l'action).
 */

interface CourierTourCreateFormProps {
  courierId: string
}

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CourierTourCreateForm({ courierId }: CourierTourCreateFormProps) {
  const t = useTranslations('admin.couriers')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const [tourDate, setTourDate] = useState(todayIso())
  const [orderIdsText, setOrderIdsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function resetForm() {
    setTourDate(todayIso())
    setOrderIdsText('')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedDate = tourDate.trim()
    if (!trimmedDate) {
      setError(t('createTourValidationDate'))
      return
    }

    const orderIds = Array.from(
      new Set(
        orderIdsText
          .split(/[\n,;\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && UUID_RE.test(s))
      )
    )
    if (orderIds.length === 0) {
      setError(t('createTourValidationOrders'))
      return
    }

    startTransition(async () => {
      const res = await createTour({ courierId, tourDate: trimmedDate, orderIds })
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess(true)
      resetForm()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setSuccess(false)
        }}
        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {t('createTourButton')}
      </button>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">{t('createTourTitle')}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          {t('formClose')}
        </button>
      </div>

      {success && (
        <p className="mb-4 text-sm text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
          {t('createTourSuccess')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="tour-date">
            {t('createTourDateLabel')}
          </label>
          <input
            id="tour-date"
            type="date"
            value={tourDate}
            disabled={isPending}
            onChange={(e) => setTourDate(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5" htmlFor="tour-order-ids">
            {t('createTourOrderIdsLabel')}
          </label>
          <textarea
            id="tour-order-ids"
            rows={5}
            value={orderIdsText}
            disabled={isPending}
            onChange={(e) => setOrderIdsText(e.target.value)}
            placeholder={t('createTourOrderIdsPlaceholder')}
            className={`${INPUT} font-mono`}
          />
          <p className="text-[11px] text-faint mt-1">{t('createTourOrderIdsHelp')}</p>
        </div>

        {error && (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {isPending ? t('createTourSubmitting') : t('createTourSubmit')}
        </button>
      </form>
    </div>
  )
}
