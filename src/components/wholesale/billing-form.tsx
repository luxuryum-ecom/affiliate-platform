'use client'

import { useActionState } from 'react'
import { updateWholesalerBilling } from '@/app/actions/profile'
import type { Profile } from '@/types/database'

interface Props {
  profile: Profile | null
}

export function WholesalerBillingForm({ profile }: Props) {
  const [state, action, isPending] = useActionState(updateWholesalerBilling, {
    error: null,
    success: false,
  })

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          Informations de facturation mises à jour.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1" htmlFor="company_name">
            Raison sociale / Nom de la société
          </label>
          <input
            id="company_name"
            name="company_name"
            type="text"
            defaultValue={profile?.company_name ?? ''}
            placeholder="Ex : Sté Benali & Fils SARL"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1" htmlFor="ice">
            ICE (Identifiant Commun de l&apos;Entreprise)
          </label>
          <input
            id="ice"
            name="ice"
            type="text"
            defaultValue={profile?.ice ?? ''}
            placeholder="000000000000000"
            maxLength={20}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1" htmlFor="registre_commerce">
            Registre de commerce (RC)
          </label>
          <input
            id="registre_commerce"
            name="registre_commerce"
            type="text"
            defaultValue={profile?.registre_commerce ?? ''}
            placeholder="Ex : 123456"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1" htmlFor="billing_address">
            Adresse de facturation
          </label>
          <textarea
            id="billing_address"
            name="billing_address"
            rows={2}
            defaultValue={profile?.billing_address ?? ''}
            placeholder="Ex : 12 Rue de la Liberté, Casablanca 20000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
