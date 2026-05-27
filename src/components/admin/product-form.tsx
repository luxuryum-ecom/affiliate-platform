'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { upsertProduct, type ProductFormState } from '@/app/actions/products'
import { formatMAD } from '@/lib/utils'
import type { Product, WholesaleTier, ProductApprovalStatus } from '@/types/database'

// ─── Tier row ─────────────────────────────────────────────────────────────────

interface TierRow {
  min_qty: string
  max_qty: string
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400'

const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

const SECTION_TITLE = 'text-sm font-semibold text-gray-900 pb-1 border-b border-gray-100'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 leading-relaxed">
      {children}
    </div>
  )
}

function CalcRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product
}

const initialState: ProductFormState = { error: null }

export function ProductForm({ product }: ProductFormProps) {
  const [state, action, isPending] = useActionState(upsertProduct, initialState)

  // ── Sourcing state ────────────────────────────────────────────────────────
  const [sourceType, setSourceType] = useState<string>(
    product?.source_type ?? 'local_production'
  )

  // ── Cost/margin state (for live preview) ──────────────────────────────────
  const [purchasePrice, setPurchasePrice] = useState<string>(
    product?.purchase_price != null ? String(product.purchase_price) : ''
  )
  const [exchangeRate, setExchangeRate] = useState<string>(
    String(product?.exchange_rate_to_mad ?? 1)
  )
  const [margin, setMargin] = useState<string>(
    String(product?.margin_percentage ?? 30)
  )

  // ── Approval state ────────────────────────────────────────────────────────
  const [approvalStatus, setApprovalStatus] = useState<ProductApprovalStatus>(
    product?.approval_status ?? 'draft'
  )

  // ── Tier / image state ────────────────────────────────────────────────────
  const [tiers, setTiers] = useState<TierRow[]>(
    product?.wholesale_tiers?.map(tierToRow) ?? []
  )
  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images : ['']
  )

  // ── Live pricing calculation ──────────────────────────────────────────────
  const pp = parseFloat(purchasePrice)
  const er = parseFloat(exchangeRate) || 1
  const mg = parseFloat(margin) || 0

  const purchasePriceMad =
    !isNaN(pp) && pp > 0
      ? sourceType === 'local_production'
        ? pp
        : parseFloat((pp * er).toFixed(2))
      : null

  const suggestedSellPrice =
    purchasePriceMad !== null
      ? parseFloat((purchasePriceMad * (1 + mg / 100)).toFixed(2))
      : null

  // ── Serialised hidden values ──────────────────────────────────────────────
  const validTiers = tiers.map(rowToTier).filter((t): t is WholesaleTier => t !== null)
  const validImages = images.filter((u) => u.trim().length > 0)

  // ── Tier helpers ──────────────────────────────────────────────────────────
  const addTier = () =>
    setTiers((prev) => [...prev, { min_qty: '', max_qty: '', price_per_unit: '' }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))
  const updateTier = (i: number, key: keyof TierRow, val: string) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)))

  // ── Image helpers ─────────────────────────────────────────────────────────
  const addImage = () => setImages((prev) => [...prev, ''])
  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i))
  const updateImage = (i: number, val: string) =>
    setImages((prev) => prev.map((url, idx) => (idx === i ? val : url)))

  return (
    <form action={action} className="space-y-8">
      {/* Hidden serialised state */}
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="wholesale_tiers" value={JSON.stringify(validTiers)} />
      <input type="hidden" name="images" value={JSON.stringify(validImages)} />
      <input type="hidden" name="submitted_via" value="admin_dashboard" />

      {/* Error banner */}
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. INFORMATIONS GÉNÉRALES
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Informations générales</h2>

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

        {/* Source type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={LABEL}>
              Type de source <span className="text-red-500">*</span>
            </p>
            <div className="flex gap-4 mt-1">
              {(
                [
                  { val: 'local_production', label: 'Production locale' },
                  { val: 'imported', label: 'Importé' },
                ] as const
              ).map(({ val, label }) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="source_type"
                    value={val}
                    checked={sourceType === val}
                    onChange={() => setSourceType(val)}
                    disabled={isPending}
                    className="w-4 h-4 accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="origin_country" className={LABEL}>
              Pays d&apos;origine
            </label>
            <input
              id="origin_country"
              name="origin_country"
              type="text"
              disabled={isPending}
              defaultValue={product?.origin_country ?? ''}
              className={INPUT}
              placeholder="Ex : Maroc, Chine, Turquie…"
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. SOURCING & TRAÇABILITÉ
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Sourcing & traçabilité</h2>

        <InfoBox>
          Ces informations ne sont jamais visibles des affiliés ou grossistes.
          Elles servent à tracer l&apos;origine du produit et seront utilisées lors de
          l&apos;intégration future Telegram / fournisseur.
        </InfoBox>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="supplier_name" className={LABEL}>
              Nom du fournisseur / fournisseur
            </label>
            <input
              id="supplier_name"
              name="supplier_name"
              type="text"
              disabled={isPending}
              defaultValue={product?.supplier_name ?? ''}
              className={INPUT}
              placeholder="Ex : Fournisseur Casablanca"
            />
          </div>

          <div>
            <label htmlFor="submitted_via_display" className={LABEL}>
              Canal de soumission
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-500">
                {product?.submitted_via === 'telegram_future'
                  ? 'Telegram (futur)'
                  : product?.submitted_via === 'supplier_future'
                  ? 'Fournisseur (futur)'
                  : 'Dashboard admin'}
              </span>
              {product?.submitted_by && (
                <span className="text-xs text-gray-400 ml-auto">
                  ID&nbsp;: {product.submitted_by.slice(0, 8)}…
                </span>
              )}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="source_notes" className={LABEL}>
            Notes de sourcing
          </label>
          <textarea
            id="source_notes"
            name="source_notes"
            rows={2}
            disabled={isPending}
            defaultValue={product?.source_notes ?? ''}
            className={INPUT + ' resize-none'}
            placeholder="Informations sur le fournisseur, conditions, délais…"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. COÛT & MARGE
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Coût d&apos;achat & marge</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purchase_price" className={LABEL}>
              Prix d&apos;achat
            </label>
            <input
              id="purchase_price"
              name="purchase_price"
              type="number"
              step="0.01"
              min="0"
              disabled={isPending}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className={INPUT}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="purchase_currency" className={LABEL}>
              Devise
            </label>
            <select
              id="purchase_currency"
              name="purchase_currency"
              disabled={isPending}
              defaultValue={product?.purchase_currency ?? 'MAD'}
              className={INPUT}
            >
              {['MAD', 'USD', 'EUR', 'CNY', 'TRY', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Exchange rate — only relevant for imported products */}
          <div className={sourceType !== 'imported' ? 'opacity-40' : ''}>
            <label htmlFor="exchange_rate_to_mad" className={LABEL}>
              Taux de change → MAD
            </label>
            <input
              id="exchange_rate_to_mad"
              name="exchange_rate_to_mad"
              type="number"
              step="0.0001"
              min="0.0001"
              disabled={isPending || sourceType !== 'imported'}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className={INPUT}
              placeholder="1.00"
            />
            {sourceType !== 'imported' && (
              <p className="text-xs text-gray-400 mt-1">Non applicable (production locale)</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="margin_percentage" className={LABEL}>
              Marge cible (%)
            </label>
            <input
              id="margin_percentage"
              name="margin_percentage"
              type="number"
              step="0.5"
              min="0"
              max="1000"
              disabled={isPending}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className={INPUT}
              placeholder="30"
            />
          </div>

          {/* Live calculation preview */}
          {purchasePriceMad !== null && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Calcul automatique
              </p>
              <CalcRow
                label="Coût en MAD"
                value={formatMAD(purchasePriceMad)}
              />
              <CalcRow
                label={`Prix suggéré (+${margin}%)`}
                value={suggestedSellPrice ? formatMAD(suggestedSellPrice) : '—'}
                highlight
              />
              <p className="text-xs text-gray-400 pt-1 border-t border-gray-200">
                Vous pouvez fixer un prix de vente différent ci-dessous.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. PRIX & COMMISSIONS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Prix de vente & commissions</h2>

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
              defaultValue={product?.sell_price ?? suggestedSellPrice ?? undefined}
              className={INPUT}
              placeholder={suggestedSellPrice ? String(suggestedSellPrice) : '0.00'}
            />
            {suggestedSellPrice && (
              <p className="text-xs text-gray-400 mt-1">
                Prix suggéré&nbsp;: {formatMAD(suggestedSellPrice)}
              </p>
            )}
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

      {/* ══════════════════════════════════════════════════════════════════════
          5. STOCK & QUANTITÉS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Stock & quantités disponibles</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stock_count" className={LABEL}>
              Quantité disponible (stock)
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

      {/* ══════════════════════════════════════════════════════════════════════
          6. PALIERS DE PRIX GROS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={SECTION_TITLE}>Paliers de prix gros</h2>
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
            Aucun palier. Cliquez «&nbsp;+&nbsp;Palier&nbsp;» pour définir les prix gros par quantité.
          </p>
        ) : (
          <div className="space-y-2">
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

      {/* ══════════════════════════════════════════════════════════════════════
          7. IMAGES
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={SECTION_TITLE}>Images (URLs)</h2>
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

      {/* ══════════════════════════════════════════════════════════════════════
          8. STATUT & APPROBATION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Statut & approbation</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="approval_status" className={LABEL}>
              Statut d&apos;approbation
            </label>
            <select
              id="approval_status"
              name="approval_status"
              disabled={isPending}
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value as ProductApprovalStatus)}
              className={INPUT}
            >
              <option value="draft">Brouillon</option>
              <option value="pending_review">En révision</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>

          <div>
            <p className={LABEL}>Visibilité catalogue</p>
            {approvalStatus === 'approved' ? (
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={product?.active ?? false}
                  disabled={isPending}
                  className="w-4 h-4 accent-gray-900"
                />
                <span className="text-sm text-gray-700">Produit actif (visible)</span>
              </label>
            ) : (
              <div className="mt-1.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                Le produit doit être <strong>approuvé</strong> avant d&apos;être
                activé dans le catalogue.
              </div>
            )}
          </div>
        </div>

        {/* Approval audit info (read-only) */}
        {product?.approved_by && (
          <div className="flex items-center gap-3 text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
            <span>
              Approuvé le&nbsp;
              <strong className="text-gray-600">
                {new Date(product.approved_at!).toLocaleDateString('fr-MA', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              Par&nbsp;<span className="font-mono">{product.approved_by.slice(0, 8)}…</span>
            </span>
          </div>
        )}
      </section>

      {/* ── Submit ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-100">
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
