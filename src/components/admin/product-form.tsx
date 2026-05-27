'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { upsertProduct, type ProductFormState } from '@/app/actions/products'
import type { Product, WholesaleTier } from '@/types/database'

// ─── Tier row (string fields for controlled inputs) ───────────────────────────

interface TierRow {
  min_qty: string
  max_qty: string      // empty = unlimited (last tier)
  price_per_unit: string
}

function tierToRow(t: WholesaleTier): TierRow {
  return {
    min_qty: String(t.min_qty),
    max_qty: t.max_qty != null ? String(t.max_qty) : '',
    price_per_unit: String(t.price_per_unit),
  }
}

function rowToTier(r: TierRow): WholesaleTier | null {
  const min = parseInt(r.min_qty)
  const price = parseFloat(r.price_per_unit)
  if (isNaN(min) || min < 1 || isNaN(price) || price <= 0) return null
  return {
    min_qty: min,
    max_qty: r.max_qty.trim() ? parseInt(r.max_qty) : undefined,
    price_per_unit: price,
  }
}

// ─── Input style ──────────────────────────────────────────────────────────────

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400'

const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

// ─── Main component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product
}

const initialState: ProductFormState = { error: null }

export function ProductForm({ product }: ProductFormProps) {
  const [state, action, isPending] = useActionState(upsertProduct, initialState)

  const [tiers, setTiers] = useState<TierRow[]>(
    product?.wholesale_tiers?.map(tierToRow) ?? []
  )

  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images : ['']
  )

  // Serialise to hidden inputs just before submit
  const validTiers = tiers.map(rowToTier).filter((t): t is WholesaleTier => t !== null)
  const validImages = images.filter((u) => u.trim().length > 0)

  // Tier helpers
  const addTier = () =>
    setTiers((prev) => [...prev, { min_qty: '', max_qty: '', price_per_unit: '' }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))
  const updateTier = (i: number, key: keyof TierRow, val: string) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)))

  // Image helpers
  const addImage = () => setImages((prev) => [...prev, ''])
  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i))
  const updateImage = (i: number, val: string) =>
    setImages((prev) => prev.map((url, idx) => (idx === i ? val : url)))

  return (
    <form action={action} className="space-y-7">
      {/* Hidden inputs — serialised state */}
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="wholesale_tiers" value={JSON.stringify(validTiers)} />
      <input type="hidden" name="images" value={JSON.stringify(validImages)} />

      {/* Error banner */}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      {/* ── Informations générales ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-1 border-b border-gray-100">
          Informations générales
        </h2>

        <div>
          <label htmlFor="name" className={LABEL}>
            Nom du produit <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            disabled={isPending}
            defaultValue={product?.name}
            className={INPUT}
            placeholder="Ex : Crème hydratante Argan"
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            disabled={isPending}
            defaultValue={product?.description ?? ''}
            className={INPUT + ' resize-none'}
            placeholder="Description courte du produit…"
          />
        </div>

        {/* Type + Statut */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={LABEL}>
              Type <span className="text-red-500">*</span>
            </p>
            <div className="flex gap-4 mt-1">
              {(['local', 'imported'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    defaultChecked={product ? product.type === t : t === 'local'}
                    disabled={isPending}
                    className="w-4 h-4 accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">
                    {t === 'local' ? 'Local' : 'Importé'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className={LABEL}>Statut</p>
            <label className="flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                name="active"
                defaultChecked={product?.active ?? false}
                disabled={isPending}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-sm text-gray-700">Produit actif (visible)</span>
            </label>
          </div>
        </div>
      </section>

      {/* ── Tarification ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-1 border-b border-gray-100">
          Tarification
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sell_price" className={LABEL}>
              Prix de vente (MAD) <span className="text-red-500">*</span>
            </label>
            <input
              id="sell_price"
              name="sell_price"
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={isPending}
              defaultValue={product?.sell_price}
              className={INPUT}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="commission_amount" className={LABEL}>
              Commission affilié (MAD)
            </label>
            <input
              id="commission_amount"
              name="commission_amount"
              type="number"
              step="0.01"
              min="0"
              disabled={isPending}
              defaultValue={product?.commission_amount ?? 0}
              className={INPUT}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-400 mt-1">
              Montant versé à l&apos;affilié à chaque livraison.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stock ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 pb-1 border-b border-gray-100">
          Stock & quantités
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stock_count" className={LABEL}>
              Quantité en stock
            </label>
            <input
              id="stock_count"
              name="stock_count"
              type="number"
              min="0"
              disabled={isPending}
              defaultValue={product?.stock_count ?? 0}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="wholesale_min_qty" className={LABEL}>
              Commande min. gros (unités)
            </label>
            <input
              id="wholesale_min_qty"
              name="wholesale_min_qty"
              type="number"
              min="1"
              disabled={isPending}
              defaultValue={product?.wholesale_min_qty ?? 1}
              className={INPUT}
            />
            <p className="text-xs text-gray-400 mt-1">
              Quantité minimale pour une commande grossiste.
            </p>
          </div>
        </div>
      </section>

      {/* ── Paliers de prix gros ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Paliers de prix gros
          </h2>
          <button
            type="button"
            onClick={addTier}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Palier
          </button>
        </div>

        {tiers.length === 0 ? (
          <p className="text-xs text-gray-400 py-2 bg-gray-50 rounded-lg text-center">
            Aucun palier. Cliquez «+ Palier» pour définir les prix gros par quantité.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1">
              {['Qté min', 'Qté max (vide = ∞)', 'Prix / unité (MAD)', ''].map((h) => (
                <span key={h} className="text-xs font-medium text-gray-500">
                  {h}
                </span>
              ))}
            </div>

            {tiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  placeholder="10"
                  value={tier.min_qty}
                  onChange={(e) => updateTier(i, 'min_qty', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Quantité minimum"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="∞"
                  value={tier.max_qty}
                  onChange={(e) => updateTier(i, 'max_qty', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Quantité maximum"
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="120.00"
                  value={tier.price_per_unit}
                  onChange={(e) => updateTier(i, 'price_per_unit', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Prix par unité"
                />
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  aria-label="Supprimer le palier"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Images ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Images (URLs)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              La première image est utilisée comme miniature.
            </p>
          </div>
          <button
            type="button"
            onClick={addImage}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Image
          </button>
        </div>

        <div className="space-y-2">
          {images.map((url, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="url"
                value={url}
                onChange={(e) => updateImage(i, e.target.value)}
                placeholder="https://…"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                aria-label={`URL image ${i + 1}`}
              />
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  aria-label="Supprimer l'image"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Submit ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="py-2.5 px-6 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? 'Enregistrement…'
            : product
            ? 'Mettre à jour le produit'
            : 'Créer le produit'}
        </button>
        <Link
          href="/admin/products"
          className="py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors text-center"
        >
          Annuler
        </Link>
      </div>
    </form>
  )
}
