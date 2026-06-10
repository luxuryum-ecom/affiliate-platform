'use client'

import { useActionState } from 'react'
import {
  approveSupplierProduct,
  rejectSupplierProduct,
  type SupplierProductState,
} from '@/app/actions/supplier-products'

const initial: SupplierProductState = { error: null }

interface ApproveFormProps {
  id: string
  publicName: string | null
  publicDescription: string | null
  platformMarginType: string
  platformMarginValue: number | null
  adminNotes: string | null
}

export function ApproveSupplierProductForm({
  id,
  publicName,
  publicDescription,
  platformMarginType,
  platformMarginValue,
  adminNotes,
}: ApproveFormProps) {
  const [state, action, isPending] = useActionState(approveSupplierProduct, initial)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nom public (affiché aux grossistes)
        </label>
        <input
          name="public_name"
          type="text"
          defaultValue={publicName ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder="Laisser vide pour utiliser le nom du fournisseur"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description publique
        </label>
        <textarea
          name="public_description"
          rows={3}
          defaultValue={publicDescription ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type de marge</label>
          <select
            name="platform_margin_type"
            defaultValue={platformMarginType}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="percentage">Pourcentage (%)</option>
            <option value="fixed">Fixe (MAD)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valeur de la marge</label>
          <input
            name="platform_margin_value"
            type="number"
            min={0}
            step="0.01"
            defaultValue={platformMarginValue ?? ''}
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder="ex: 20"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Note admin (interne)
        </label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={adminNotes ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="Note interne optionnelle"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">
          Produit approuvé avec succès.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Approbation…' : 'Approuver et publier'}
      </button>
    </form>
  )
}

interface RejectFormProps {
  id: string
  adminNotes: string | null
}

export function RejectSupplierProductForm({ id, adminNotes }: RejectFormProps) {
  const [state, action, isPending] = useActionState(rejectSupplierProduct, initial)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Motif du blocage (visible par le fournisseur)
        </label>
        <textarea
          name="admin_notes"
          rows={2}
          defaultValue={adminNotes ?? ''}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="Expliquez pourquoi ce produit est refusé..."
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">
          Produit bloqué.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Blocage…' : 'Bloquer ce produit'}
      </button>
    </form>
  )
}
