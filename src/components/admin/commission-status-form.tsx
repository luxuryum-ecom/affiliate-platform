'use client'

import { useTransition } from 'react'
import { updateCommissionStatus } from '@/app/actions/commissions'
import { useTranslations } from 'next-intl'
import type { Commission, CommissionStatus } from '@/types/database'

interface CommissionStatusFormProps {
  commission: Commission
}

export function CommissionStatusForm({ commission }: CommissionStatusFormProps) {
  const t = useTranslations('admin.commissionStatusForm')
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (status: CommissionStatus) => {
    startTransition(async () => {
      await updateCommissionStatus(commission.id, status)
    })
  }

  function statusLabel(s: CommissionStatus) {
    if (s === 'pending')  return t('statusPending')
    if (s === 'approved') return t('statusApproved')
    return t('statusPaid')
  }

  if (commission.status === 'paid') {
    return (
      <p className="text-xs text-success-fg bg-success-soft border border-success px-3 py-2 rounded-lg">
        {t('paid', {
          date: commission.paid_at
            ? t('paidDate', {
                date: new Date(commission.paid_at).toLocaleDateString(undefined, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }),
              })
            : '',
        })}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {t('currentStatus', { status: statusLabel(commission.status) })}
      </p>
      <div className="flex flex-wrap gap-2">
        {commission.status === 'pending' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpdate('approved')}
            className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            {t('approve')}
          </button>
        )}
        {(commission.status === 'pending' || commission.status === 'approved') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpdate('paid')}
            className="text-xs px-3 py-1.5 bg-success-soft text-success-fg border border-success rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            {t('markPaid')}
          </button>
        )}
      </div>
    </div>
  )
}
