'use client'

import { useActionState } from 'react'
import { updateSupplierFinancials } from '@/app/actions/supplier-payout'
import { formatMAD } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { SupplierCommissionType } from '@/types/database'

interface Props {
  quoteRequestId: string
  quantityRequested: number
  quotedUnitPriceMad: number | null
  supplierCostMad: number | null
  commissionType: SupplierCommissionType
  commissionValue: number | null
  commissionAmountMad: number | null
  transportCostMad: number
  payoutAmountMad: number | null
}

const initial = { error: null, success: false }

export function SupplierFinancialsForm({
  quoteRequestId,
  quantityRequested,
  quotedUnitPriceMad,
  supplierCostMad,
  commissionType,
  commissionValue,
  commissionAmountMad,
  transportCostMad,
  payoutAmountMad,
}: Props) {
  const t = useTranslations('admin.supplierFinancialsForm')
  const [state, action, isPending] = useActionState(updateSupplierFinancials, initial)

  // ARGENT: totalClientAmount calcul inchangé
  const totalClientAmount = (quotedUnitPriceMad ?? 0) * quantityRequested

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>

      {/* Read-only summary — ARGENT: valeurs inchangées */}
      <div className="bg-surface-2 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted">{t('unitPriceRow')}</span>
          <span className="font-medium tabular-nums text-foreground">
            {quotedUnitPriceMad != null ? formatMAD(quotedUnitPriceMad) : '—'} × {quantityRequested}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-line pt-2">
          <span className="text-xs font-semibold text-foreground">{t('totalClientRow')}</span>
          <span className="font-bold tabular-nums text-foreground">{formatMAD(totalClientAmount)}</span>
        </div>
        {commissionAmountMad != null && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">{t('commissionRow')}</span>
            <span className="font-medium tabular-nums text-danger-fg">− {formatMAD(commissionAmountMad)}</span>
          </div>
        )}
        {transportCostMad > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">{t('transportRow')}</span>
            <span className="font-medium tabular-nums text-danger-fg">− {formatMAD(transportCostMad)}</span>
          </div>
        )}
        {payoutAmountMad != null && (
          <div className="flex justify-between items-center border-t border-line pt-2">
            <span className="text-xs font-semibold text-foreground">{t('payoutRow')}</span>
            <span className={`font-bold tabular-nums text-sm ${payoutAmountMad >= 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
              {formatMAD(payoutAmountMad)}
            </span>
          </div>
        )}
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={quoteRequestId} />

        <div>
          <label className="block text-xs text-muted mb-1">{t('supplierCostLabel')}</label>
          <div className="relative">
            <input
              type="number"
              name="supplier_cost_mad"
              defaultValue={supplierCostMad ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{t('madSuffix')}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('commissionTypeLabel')}</label>
          <select
            name="platform_commission_type"
            defaultValue={commissionType}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="percent">{t('commissionTypePercent')}</option>
            <option value="fixed">{t('commissionTypeFixed')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('commissionValueLabel')}</label>
          <div className="relative">
            <input
              type="number"
              name="platform_commission_value"
              defaultValue={commissionValue ?? ''}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-16 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{t('commissionValueSuffix')}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">{t('transportLabel')}</label>
          <div className="relative">
            <input
              type="number"
              name="transport_customs_cost_mad"
              defaultValue={transportCostMad}
              min={0}
              step={0.01}
              placeholder="0"
              className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{t('madSuffix')}</span>
          </div>
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
