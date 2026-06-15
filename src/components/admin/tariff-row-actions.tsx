'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  upsertTariff,
  toggleTariffActive,
  deleteTariff,
  type TariffFormState,
} from '@/app/actions/tariffs'
import { SHIPPING_MODE_LABELS, unitFromShippingMode } from '@/lib/tariff-utils'
import type { ImportTariff, TariffCountry, ImportShippingMode } from '@/types/database'

const INPUT =
  'w-full px-3 py-2 border border-line bg-surface text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent'

const COUNTRIES: TariffCountry[] = ['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre']

const SHIPPING_MODES = Object.keys(SHIPPING_MODE_LABELS) as ImportShippingMode[]

// ─── Add form ─────────────────────────────────────────────────────────────────

const initialState: TariffFormState = { error: null }

export function AddTariffForm() {
  const t  = useTranslations('admin.tariffActions')
  const ti = useTranslations('admin.importTariffs')
  const [state, action, isPending] = useActionState(upsertTariff, initialState)
  const [shippingMode, setShippingMode] = useState<ImportShippingMode>('air_door_to_door_kg')

  const unit = unitFromShippingMode(shippingMode)
  const unitLabel = unit === 'cbm' ? 'CBM' : 'kg'

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="bg-danger-soft border border-danger text-danger-fg text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('countryLabel')} <span className="text-danger">*</span>
          </label>
          <select name="country" required disabled={isPending} className={INPUT}>
            <option value="">{t('selectCountry')}</option>
            {COUNTRIES.map((value) => (
              <option key={value} value={value}>{ti(`country.${value}`)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('modeLabel')} <span className="text-danger">*</span>
          </label>
          <select
            name="shipping_mode"
            required
            disabled={isPending}
            value={shippingMode}
            onChange={(e) => setShippingMode(e.target.value as ImportShippingMode)}
            className={INPUT}
          >
            {SHIPPING_MODES.map((value) => (
              <option key={value} value={value}>{ti(`shippingMode.${value}`)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('feeLabel', { unit: unitLabel })}
            <span className="text-danger"> *</span>
          </label>
          <input
            name="transport_customs_price_mad"
            type="number"
            step="0.01"
            min="0"
            required
            disabled={isPending}
            placeholder="0.00"
            className={INPUT}
          />
          <p className="text-xs text-faint mt-1">
            {t('unitAuto', { unit: unitLabel })}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('delayLabel')}
          </label>
          <input
            name="delivery_days"
            type="number"
            step="1"
            min="1"
            disabled={isPending}
            placeholder={t('delayPlaceholder')}
            className={INPUT}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('notesLabel')}</label>
        <textarea
          name="notes"
          rows={2}
          disabled={isPending}
          placeholder={t('notesPlaceholder')}
          className={INPUT + ' resize-none'}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('adding') : t('addButton')}
        </button>
        <p className="text-xs text-warning-fg">
          {t('oneActiveHint')}
        </p>
      </div>
    </form>
  )
}

// ─── Row actions (toggle + delete + inline edit) ──────────────────────────────

export function TariffRowActions({ tariff }: { tariff: ImportTariff }) {
  const t  = useTranslations('admin.tariffActions')
  const ti = useTranslations('admin.importTariffs')
  const tc = useTranslations('admin.common')
  const [editing, setEditing] = useState(false)
  const [editState, editAction, isPendingEdit] = useActionState(upsertTariff, initialState)
  const [pendingToggle, setPendingToggle] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [editShippingMode, setEditShippingMode] = useState<ImportShippingMode>(tariff.shipping_mode)

  const handleToggle = async () => {
    setPendingToggle(true)
    setToggleError(null)
    const result = await toggleTariffActive(tariff.id, !tariff.active)
    if (result.error) setToggleError(result.error)
    setPendingToggle(false)
  }

  const handleDelete = async () => {
    if (!confirm(t('confirmDelete', { country: ti(`country.${tariff.country}`), mode: ti(`shippingMode.${tariff.shipping_mode}`) }))) return
    setPendingDelete(true)
    await deleteTariff(tariff.id)
    setPendingDelete(false)
  }

  if (editing) {
    return (
      <td colSpan={7} className="px-4 py-4 bg-surface-2">
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={tariff.id} />
          <input type="hidden" name="active" value={String(tariff.active)} />

          {editState?.error && (
            <p className="text-xs text-danger-fg">{editState.error}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t('countryLabel')}</label>
              <select name="country" defaultValue={tariff.country} disabled={isPendingEdit} className={INPUT}>
                {COUNTRIES.map((value) => (
                  <option key={value} value={value}>{ti(`country.${value}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t('modeLabelShort')}</label>
              <select
                name="shipping_mode"
                value={editShippingMode}
                onChange={(e) => setEditShippingMode(e.target.value as ImportShippingMode)}
                disabled={isPendingEdit}
                className={INPUT}
              >
                {SHIPPING_MODES.map((value) => (
                  <option key={value} value={value}>{ti(`shippingMode.${value}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {t('feeLabel', { unit: unitFromShippingMode(editShippingMode) === 'cbm' ? 'CBM' : 'kg' })}
              </label>
              <input
                name="transport_customs_price_mad"
                type="number"
                step="0.01"
                min="0"
                defaultValue={tariff.transport_customs_price_mad}
                disabled={isPendingEdit}
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t('delayShort')}</label>
              <input
                name="delivery_days"
                type="number"
                step="1"
                min="1"
                defaultValue={tariff.delivery_days ?? ''}
                disabled={isPendingEdit}
                className={INPUT}
                placeholder="—"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t('notesLabel')}</label>
            <textarea
              name="notes"
              rows={2}
              defaultValue={tariff.notes ?? ''}
              disabled={isPendingEdit}
              className={INPUT + ' resize-none'}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPendingEdit}
              className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPendingEdit ? tc('saving') : t('saveEdit')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 border border-line text-muted text-xs rounded-lg hover:bg-surface-2 transition-colors"
            >
              {tc('cancel')}
            </button>
          </div>
        </form>
      </td>
    )
  }

  return (
    <div className="space-y-1">
      {toggleError && (
        <p className="text-xs text-danger-fg text-right">{toggleError}</p>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-2.5 py-1 border border-line rounded-lg hover:bg-surface-2 transition-colors text-muted"
        >
          {tc('edit')}
        </button>
        <button
          onClick={handleToggle}
          disabled={pendingToggle}
          className={`text-xs px-2.5 py-1 border rounded-lg transition-colors disabled:opacity-50 ${
            tariff.active
              ? 'border-warning text-warning-fg hover:bg-warning-soft'
              : 'border-success text-success-fg hover:bg-success-soft'
          }`}
        >
          {pendingToggle ? '…' : tariff.active ? tc('deactivate') : tc('activate')}
        </button>
        <button
          onClick={handleDelete}
          disabled={pendingDelete}
          className="text-xs px-2.5 py-1 border border-danger text-danger-fg rounded-lg hover:bg-danger-soft transition-colors disabled:opacity-50"
        >
          {pendingDelete ? '…' : tc('delete')}
        </button>
      </div>
    </div>
  )
}
