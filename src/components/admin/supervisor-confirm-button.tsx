'use client'

/**
 * Bouton de confirmation superviseur (STATUT UNIQUEMENT).
 *
 * Appelle confirmOrderAsSupervisor ou confirmWholesaleAsSupervisor selon le canal.
 * Aucun accès à delivered / cod_received / argent / commission.
 * Pattern optimiste + rollback + try/catch.
 */

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { confirmOrderAsSupervisor, confirmWholesaleAsSupervisor } from '@/app/actions/supervisor-confirm'

interface SupervisorConfirmButtonProps {
  orderId: string
  channel: 'cod' | 'affiliate' | 'wholesale'
}

export function SupervisorConfirmButton({ orderId, channel }: SupervisorConfirmButtonProps) {
  const t = useTranslations('admin.ordersConfirm')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const router = useRouter()

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const action = channel === 'wholesale'
        ? confirmWholesaleAsSupervisor(orderId)
        : confirmOrderAsSupervisor(orderId)

      const result = await action

      if (!result.success) {
        setError(result.error ?? t('errorGeneric'))
      } else {
        setDone(true)
        router.refresh()
      }
    })
  }

  if (done) {
    return (
      <span className="text-xs text-success-fg font-medium px-2 py-1 bg-success-soft rounded border border-success">
        {t('successConfirm')}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-50 bg-primary text-primary-foreground hover:opacity-90"
      >
        {isPending ? t('confirming') : t('btnConfirm')}
      </button>
      {error && (
        <span className="text-[10px] text-danger-fg leading-tight max-w-[200px]">{error}</span>
      )}
    </span>
  )
}
