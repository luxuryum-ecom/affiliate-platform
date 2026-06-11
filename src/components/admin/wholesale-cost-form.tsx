'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateWholesaleOrderCosts } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { ActionState } from '@/types/orders'

interface Props {
  orderId: string
  supplierCost: number
  transportCost: number
  additionalCost: number
  totalAmount: number
  /** True when all line items are local_stock (Morocco stock). */
  isLocalStock?: boolean
}

const initial: ActionState = { error: null, success: false }

export function WholesaleCostForm({
  orderId,
  supplierCost,
  transportCost,
  additionalCost,
  totalAmount,
  isLocalStock = false,
}: Props) {
  const t = useTranslations('admin.wholesaleCostForm')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(updateWholesaleOrderCosts, initial)

  const totalCost = supplierCost + transportCost + additionalCost
  const grossProfit = totalAmount - totalCost
  const grossMargin = totalAmount > 0 ? ((grossProfit / totalAmount) * 100).toFixed(1) : '0'
  const sectionTitle = isLocalStock ? t('headingLocal') : t('headingImport')
  const transportLabel = isLocalStock ? t('transportLocal') : t('transportImport')

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{sectionTitle}</h2>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <CostField
          label={t('supplierCost')}
          name="supplier_cost_mad"
          defaultValue={supplierCost}
        />
        <CostField
          label={transportLabel}
          name="transport_customs_cost_mad"
          defaultValue={transportCost}
        />
        <CostField
          label={t('additionalCost')}
          name="additional_cost_mad"
          defaultValue={additionalCost}
        />

        {state.error && (
          <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
            {t('saved')}
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

      {/* Live breakdown (based on saved values) */}
      <div className="border-t border-line pt-4 space-y-2 text-sm">
        <Row label={t('sellPrice')} value={formatMAD(totalAmount)} bold />
        <Row label={t('totalCost')} value={formatMAD(totalCost)} className="text-danger" />
        <div className="border-t border-line pt-2">
          <Row
            label={t('grossProfit')}
            value={formatMAD(grossProfit)}
            bold
            className={grossProfit >= 0 ? 'text-success' : 'text-danger'}
          />
          <Row
            label={t('margin')}
            value={`${grossMargin}%`}
            className={Number(grossMargin) >= 0 ? 'text-success' : 'text-danger'}
          />
        </div>
      </div>
    </div>
  )
}

function CostField({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: number
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={0}
          step={0.01}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">MAD</span>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  className = 'text-foreground',
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${className}`}>
        {value}
      </span>
    </div>
  )
}
