'use client'

import { useTransition } from 'react'
import { updateOrderStatus } from '@/app/actions/orders'
import type { OrderStatus } from '@/types/database'

interface QuickStatusButtonProps {
  orderId: string
  newStatus: OrderStatus
  label: string
  variant?: 'confirm' | 'ship' | 'deliver' | 'cancel'
}

const VARIANTS = {
  confirm: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100',
  ship:    'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
  deliver: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100',
  cancel:  'text-red-600 bg-red-50 border-red-200 hover:bg-red-100',
}

export function QuickStatusButton({
  orderId,
  newStatus,
  label,
  variant = 'confirm',
}: QuickStatusButtonProps) {
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      await updateOrderStatus(orderId, newStatus)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`text-xs px-2 py-1 rounded border font-medium transition-colors disabled:opacity-50 shrink-0 ${VARIANTS[variant]}`}
    >
      {isPending ? '…' : label}
    </button>
  )
}
