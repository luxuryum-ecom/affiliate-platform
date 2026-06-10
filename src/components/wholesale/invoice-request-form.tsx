'use client'

import { useActionState, useState } from 'react'
import { requestInvoice } from '@/app/actions/invoice'
import type { ActionState } from '@/types/orders'
import type { Profile } from '@/types/database'

const initial: ActionState = { error: null, success: false }

interface Props {
  orderId: string
  profile: Pick<Profile, 'company_name' | 'ice' | 'registre_commerce' | 'billing_address'>
}

export function InvoiceRequestForm({ orderId, profile }: Props) {
  const [state, action, isPending] = useActionState(requestInvoice, initial)
  const [open, setOpen] = useState(false)

  if (state.success) {
    return (
      <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
        ✓ Demande de facture envoyée. Notre équipe la préparera sous peu.
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          Demander une facture
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Demande de facture</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Annuler
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Renseignez vos informations de facturation. Ces champs sont optionnels.
      </p>

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Raison sociale
            </label>
            <input
              name="company_name"
              defaultValue={profile.company_name ?? ''}
              placeholder="Ex: SARL MonEntreprise"
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              ICE
            </label>
            <input
              name="ice"
              defaultValue={profile.ice ?? ''}
              placeholder="000000000000000"
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Registre de commerce
            </label>
            <input
              name="registre_commerce"
              defaultValue={profile.registre_commerce ?? ''}
              placeholder="RC n°..."
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Adresse de facturation
            </label>
            <input
              name="billing_address"
              defaultValue={profile.billing_address ?? ''}
              placeholder="123 Rue Mohammed V, Casablanca"
              className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Envoi…' : 'Confirmer la demande de facture'}
        </button>
      </form>
    </div>
  )
}
