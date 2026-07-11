'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { confirmReturnDepot, confirmReturnCompany, markReturnLost } from '@/app/actions/courier-tours'

/**
 * Actions de confirmation d'un retour EN ATTENTE (state='declared') — chaîne
 * de garde à DOUBLE CONFIRMATION (cf. CLAUDE.md / migration 128 §🔒). Données
 * sérialisables uniquement — les actions serveur sont importées directement,
 * jamais transmises en prop (RÈGLE ABSOLUE CLAUDE.md #2).
 */

interface CourierReturnActionsProps {
  orderId: string
}

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-surface-2'

type Mode = 'idle' | 'company' | 'lost'

export function CourierReturnActions({ orderId }: CourierReturnActionsProps) {
  const t = useTranslations('admin.couriers')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<Mode>('idle')
  const [companyRef, setCompanyRef] = useState('')
  const [amountMad, setAmountMad] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setMode('idle')
    setCompanyRef('')
    setAmountMad('')
    setError(null)
  }

  function handleConfirmDepot() {
    setError(null)
    startTransition(async () => {
      const res = await confirmReturnDepot(orderId)
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function handleConfirmCompany(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedRef = companyRef.trim()
    if (!trimmedRef) {
      setError(t('companyRefRequired'))
      return
    }
    startTransition(async () => {
      const res = await confirmReturnCompany({ orderId, companyRef: trimmedRef })
      if (res.error) {
        setError(res.error)
        return
      }
      reset()
      router.refresh()
    })
  }

  function handleMarkLost(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = Number(amountMad.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('lostAmountInvalid'))
      return
    }
    startTransition(async () => {
      const res = await markReturnLost({ orderId, amountMad: amount, quantity: 1 })
      if (res.error) {
        setError(res.error)
        return
      }
      reset()
      router.refresh()
    })
  }

  if (mode === 'company') {
    return (
      <form onSubmit={handleConfirmCompany} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={companyRef}
          disabled={isPending}
          onChange={(e) => setCompanyRef(e.target.value)}
          placeholder={t('companyRefPlaceholder')}
          className={`${INPUT} max-w-[220px]`}
        />
        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('confirmCompanySubmitting') : t('confirmCompanySubmit')}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:text-foreground transition-colors"
        >
          {t('returnActionCancel')}
        </button>
        {error && <p className="w-full text-xs text-danger-fg">{error}</p>}
      </form>
    )
  }

  if (mode === 'lost') {
    return (
      <form onSubmit={handleMarkLost} className="flex flex-col gap-2 items-start">
        <p className="text-xs font-medium text-danger-fg bg-danger-soft border border-danger px-3 py-1.5 rounded-lg">
          {t('lostConfirmMessage')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={amountMad}
            disabled={isPending}
            onChange={(e) => setAmountMad(e.target.value)}
            placeholder={t('lostAmountLabel')}
            className={`${INPUT} max-w-[160px] tabular-nums`}
          />
          <button
            type="submit"
            disabled={isPending}
            className="text-xs px-3 py-1.5 rounded-lg bg-danger text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? t('lostSubmitting') : t('lostSubmit')}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={isPending}
            className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:text-foreground transition-colors"
          >
            {t('returnActionCancel')}
          </button>
        </div>
        {error && <p className="text-xs text-danger-fg">{error}</p>}
      </form>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConfirmDepot}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-success-soft text-success-fg border border-success hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('confirmDepotConfirming') : t('confirmDepotAction')}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setMode('company')
          }}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg border border-line bg-surface text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          {t('confirmCompanyAction')}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setMode('lost')
          }}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded-lg bg-danger-soft text-danger-fg border border-danger hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t('markLostAction')}
        </button>
      </div>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  )
}
