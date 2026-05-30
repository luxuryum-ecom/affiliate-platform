'use client'

import { useActionState, useState } from 'react'
import { submitSupplierProduct, type SupplierProductState } from '@/app/actions/supplier-products'
import { SUPPLIER_CATEGORIES } from '@/types/database'

const initial: SupplierProductState = { error: null }

export function SubmitProductForm() {
  const [state, action, isPending] = useActionState(submitSupplierProduct, initial)
  const [supplierType, setSupplierType] = useState<'morocco' | 'international'>('morocco')

  return (
    <form action={action} className="space-y-5">

      {/* Supplier type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Type de fournisseur <span className="text-red-500">*</span>
        </label>
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => setSupplierType('morocco')}
            className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors ${
              supplierType === 'morocco'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Fournisseur Maroc
          </button>
          <button
            type="button"
            onClick={() => setSupplierType('international')}
            className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors ${
              supplierType === 'international'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Fournisseur International
          </button>
        </div>
        <input type="hidden" name="supplier_type" value={supplierType} />

        {supplierType === 'morocco' ? (
          <p className="mt-1.5 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
            Stock local au Maroc — pas de douane — vente en gros uniquement.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
            Import international — le prix final inclura le transport et les frais de douane définis par la plateforme.
          </p>
        )}
      </div>

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
          placeholder="ex: Robe en lin, Hijab premium, Chaussures sport..."
        />
      </div>

      {/* Category + Niche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
          <select
            name="category"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="">Sélectionner...</option>
            {SUPPLIER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Niche / sous-catégorie</label>
          <input
            name="niche"
            type="text"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder="ex: Mode femme voilée, Fitness..."
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
          placeholder="Matériaux, caractéristiques, tailles disponibles..."
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
            {supplierType === 'morocco' ? 'Ville / Région au Maroc' : "Pays d'origine"}
            <span className="text-red-500"> *</span>
          </label>
          <input
            name="origin_country"
            type="text"
            required
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
            placeholder={supplierType === 'morocco' ? 'ex: Casablanca, Fès, Meknès' : 'ex: Chine, Turquie, Égypte'}
          />
        </div>
      </div>

      {/* Availability — Morocco: always local_stock, International: import_on_demand likely */}
      {supplierType === 'international' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilité</label>
          <select
            name="availability_type"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="import_on_demand">Import sur commande</option>
            <option value="local_stock">Stock disponible</option>
          </select>
        </div>
      )}
      {supplierType === 'morocco' && (
        <input type="hidden" name="availability_type" value="local_stock" />
      )}

      {/* Target buyer — Morocco is wholesale-only */}
      {supplierType === 'morocco' ? (
        <>
          <input type="hidden" name="target_buyer_type" value="wholesaler" />
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500">
              Type d&apos;acheteur : <span className="font-medium text-gray-700">Grossiste uniquement</span>
            </p>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;acheteur cible</label>
          <select
            name="target_buyer_type"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="wholesaler">Grossiste uniquement</option>
            <option value="both">Grossiste + Affilié</option>
          </select>
        </div>
      )}

      {/* Suggested price */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {supplierType === 'morocco'
            ? 'Prix de gros (MAD)'
            : 'Prix fournisseur (MAD) — ne sera pas affiché aux acheteurs'}
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
        {supplierType === 'international' && (
          <p className="mt-1 text-xs text-gray-400">
            La plateforme calculera le prix final (coût + transport + douane + marge) visible par les acheteurs.
          </p>
        )}
        {supplierType === 'morocco' && (
          <p className="mt-1 text-xs text-gray-400">Prix indicatif. La plateforme peut l&apos;ajuster.</p>
        )}
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
          placeholder="Délais, conditions, contacts, informations logistiques..."
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
