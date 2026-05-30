'use client'

import { useActionState, useState } from 'react'
import {
  upsertTariff,
  toggleTariffActive,
  deleteTariff,
  type TariffFormState,
} from '@/app/actions/tariffs'
import { SHIPPING_MODE_LABELS, unitFromShippingMode } from '@/lib/tariff-utils'
import type { ImportTariff, TariffCountry, ImportShippingMode } from '@/types/database'

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

const COUNTRIES: { value: TariffCountry; label: string }[] = [
  { value: 'Turquie', label: 'Turquie' },
  { value: 'Chine', label: 'Chine' },
  { value: 'Égypte', label: 'Égypte' },
  { value: 'Dubai', label: 'Dubai' },
  { value: 'Autre', label: 'Autre' },
]

const SHIPPING_MODES: { value: ImportShippingMode; label: string }[] = (
  Object.entries(SHIPPING_MODE_LABELS) as [ImportShippingMode, string][]
).map(([value, label]) => ({ value, label }))

// ─── Add form ─────────────────────────────────────────────────────────────────

const initialState: TariffFormState = { error: null }

export function AddTariffForm() {
  const [state, action, isPending] = useActionState(upsertTariff, initialState)
  const [shippingMode, setShippingMode] = useState<ImportShippingMode>('air_door_to_door_kg')

  const unit = unitFromShippingMode(shippingMode)

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Pays <span className="text-red-500">*</span>
          </label>
          <select name="country" required disabled={isPending} className={INPUT}>
            <option value="">— Sélectionner —</option>
            {COUNTRIES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Mode de transport <span className="text-red-500">*</span>
          </label>
          <select
            name="shipping_mode"
            required
            disabled={isPending}
            value={shippingMode}
            onChange={(e) => setShippingMode(e.target.value as ImportShippingMode)}
            className={INPUT}
          >
            {SHIPPING_MODES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Frais transport & douane (MAD / {unit === 'cbm' ? 'CBM' : 'kg'})
            <span className="text-red-500"> *</span>
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
          <p className="text-xs text-gray-400 mt-1">
            Unité auto : <strong>{unit === 'cbm' ? 'CBM' : 'kg'}</strong> — ne pas inclure le coût produit
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Délai de livraison (jours)
          </label>
          <input
            name="delivery_days"
            type="number"
            step="1"
            min="1"
            disabled={isPending}
            placeholder="Ex : 14"
            className={INPUT}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea
          name="notes"
          rows={2}
          disabled={isPending}
          placeholder="Conditions douanières, remarques, délais variables…"
          className={INPUT + ' resize-none'}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Ajout…' : '+ Ajouter le tarif'}
        </button>
        <p className="text-xs text-amber-600">
          Un seul tarif actif par pays + mode de transport.
        </p>
      </div>
    </form>
  )
}

// ─── Row actions (toggle + delete + inline edit) ──────────────────────────────

export function TariffRowActions({ tariff }: { tariff: ImportTariff }) {
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
    if (!confirm(`Supprimer ce tarif (${tariff.country} — ${SHIPPING_MODE_LABELS[tariff.shipping_mode]}) ?`)) return
    setPendingDelete(true)
    await deleteTariff(tariff.id)
    setPendingDelete(false)
  }

  if (editing) {
    return (
      <td colSpan={7} className="px-4 py-4 bg-blue-50">
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={tariff.id} />
          <input type="hidden" name="active" value={String(tariff.active)} />

          {editState?.error && (
            <p className="text-xs text-red-600">{editState.error}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pays</label>
              <select name="country" defaultValue={tariff.country} disabled={isPendingEdit} className={INPUT}>
                {COUNTRIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Mode</label>
              <select
                name="shipping_mode"
                value={editShippingMode}
                onChange={(e) => setEditShippingMode(e.target.value as ImportShippingMode)}
                disabled={isPendingEdit}
                className={INPUT}
              >
                {SHIPPING_MODES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Frais transport & douane (MAD / {unitFromShippingMode(editShippingMode) === 'cbm' ? 'CBM' : 'kg'})
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Délai (j)</label>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
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
              className="px-4 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {isPendingEdit ? 'Enregistrement…' : 'Sauvegarder'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      </td>
    )
  }

  return (
    <div className="space-y-1">
      {toggleError && (
        <p className="text-xs text-red-600 text-right">{toggleError}</p>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-2.5 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Modifier
        </button>
        <button
          onClick={handleToggle}
          disabled={pendingToggle}
          className={`text-xs px-2.5 py-1 border rounded-lg transition-colors disabled:opacity-50 ${
            tariff.active
              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
              : 'border-green-300 text-green-700 hover:bg-green-50'
          }`}
        >
          {pendingToggle ? '…' : tariff.active ? 'Désactiver' : 'Activer'}
        </button>
        <button
          onClick={handleDelete}
          disabled={pendingDelete}
          className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {pendingDelete ? '…' : 'Supprimer'}
        </button>
      </div>
    </div>
  )
}
