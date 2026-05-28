'use client'

import { useTransition } from 'react'
import { updateCommissionStatus } from '@/app/actions/commissions'
import type { Commission, CommissionStatus } from '@/types/database'

const STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  paid: 'Payée',
}

interface CommissionStatusFormProps {
  commission: Commission
}

export function CommissionStatusForm({ commission }: CommissionStatusFormProps) {
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (status: CommissionStatus) => {
    startTransition(async () => {
      await updateCommissionStatus(commission.id, status)
    })
  }

  if (commission.status === 'paid') {
    return (
      <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
        Commission payée
        {commission.paid_at &&
          ` le ${new Date(commission.paid_at).toLocaleDateString('fr-MA')}`}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Statut actuel&nbsp;: <strong>{STATUS_LABELS[commission.status]}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        {commission.status === 'pending' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpdate('approved')}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Approuver commission
          </button>
        )}
        {(commission.status === 'pending' || commission.status === 'approved') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleUpdate('paid')}
            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Marquer payée
          </button>
        )}
      </div>
    </div>
  )
}
