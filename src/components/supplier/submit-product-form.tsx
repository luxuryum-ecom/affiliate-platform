'use client'

import { useActionState, useState } from 'react'
import { submitSupplierProduct, type SupplierProductState } from '@/app/actions/supplier-products'
import { PRODUCT_CATEGORIES, getSubcategories, ORIGIN_COUNTRIES } from '@/lib/taxonomy'

const initial: SupplierProductState = { error: null }

// ─── Shared input style ────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const HELPER = 'mt-1 text-xs text-gray-400'
const SECTION = 'text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 pb-1 border-b border-gray-100'

export function SubmitProductForm() {
  const [state, action, isPending] = useActionState(submitSupplierProduct, initial)
  const [supplierType, setSupplierType] = useState<'morocco' | 'international'>('morocco')
  const [category, setCategory] = useState('')

  const subcategories = getSubcategories(category)

  return (
    <form action={action} className="space-y-6">

      {/* ── Section: Profil fournisseur ──────────────────────────────────────── */}
      <div>
        <p className={SECTION}>Profil fournisseur</p>

        <div>
          <label className={LABEL}>
            Type de fournisseur <span className="text-red-500">*</span>
          </label>
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setSupplierType('morocco')}
              className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors ${
                supplierType === 'morocco'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🇲🇦 Fournisseur Maroc
            </button>
            <button
              type="button"
              onClick={() => setSupplierType('international')}
              className={`flex-1 text-center py-2 text-sm font-medium rounded-md transition-colors ${
                supplierType === 'international'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🌍 International
            </button>
          </div>
          <input type="hidden" name="supplier_type" value={supplierType} />

          {supplierType === 'morocco' ? (
            <p className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
              🏭 Stock local au Maroc — pas de douane — vente en gros uniquement.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
              🌍 Import international — le prix final inclura le transport et les frais de douane définis par la plateforme.
            </p>
          )}
        </div>
      </div>

      {/* ── Section: Identification produit ─────────────────────────────────── */}
      <div className="space-y-4">
        <p className={SECTION}>Identification produit</p>

        {/* Product name */}
        <div>
          <label className={LABEL}>
            Nom du produit <span className="text-red-500">*</span>
          </label>
          <input
            name="product_name"
            type="text"
            required
            disabled={isPending}
            className={INPUT}
            placeholder="ex: Robe en lin, Hijab premium, Chaussures sport..."
          />
        </div>

        {/* Category + Subcategory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
              Catégorie <span className="text-red-500">*</span>
            </label>
            <select
              name="category"
              required
              disabled={isPending}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={INPUT}
            >
              <option value="">Sélectionner une catégorie...</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Sous-catégorie</label>
            {subcategories.length > 0 ? (
              <select
                name="niche"
                disabled={isPending}
                className={INPUT}
              >
                <option value="">Sélectionner...</option>
                {subcategories.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            ) : (
              <input
                name="niche"
                type="text"
                disabled={isPending || !category}
                className={INPUT}
                placeholder={category ? 'Précisez la niche...' : 'Sélectionnez d\'abord une catégorie'}
              />
            )}
            <p className={HELPER}>Sélectionnez la catégorie pour voir les sous-catégories.</p>
          </div>
        </div>
        {/* subcategory hidden field mirrors niche for migration 039 */}
        <input type="hidden" name="subcategory" value="" />

        {/* Description */}
        <div>
          <label className={LABEL}>Description</label>
          <textarea
            name="description"
            rows={3}
            disabled={isPending}
            className={`${INPUT} resize-none`}
            placeholder="Matériaux, caractéristiques, tailles disponibles, variantes de couleurs..."
          />
        </div>
      </div>

      {/* ── Section: Origine & disponibilité ────────────────────────────────── */}
      <div className="space-y-4">
        <p className={SECTION}>Origine & disponibilité</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Origin country */}
          <div>
            <label className={LABEL}>
              {supplierType === 'morocco' ? 'Ville / Région (Maroc)' : "Pays d'origine"}
              <span className="text-red-500"> *</span>
            </label>
            {supplierType === 'international' ? (
              <select
                name="origin_country"
                required
                disabled={isPending}
                className={INPUT}
              >
                <option value="">Sélectionner...</option>
                {ORIGIN_COUNTRIES.filter((o) => o !== 'Maroc').map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                name="origin_country"
                type="text"
                required
                disabled={isPending}
                className={INPUT}
                placeholder="ex: Casablanca, Fès, Meknès..."
              />
            )}
          </div>

          {/* Min quantity */}
          <div>
            <label className={LABEL}>
              Quantité minimale (MOQ) <span className="text-red-500">*</span>
            </label>
            <input
              name="min_quantity"
              type="number"
              min={1}
              defaultValue={10}
              required
              disabled={isPending}
              className={INPUT}
            />
            <p className={HELPER}>Commande minimum acceptée.</p>
          </div>
        </div>

        {/* Availability — Morocco: always local_stock */}
        {supplierType === 'international' ? (
          <div>
            <label className={LABEL}>Disponibilité</label>
            <select
              name="availability_type"
              disabled={isPending}
              className={INPUT}
            >
              <option value="import_on_demand">Import sur commande</option>
              <option value="local_stock">Stock disponible au Maroc</option>
            </select>
          </div>
        ) : (
          <>
            <input type="hidden" name="availability_type" value="local_stock" />
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="text-xs text-gray-500">
                Disponibilité : <span className="font-medium text-gray-700">Stock local Maroc</span>
              </p>
            </div>
          </>
        )}

        {/* Target buyer */}
        {supplierType === 'morocco' ? (
          <>
            <input type="hidden" name="target_buyer_type" value="wholesaler" />
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="text-xs text-gray-500">
                Acheteurs cibles : <span className="font-medium text-gray-700">Grossistes uniquement</span>
              </p>
            </div>
          </>
        ) : (
          <div>
            <label className={LABEL}>Type d&apos;acheteur cible</label>
            <select
              name="target_buyer_type"
              disabled={isPending}
              className={INPUT}
            >
              <option value="wholesaler">Grossiste uniquement</option>
              <option value="both">Grossiste + Affilié</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Section: Tarification ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className={SECTION}>Tarification</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>
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
              className={INPUT}
              placeholder="ex: 150.00"
            />
          </div>
          <div>
            <label className={LABEL}>Stock disponible</label>
            <input
              name="stock_quantity"
              type="number"
              min={0}
              disabled={isPending}
              className={INPUT}
              placeholder="ex: 500"
            />
          </div>
        </div>
        <div>
          <label className={LABEL}>Délai de livraison (jours)</label>
          <input
            name="lead_time_days"
            type="number"
            min={0}
            disabled={isPending}
            className={INPUT}
            placeholder="ex: 14"
          />
        </div>
        <div>
          <label className={LABEL}>Paliers de prix (quantité min. + prix USD / unité)</label>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <input
                  name={`tier_${i}_qty`}
                  type="number"
                  min={1}
                  disabled={isPending}
                  className={INPUT}
                  placeholder={`Palier ${i} — qté min.`}
                />
                <input
                  name={`tier_${i}_price`}
                  type="number"
                  min={0}
                  step="0.0001"
                  disabled={isPending}
                  className={INPUT}
                  placeholder="Prix USD / u."
                />
              </div>
            ))}
          </div>
          <p className={HELPER}>
            Les prix sont définis par le fournisseur. Mozouna ne les invente pas — validation admin obligatoire.
          </p>
        </div>
      </div>

      {/* ── Section: Médias ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className={SECTION}>Médias</p>

        <div>
          <label className={LABEL}>Photos (une URL par ligne)</label>
          <textarea
            name="photos"
            rows={3}
            disabled={isPending}
            className={`${INPUT} font-mono resize-none`}
            placeholder="https://exemple.com/photo1.jpg&#10;https://exemple.com/photo2.jpg"
          />
          <p className={HELPER}>Collez une URL d&apos;image par ligne.</p>
        </div>
      </div>

      {/* ── Section: Notes privées ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className={SECTION}>Notes internes</p>

        <div>
          <label className={LABEL}>Notes privées (usage interne uniquement)</label>
          <textarea
            name="supplier_private_notes"
            rows={2}
            disabled={isPending}
            className={`${INPUT} resize-none`}
            placeholder="Délais, conditions, contacts, informations logistiques..."
          />
          <p className={HELPER}>Ces notes ne seront jamais visibles par les acheteurs.</p>
        </div>
      </div>

      {/* Error */}
      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Soumission en cours…' : 'Soumettre pour validation Mozouna'}
      </button>
    </form>
  )
}
