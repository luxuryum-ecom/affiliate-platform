'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateWholesalePaymentStatus } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { WholesalePaymentStatus } from '@/types/database'

// CSS only — labels via t()
const PAYMENT_STATUS_CLS: Record<WholesalePaymentStatus, string> = {
  no_deposit:        'bg-surface-2 text-faint border-line',
  deposit_requested: 'bg-warning-soft text-warning-fg border-warning',
  deposit_received:  'bg-surface-2 text-muted border-line',
  fully_paid:        'bg-success-soft text-success-fg border-success',
}

interface Props {
  orderId: string
  totalAmount: number
  currentStatus: WholesalePaymentStatus
  depositAmount: number | null
  depositReceived: number
}

const initial = { error: null, success: false }

export function WholesalePaymentForm({
  orderId,
  totalAmount,
  currentStatus,
  depositAmount,
  depositReceived,
}: Props) {
  const t  = useTranslations('admin.wholesalePaymentForm')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(updateWholesalePaymentStatus, initial)

  const remainingBalance = totalAmount - depositReceived

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('heading')}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PAYMENT_STATUS_CLS[currentStatus]}`}>
          {tc(`paymentStatus.${currentStatus}`)}
        </span>
      </div>

      {/* Balance summary */}
      <div className="bg-surface-2 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted">{t('totalOrder')}</span>
          <span className="font-semibold tabular-nums text-foreground">{formatMAD(totalAmount)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted">{t('depositRequested')}</span>
          <span className="font-medium tabular-nums text-foreground">
            {depositAmount != null ? formatMAD(depositAmount) : '—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted">{t('depositReceived')}</span>
          <span className="font-medium tabular-nums text-accent-fg">{formatMAD(depositReceived)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-line pt-2">
          <span className="text-xs font-semibold text-foreground">{t('remainingBalance')}</span>
          <span className={`font-bold tabular-nums text-sm ${remainingBalance > 0 ? 'text-danger' : 'text-success'}`}>
            {formatMAD(remainingBalance)}
          </span>
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div>
          <label className="block text-xs text-muted mb-1">{t('paymentStatusLabel')}</label>
          <select
            name="payment_status"
            defaultValue={currentStatus}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="no_deposit">{tc('paymentStatus.no_deposit')}</option>
            <option value="deposit_requested">{tc('paymentStatus.deposit_requested')}</option>
            <option value="deposit_received">{tc('paymentStatus.deposit_received')}</option>
            <option value="fully_paid">{tc('paymentStatus.fully_paid')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('depositAmountLabel')}</label>
          <div className="relative">
            <input
              type="number"
              name="deposit_amount"
              defaultValue={depositAmount ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('depositReceivedLabel')}</label>
          <div className="relative">
            <input
              type="number"
              name="deposit_received_amount"
              defaultValue={depositReceived}
              min={0}
              step={0.01}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">MAD</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('note')}</label>
          <input
            type="text"
            name="notes"
            placeholder={t('notePlaceholder')}
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
            {t('updated')}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? tc('saving') : t('submit')}
        </button>
      </form>
    </div>
  )
}
