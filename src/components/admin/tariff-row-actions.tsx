'use client'

import { useActionState, useState } from 'react'
import { upsertTariff, toggleTariffActive, deleteTariff, type TariffFormState } from '@/app/actions/tariffs'
import type { ImportTariff, TariffCountry, ImportPricingMode, ImportPriceUnit } from '@/types/database'

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

const COUNTRIES: { value: TariffCountry; label: string }[] = [
  { value: 'Turquie', label: 'Turquie' },
  { value: 'Chine', label: 'Chine' },
  { value: 'Égypte', label: 'Égypte' },
  { value: 'Dubai', label: 'Dubai' },
  { value: 'Autre', label: 'Autre' },
]

const PRICING_MODES: { value: ImportPricingMode; label: string }[] = [
  { value: 'door_to_door_per_kg', label: 'Porte-à-porte / kg' },
  { value: 'sea_freight_cbm_or_kg', label: 'Fret maritime (CBM ou kg)' },
]

const UNITS: { value: ImportPriceUnit; label: string }[] = [
  { value: 'kg', label: 'par kg' },
  { value: 'cbm', label: 'par CBM' },
]

// ─── Add form ─────────────────────────────────────────────────────────────────

const initialState: TariffFormState = { error: null }

export function AddTariffForm() {
  const [state, action, isPending] = useActionState(upsertTariff, initialState)
  const [pricingMode, setPricingMode] = useState<ImportPricingMode>('door_to_door_per_kg')

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
            Mode de tarification <span className="text-red-500">*</span>
          </label>
          <select
            name="pricing_mode"
            required
            disabled={isPending}
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value as ImportPricingMode)}
            className={INPUT}
          >
            {PRICING_MODES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Prix (MAD) <span className="text-red-500">*</span>
          </label>
          <input
            name="price_mad"
            type="number"
            step="0.01"
            min="0"
            required
            disabled={isPending}
            placeholder="0.00"
            className={INPUT}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unité <span className="text-red-500">*</span>
          </label>
          <select name="unit" required disabled={isPending} className={INPUT}>
            {UNITS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
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
            placeholder="Ex : 21"
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
          placeholder="Conditions, remarques, délais variables…"
          className={INPUT + ' resize-none'}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Ajout…' : '+ Ajouter le tarif'}
      </button>
    </form>
  )
}

// ─── Row actions (toggle + delete + inline edit) ──────────────────────────────

export function TariffRowActions({ tariff }: { tariff: ImportTariff }) {
  const [editing, setEditing] = useState(false)
  const [editState, editAction, isPendingEdit] = useActionState(upsertTariff, initialState)
  const [pendingToggle, setPendingToggle] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [editPricingMode, setEditPricingMode] = useState<ImportPricingMode>(tariff.pricing_mode)

  const handleToggle = async () => {
    setPendingToggle(true)
    await toggleTariffActive(tariff.id, !tariff.active)
    setPendingToggle(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer le tarif ${tariff.country} ?`)) return
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                name="pricing_mode"
                value={editPricingMode}
                onChange={(e) => setEditPricingMode(e.target.value as ImportPricingMode)}
                disabled={isPendingEdit}
                className={INPUT}
              >
                {PRICING_MODES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prix (MAD)</label>
              <input
                name="price_mad"
                type="number"
                step="0.01"
                min="0"
                defaultValue={tariff.price_mad}
                disabled={isPendingEdit}
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unité</label>
              <select name="unit" defaultValue={tariff.unit} disabled={isPendingEdit} className={INPUT}>
                {UNITS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
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
  )
}
