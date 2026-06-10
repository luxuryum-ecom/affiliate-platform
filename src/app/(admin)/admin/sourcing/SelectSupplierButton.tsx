'use client'

import { useTransition } from 'react'
import { selectSupplierForSourcing } from '@/app/actions/sourcing'

export default function SelectSupplierButton({
  requestId,
  supplierId,
  isSelected,
}: {
  requestId: string
  supplierId: string
  isSelected: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await selectSupplierForSourcing(requestId, supplierId)
    })
  }

  if (isSelected) {
    return (
      <span className="inline-block text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg font-medium">
        Sélectionné
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? '...' : 'Sélectionner'}
    </button>
  )
}
