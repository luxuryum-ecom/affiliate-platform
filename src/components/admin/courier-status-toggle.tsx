'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setCourierStatus } from '@/app/actions/couriers'

/**
 * Bascule bloquer/débloquer un livreur. Données sérialisables uniquement —
 * `setCourierStatus` importée directement (server action), pas transmise en
 * prop (RÈGLE ABSOLUE CLAUDE.md #2).
 */

interface CourierStatusToggleProps {
  courierId: string
  status: string
}

export function CourierStatusToggle({ courierId, status }: CourierStatusToggleProps) {
  const t = useTranslations('admin.couriers')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isActive = status === 'active'
  const nextStatus = isActive ? 'blocked' : 'active'

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const res = await setCourierStatus({ courierId, status: nextStatus })
      if (res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isActive
            ? 'border-danger text-danger-fg bg-danger-soft hover:opacity-90'
            : 'border-success text-success-fg bg-success-soft hover:opacity-90'
        }`}
      >
        {isPending ? t('toggleUpdating') : isActive ? t('blockAction') : t('unblockAction')}
      </button>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  )
}
