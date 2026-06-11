'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { updateLogisticsSettings } from '@/app/actions/logistics'
import type { ActionState } from '@/types/orders'
import type { LogisticsSettings } from '@/types/database'

const initialState: ActionState = { error: null, success: false }

interface Props {
  settings: LogisticsSettings
}

const INPUT =
  'w-full rounded-lg border border-line bg-surface py-2 pl-3 pr-14 text-sm text-foreground shadow-sm focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400'

export function LogisticsForm({ settings }: Props) {
  const t  = useTranslations('admin.logisticsForm')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(updateLogisticsSettings, initialState)

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-fg">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg border border-success bg-success-soft px-4 py-3 text-sm text-success-fg">
          {t('success')}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Casablanca delivery fee */}
        <div className="space-y-1.5">
          <label htmlFor="casablanca_delivery_fee_mad" className="block text-sm font-medium text-muted">
            {t('feeCasablanca')}
          </label>
          <div className="relative">
            <input
              id="casablanca_delivery_fee_mad"
              name="casablanca_delivery_fee_mad"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.casablanca_delivery_fee_mad}
              className={INPUT}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-faint">
              MAD
            </span>
          </div>
          <p className="text-xs text-muted">
            {t('helpCasablanca')}
          </p>
        </div>

        {/* Default delivery fee */}
        <div className="space-y-1.5">
          <label htmlFor="default_delivery_fee_mad" className="block text-sm font-medium text-muted">
            {t('feeOther')}
          </label>
          <div className="relative">
            <input
              id="default_delivery_fee_mad"
              name="default_delivery_fee_mad"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.default_delivery_fee_mad}
              className={INPUT}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-faint">
              MAD
            </span>
          </div>
          <p className="text-xs text-muted">
            {t('helpOther')}
          </p>
        </div>

        {/* Return fee */}
        <div className="space-y-1.5">
          <label htmlFor="return_fee_mad" className="block text-sm font-medium text-muted">
            {t('feeReturn')}
          </label>
          <div className="relative">
            <input
              id="return_fee_mad"
              name="return_fee_mad"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={settings.return_fee_mad}
              className={INPUT}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-faint">
              MAD
            </span>
          </div>
          <p className="text-xs text-muted">
            {t('helpReturn')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? tc('saving') : tc('save')}
        </button>
      </div>
    </form>
  )
}
