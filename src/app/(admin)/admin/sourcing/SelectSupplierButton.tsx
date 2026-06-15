'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('admin.selectSupplier')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await selectSupplierForSourcing(requestId, supplierId)
    })
  }

  if (isSelected) {
    return (
      <span className="inline-block text-xs px-3 py-1.5 bg-success-subtle text-success border border-success-line rounded-lg font-medium">
        {t('selected')}
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
    >
      {isPending ? t('pending') : t('select')}
    </button>
  )
}
