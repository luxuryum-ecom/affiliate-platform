'use client'

import { useActionState } from 'react'
import { submitSupplierProduct, type SupplierProductState } from '@/app/actions/supplier-products'

const initial: SupplierProductState = { error: null }

export function SubmitProductForm() {
  const [state, action, isPending] = useActionState(submitSupplierProduct, initial)

  return (
    <form action={action} className="space-y-5">
      {/* Product name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nom du produit <span className="text-red-500">*</span>
        </label>
        <input
          name="product_name"
          type="text"
          required
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder="ex: Robe en lin marocain"
        />
      </div>

      {/* Category + Niche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
          <input
            name="category"
            type="text"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder="ex: Textile, Électronique"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Niche</label>
          <input
            name="niche"
            type="text"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder="ex: Mode femme, Décoration"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="Description du produit, matériaux, caractéristiques..."
        />
      </div>

      {/* Photos */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Photos (une URL par ligne)
        </label>
        <textarea
          name="photos"
          rows={3}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="https://exemple.com/photo1.jpg&#10;https://exemple.com/photo2.jpg"
        />
        <p className="mt-1 text-xs text-gray-400">Collez une URL d&apos;image par ligne.</p>
      </div>

      {/* Min qty + Origin country */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantité minimale <span className="text-red-500">*</span>
          </label>
          <input
            name="min_quantity"
            type="number"
            min={1}
            defaultValue={10}
            required
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pays d&apos;origine <span className="text-red-500">*</span>
          </label>
          <input
            name="origin_country"
            type="text"
            required
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder="ex: Maroc, Chine, Turquie"
          />
        </div>
      </div>

      {/* Availability + Target buyer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilité</label>
          <select
            name="availability_type"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 bg-white"
          >
            <option value="local_stock">Stock disponible</option>
            <option value="import_on_demand">Import sur commande</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;acheteur cible</label>
          <select
            name="target_buyer_type"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 bg-white"
          >
            <option value="wholesaler">Grossiste uniquement</option>
            <option value="both">Grossiste + Affilié</option>
          </select>
        </div>
      </div>

      {/* Suggested price */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Prix de gros suggéré (MAD)
        </label>
        <input
          name="suggested_wholesale_price_mad"
          type="number"
          min={0}
          step="0.01"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder="ex: 150.00"
        />
        <p className="mt-1 text-xs text-gray-400">
          Prix indicatif. La plateforme définira le prix final.
        </p>
      </div>

      {/* Private notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes privées (usage interne)
        </label>
        <textarea
          name="supplier_private_notes"
          rows={2}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder="Informations supplémentaires pour la plateforme (non publiées)"
        />
        <p className="mt-1 text-xs text-gray-400">Ces notes ne seront jamais visibles par les acheteurs.</p>
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Soumission en cours…' : 'Soumettre le produit'}
      </button>
    </form>
  )
}
