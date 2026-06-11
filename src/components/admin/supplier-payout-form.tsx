'use client'

import { useActionState } from 'react'
import { updateSupplierPayoutStatus } from '@/app/actions/supplier-payout'
import { formatMAD } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { SupplierPayoutStatus } from '@/types/database'

export const PAYOUT_STATUS_CLS: Record<SupplierPayoutStatus, string> = {
  not_due:        'bg-surface-2 text-muted',
  pending:        'bg-warning-soft text-warning-fg',
  partially_paid: 'bg-surface-2 text-foreground',
  paid:           'bg-success-soft text-success-fg',
}

interface Props {
  quoteRequestId: string
  currentStatus: SupplierPayoutStatus
  payoutAmountMad: number | null
}

const initial = { error: null, success: false }

export function SupplierPayoutForm({ quoteRequestId, currentStatus, payoutAmountMad }: Props) {
  const t = useTranslations('admin.supplierPayoutForm')
  const [state, action, isPending] = useActionState(updateSupplierPayoutStatus, initial)
  const badgeCls = PAYOUT_STATUS_CLS[currentStatus]

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border border-line ${badgeCls}`}>
          {t(`status.${currentStatus}` as Parameters<typeof t>[0])}
        </span>
      </div>

      {/* ARGENT: montant affiché inchangé */}
      {payoutAmountMad != null && (
        <div className="bg-surface-2 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">{t('amountLabel')}</span>
            <span className={`font-bold tabular-nums text-sm ${payoutAmountMad >= 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
              {formatMAD(payoutAmountMad)}
            </span>
          </div>
        </div>
      )}

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={quoteRequestId} />

        <div>
          <label className="block text-xs text-muted mb-1">{t('statusLabel')}</label>
          <select
            name="supplier_payout_status"
            defaultValue={currentStatus}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="not_due">{t('optionNotDue')}</option>
            <option value="pending">{t('optionPending')}</option>
            <option value="partially_paid">{t('optionPartial')}</option>
            <option value="paid">{t('optionPaid')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('notesLabel')}</label>
          <input
            type="text"
            name="notes"
            placeholder={t('notesPlaceholder')}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>

        {state.error && (
          <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
            {t('success')}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  )
}
