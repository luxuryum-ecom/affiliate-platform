'use client'

import { useActionState } from 'react'
import { updateLogisticsSettings } from '@/app/actions/logistics'
import type { ActionState } from '@/types/orders'
import type { LogisticsSettings } from '@/types/database'

const initialState: ActionState = { error: null, success: false }

interface Props {
  settings: LogisticsSettings
}

export function LogisticsForm({ settings }: Props) {
  const [state, action, isPending] = useActionState(updateLogisticsSettings, initialState)

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Paramètres enregistrés avec succès.
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Casablanca delivery fee */}
        <div className="space-y-1.5">
          <label
            htmlFor="casablanca_delivery_fee_mad"
            className="block text-sm font-medium text-gray-700"
          >
            Frais de livraison — Casablanca
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
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-14 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
              MAD
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Appliqué quand la ville = &quot;Casablanca&quot;
          </p>
        </div>

        {/* Default delivery fee */}
        <div className="space-y-1.5">
          <label
            htmlFor="default_delivery_fee_mad"
            className="block text-sm font-medium text-gray-700"
          >
            Frais de livraison — Autres villes
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
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-14 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
              MAD
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Appliqué pour toutes les villes hors Casablanca
          </p>
        </div>

        {/* Return fee */}
        <div className="space-y-1.5">
          <label
            htmlFor="return_fee_mad"
            className="block text-sm font-medium text-gray-700"
          >
            Frais de retour
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
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-14 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
              MAD
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Appliqué pour toutes les villes en cas de retour
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
