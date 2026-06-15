'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateOrderStatus } from '@/app/actions/orders'
import type { OrderStatus } from '@/types/database'

interface QuickStatusButtonProps {
  orderId: string
  newStatus: OrderStatus
  label: string
  variant?: 'confirm' | 'ship' | 'deliver' | 'cancel'
}

const VARIANTS = {
  confirm: 'text-muted bg-surface-2 border-line hover:bg-surface',
  ship:    'text-muted bg-surface-2 border-line hover:bg-surface',
  deliver: 'text-success-fg bg-success-soft border-success hover:opacity-80',
  cancel:  'text-danger-fg bg-danger-soft border-danger hover:opacity-80',
}

export function QuickStatusButton({
  orderId,
  newStatus,
  label,
  variant = 'confirm',
}: QuickStatusButtonProps) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, newStatus)
      if (!result.success) {
        setError(result.error ?? t('common.errorUnknown'))
      } else {
        router.refresh()
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`text-xs px-2 py-1 rounded border font-medium transition-colors disabled:opacity-50 shrink-0 ${VARIANTS[variant]}`}
      >
        {isPending ? '…' : label}
      </button>
      {error && (
        <span className="text-[10px] text-danger-fg leading-tight max-w-[160px]">{error}</span>
      )}
    </span>
  )
}
