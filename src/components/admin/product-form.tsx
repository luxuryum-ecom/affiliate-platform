'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { upsertProduct, type ProductFormState } from '@/app/actions/products'
import { formatMAD } from '@/lib/utils'
import type { Product, WholesaleTier, ProductApprovalStatus, MediaItem } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TierRow {
  min_qty: string
  max_qty: string
  price_per_unit: string
}

interface MediaRow {
  url: string
  type: MediaItem['type']
}

// ─── Converters ───────────────────────────────────────────────────────────────

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

function CalcRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

const MEDIA_TYPE_LABELS: Record<MediaItem['type'], string> = {
  image:          '🖼 Image',
  video:          '🎬 Vidéo',
  telegram_link:  '📲 Telegram',
  external_link:  '🔗 Lien externe',
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product
}

const initialState: ProductFormState = { error: null }

export function ProductForm({ product }: ProductFormProps) {
  const [state, action, isPending] = useActionState(upsertProduct, initialState)

  // ── Availability state ────────────────────────────────────────────────────
  const [availabilityType, setAvailabilityType] = useState<string>(
    product?.availability_type ?? 'local_stock'
  )
  const [originDetail, setOriginDetail] = useState<string>(
    product?.origin_detail ?? 'locally_produced'
  )
  const [affiliateEnabled, setAffiliateEnabled] = useState<boolean>(
    product?.affiliate_enabled ?? true
  )

  // ── Cost/margin state (for live preview + auto-tier) ──────────────────────
  const [purchasePrice, setPurchasePrice] = useState<string>(
    product?.purchase_price != null ? String(product.purchase_price) : ''
  )
  const [purchaseCurrency, setPurchaseCurrency] = useState<string>(
    product?.purchase_currency ?? 'MAD'
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

  // ── Tier / media state ────────────────────────────────────────────────────
  const [tiers, setTiers] = useState<TierRow[]>(
    product?.wholesale_tiers?.map(tierToRow) ?? []
  )
  const [mediaItems, setMediaItems] = useState<MediaRow[]>(() => {
    if (product?.media?.length) return product.media
    if (product?.images?.length) return product.images.map((url) => ({ url, type: 'image' as const }))
    return [{ url: '', type: 'image' as const }]
  })

  // ── Live pricing calculation ──────────────────────────────────────────────
  const pp = parseFloat(purchasePrice)
  const er = parseFloat(exchangeRate) || 1
  const mg = parseFloat(margin) || 0

  const needsConversion =
    originDetail === 'imported_but_in_morocco_stock' ||
    availabilityType === 'import_on_demand'

  const purchasePriceMad =
    !isNaN(pp) && pp > 0
      ? needsConversion
        ? parseFloat((pp * er).toFixed(2))
        : pp
      : null

  const suggestedSellPrice =
    purchasePriceMad !== null
      ? parseFloat((purchasePriceMad * (1 + mg / 100)).toFixed(2))
      : null

  // ── Tier helpers ──────────────────────────────────────────────────────────
  const addTier = () =>
    setTiers((prev) => [...prev, { min_qty: '', max_qty: '', price_per_unit: '' }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))
  const updateTier = (i: number, key: keyof TierRow, val: string) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: val } : t)))

  // Auto-generate standard tiers from cost price (10+/50+/100+/500+ pieces)
  const autoGenerateTiers = () => {
    if (!purchasePriceMad) return
    setTiers([
      { min_qty: '10',  max_qty: '49',  price_per_unit: String(Math.round(purchasePriceMad * 1.30)) },
      { min_qty: '50',  max_qty: '99',  price_per_unit: String(Math.round(purchasePriceMad * 1.25)) },
      { min_qty: '100', max_qty: '499', price_per_unit: String(Math.round(purchasePriceMad * 1.20)) },
      { min_qty: '500', max_qty: '',    price_per_unit: String(Math.round(purchasePriceMad * 1.15)) },
    ])
  }

  // ── Media helpers ─────────────────────────────────────────────────────────
  const addMedia = () => setMediaItems((prev) => [...prev, { url: '', type: 'image' }])
  const removeMedia = (i: number) => setMediaItems((prev) => prev.filter((_, idx) => idx !== i))
  const updateMediaUrl = (i: number, url: string) =>
    setMediaItems((prev) => prev.map((m, idx) => (idx === i ? { ...m, url } : m)))
  const updateMediaType = (i: number, type: MediaItem['type']) =>
    setMediaItems((prev) => prev.map((m, idx) => (idx === i ? { ...m, type } : m)))

  // ── Serialised hidden values ──────────────────────────────────────────────
  const validTiers = tiers.map(rowToTier).filter((t): t is WholesaleTier => t !== null)
  const validMedia = mediaItems.filter((m) => m.url.trim().length > 0)

  // Handle availability change: reset affiliate_enabled when import_on_demand
  const handleAvailabilityChange = (val: string) => {
    setAvailabilityType(val)
    if (val === 'import_on_demand') setAffiliateEnabled(false)
  }

  return (
    <form action={action} className="space-y-8">
      {/* Hidden serialised state */}
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="wholesale_tiers" value={JSON.stringify(validTiers)} />
      <input type="hidden" name="media" value={JSON.stringify(validMedia)} />
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
            id="name" name="name" type="text" required disabled={isPending}
            defaultValue={product?.name}
            className={INPUT}
            placeholder="Ex : Crème hydratante Argan"
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>Description</label>
          <textarea
            id="description" name="description" rows={3} disabled={isPending}
            defaultValue={product?.description ?? ''}
            className={INPUT + ' resize-none'}
            placeholder="Description courte du produit…"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. DISPONIBILITÉ COMMERCIALE
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Disponibilité commerciale</h2>

        {/* availability_type */}
        <div>
          <p className={LABEL}>
            Type de disponibilité <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {([
              {
                val: 'local_stock',
                title: 'Stock local au Maroc',
                desc: 'Disponible en stock. Peut être vendu par affiliés et/ou grossistes.',
                color: 'border-green-300 bg-green-50',
                activeColor: 'border-green-600 bg-green-100 ring-2 ring-green-400',
              },
              {
                val: 'import_on_demand',
                title: 'Produit à importer sur demande',
                desc: 'Import B2B uniquement. Pas disponible pour les affiliés.',
                color: 'border-purple-200 bg-purple-50',
                activeColor: 'border-purple-600 bg-purple-100 ring-2 ring-purple-400',
              },
            ] as const).map(({ val, title, desc, color, activeColor }) => (
              <label
                key={val}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  availabilityType === val ? activeColor : color
                }`}
              >
                <input
                  type="radio"
                  name="availability_type"
                  value={val}
                  checked={availabilityType === val}
                  onChange={() => handleAvailabilityChange(val)}
                  disabled={isPending}
                  className="mt-0.5 w-4 h-4 accent-gray-900 shrink-0"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* origin_detail — only when local_stock */}
        {availabilityType === 'local_stock' && (
          <div>
            <label htmlFor="origin_detail" className={LABEL}>
              Origine du produit
            </label>
            <select
              id="origin_detail"
              name="origin_detail"
              disabled={isPending}
              value={originDetail}
              onChange={(e) => setOriginDetail(e.target.value)}
              className={INPUT}
            >
              <option value="locally_produced">Produit localement (Maroc)</option>
              <option value="imported_but_in_morocco_stock">Importé mais disponible au Maroc</option>
            </select>
          </div>
        )}

        {/* Channel availability toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`flex items-center justify-between px-3 py-2.5 border rounded-lg ${
            availabilityType === 'import_on_demand'
              ? 'bg-gray-50 border-gray-200 opacity-50'
              : 'bg-white border-gray-200'
          }`}>
            <div>
              <p className="text-sm font-medium text-gray-900">Disponible pour affiliés</p>
              <p className="text-xs text-gray-400">
                {availabilityType === 'import_on_demand'
                  ? 'Non disponible (import sur demande)'
                  : 'Les affiliés peuvent partager ce produit'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="affiliate_enabled"
                checked={affiliateEnabled && availabilityType !== 'import_on_demand'}
                onChange={(e) => setAffiliateEnabled(e.target.checked)}
                disabled={isPending || availabilityType === 'import_on_demand'}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600" />
            </label>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 border border-gray-200 bg-white rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Disponible pour grossistes</p>
              <p className="text-xs text-gray-400">Toujours activé</p>
            </div>
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              Oui
            </span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. SOURCING & TRAÇABILITÉ
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
            <label htmlFor="supplier_name" className={LABEL}>Nom du fournisseur</label>
            <input
              id="supplier_name" name="supplier_name" type="text" disabled={isPending}
              defaultValue={product?.supplier_name ?? ''}
              className={INPUT}
              placeholder="Ex : Fournisseur Casablanca"
            />
          </div>

          <div>
            <label htmlFor="origin_country" className={LABEL}>Pays d&apos;origine</label>
            <input
              id="origin_country" name="origin_country" type="text" disabled={isPending}
              defaultValue={product?.origin_country ?? ''}
              className={INPUT}
              placeholder="Ex : Maroc, Chine, Turquie, EAU…"
            />
          </div>
        </div>

        <div>
          <label htmlFor="source_notes" className={LABEL}>Notes de sourcing</label>
          <textarea
            id="source_notes" name="source_notes" rows={2} disabled={isPending}
            defaultValue={product?.source_notes ?? ''}
            className={INPUT + ' resize-none'}
            placeholder="Informations sur le fournisseur, conditions, délais…"
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-xs text-gray-500">
          <span>Canal :</span>
          <span className="font-medium text-gray-700">
            {product?.submitted_via === 'telegram_future'
              ? 'Telegram (futur)'
              : product?.submitted_via === 'supplier_future'
              ? 'Fournisseur (futur)'
              : 'Dashboard admin'}
          </span>
          {product?.submitted_by && (
            <span className="ml-auto font-mono text-gray-400">
              {product.submitted_by.slice(0, 8)}…
            </span>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. COÛT D'ACHAT & MARGE
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Coût d&apos;achat & marge</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purchase_price" className={LABEL}>Prix d&apos;achat / coût</label>
            <input
              id="purchase_price" name="purchase_price" type="number"
              step="0.01" min="0" disabled={isPending}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className={INPUT}
              placeholder="0.00"
            />
          </div>

          <div>
            <label htmlFor="purchase_currency" className={LABEL}>Devise</label>
            <select
              id="purchase_currency" name="purchase_currency" disabled={isPending}
              value={purchaseCurrency}
              onChange={(e) => setPurchaseCurrency(e.target.value)}
              className={INPUT}
            >
              <option value="MAD">MAD — Dirham marocain</option>
              <option value="USD">USD — Dollar américain</option>
              <option value="AED">AED — Dirham des Émirats</option>
            </select>
          </div>

          {/* Exchange rate — only relevant for imported/demand products */}
          <div className={!needsConversion ? 'opacity-40' : ''}>
            <label htmlFor="exchange_rate_to_mad" className={LABEL}>
              Taux de change → MAD
            </label>
            <input
              id="exchange_rate_to_mad" name="exchange_rate_to_mad"
              type="number" step="0.0001" min="0.0001"
              disabled={isPending || !needsConversion}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className={INPUT}
              placeholder="1.00"
            />
            {!needsConversion && (
              <p className="text-xs text-gray-400 mt-1">Non applicable (production locale MAD)</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="margin_percentage" className={LABEL}>Marge cible (%)</label>
            <input
              id="margin_percentage" name="margin_percentage"
              type="number" step="0.5" min="0" max="1000"
              disabled={isPending}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className={INPUT}
              placeholder="30"
            />
          </div>

          {purchasePriceMad !== null && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Calcul automatique
              </p>
              <CalcRow label="Coût en MAD" value={formatMAD(purchasePriceMad)} />
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
          5. PRIX DE VENTE & COMMISSIONS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Prix de vente & commissions</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sell_price" className={LABEL}>
              Prix de base plateforme (MAD) <span className="text-red-500">*</span>
            </label>
            <input
              id="sell_price" name="sell_price" type="number"
              step="0.01" min="0.01" required disabled={isPending}
              defaultValue={product?.sell_price ?? suggestedSellPrice ?? undefined}
              className={INPUT}
              placeholder={suggestedSellPrice ? String(suggestedSellPrice) : '0.00'}
            />
            <p className="text-xs text-gray-400 mt-1">
              Prix affiché aux affiliés / prix de référence plateforme.
              {suggestedSellPrice && (
                <> Suggéré&nbsp;: <strong>{formatMAD(suggestedSellPrice)}</strong></>
              )}
            </p>
          </div>

          <div className={!affiliateEnabled ? 'opacity-40' : ''}>
            <label htmlFor="commission_amount" className={LABEL}>
              Commission affilié (MAD)
            </label>
            <input
              id="commission_amount" name="commission_amount"
              type="number" step="0.01" min="0"
              disabled={isPending || !affiliateEnabled}
              defaultValue={product?.commission_amount ?? 0}
              className={INPUT}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-400 mt-1">
              {affiliateEnabled
                ? 'Montant versé à l\'affilié à chaque livraison confirmée.'
                : 'Non applicable (affiliés désactivés pour ce produit).'}
            </p>
          </div>
        </div>

        {/* Operational fees */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="confirmation_fee_mad" className={LABEL}>
              Frais de confirmation / commande (MAD)
            </label>
            <input
              id="confirmation_fee_mad" name="confirmation_fee_mad"
              type="number" step="0.01" min="0" disabled={isPending}
              defaultValue={product?.confirmation_fee_mad ?? 10}
              className={INPUT}
            />
            <p className="text-xs text-gray-400 mt-1">Coût opérationnel fixe par commande confirmée.</p>
          </div>

          <div>
            <label htmlFor="packaging_fee_mad" className={LABEL}>
              Frais d&apos;emballage (MAD)
            </label>
            <input
              id="packaging_fee_mad" name="packaging_fee_mad"
              type="number" step="0.01" min="0" disabled={isPending}
              defaultValue={product?.packaging_fee_mad ?? 10}
              className={INPUT}
            />
            <p className="text-xs text-gray-400 mt-1">Coût emballage fixe par commande confirmée.</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          6. STOCK & QUANTITÉS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Stock & quantités disponibles</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stock_count" className={LABEL}>Quantité disponible (stock)</label>
            <input
              id="stock_count" name="stock_count" type="number"
              min="0" disabled={isPending}
              defaultValue={product?.stock_count ?? 0}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="wholesale_min_qty" className={LABEL}>
              Commande min. grossiste (unités)
            </label>
            <input
              id="wholesale_min_qty" name="wholesale_min_qty" type="number"
              min="1" disabled={isPending}
              defaultValue={product?.wholesale_min_qty ?? (availabilityType === 'import_on_demand' ? 10 : 1)}
              className={INPUT}
            />
            <p className="text-xs text-gray-400 mt-1">
              {availabilityType === 'import_on_demand'
                ? 'Import sur demande — minimum recommandé : 10 pièces.'
                : 'Quantité minimale pour une commande grossiste.'}
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          7. PALIERS DE PRIX GROS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={SECTION_TITLE}>Paliers de prix gros</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Prix arrondis au MAD entier. Paliers standards : 10 / 50 / 100 / 500 pièces.
            </p>
          </div>
          <div className="flex gap-2">
            {purchasePriceMad !== null && (
              <button
                type="button"
                onClick={autoGenerateTiers}
                className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
                title="Génère 4 paliers standards à partir du coût MAD"
              >
                ✦ Auto (coût + marges)
              </button>
            )}
            <button
              type="button"
              onClick={addTier}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              + Palier
            </button>
          </div>
        </div>

        {tiers.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 bg-gray-50 rounded-lg text-center">
            Aucun palier.
            {purchasePriceMad
              ? ' Cliquez « ✦ Auto » pour générer les 4 paliers standards.'
              : ' Entrez un coût d\'achat pour activer la génération automatique.'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1">
              {['Qté min', 'Qté max (vide = ∞)', 'Prix / u (MAD entier)', ''].map((h) => (
                <span key={h} className="text-xs font-medium text-gray-500">{h}</span>
              ))}
            </div>
            {tiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="number" min="1" placeholder="10"
                  value={tier.min_qty}
                  onChange={(e) => updateTier(i, 'min_qty', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Quantité minimum"
                />
                <input
                  type="number" min="1" placeholder="∞"
                  value={tier.max_qty}
                  onChange={(e) => updateTier(i, 'max_qty', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Quantité maximum"
                />
                <input
                  type="number" min="1" step="1" placeholder="120"
                  value={tier.price_per_unit}
                  onChange={(e) => updateTier(i, 'price_per_unit', e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                  aria-label="Prix par unité (MAD)"
                />
                <button
                  type="button" onClick={() => removeTier(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  aria-label="Supprimer le palier"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Tier preview */}
        {tiers.length > 0 && purchasePriceMad !== null && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700 space-y-0.5">
            <p className="font-semibold mb-1">Aperçu des marges grossiste :</p>
            {tiers.map((t, i) => {
              const price = parseFloat(t.price_per_unit)
              const marginPct = purchasePriceMad > 0 && !isNaN(price)
                ? (((price - purchasePriceMad) / purchasePriceMad) * 100).toFixed(0)
                : '—'
              const label = t.max_qty ? `${t.min_qty}–${t.max_qty} u` : `${t.min_qty}+ u`
              return (
                <div key={i} className="flex justify-between">
                  <span>{label}</span>
                  <span>{isNaN(price) ? '—' : `${price} MAD`} · marge {marginPct}%</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          8. MÉDIAS (images, vidéos, liens Telegram)
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={SECTION_TITLE}>Médias</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Le premier média est utilisé comme miniature. Accepte images, vidéos, liens Telegram ou externes.
            </p>
          </div>
          <button
            type="button" onClick={addMedia}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Média
          </button>
        </div>

        <div className="space-y-2">
          {mediaItems.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              {/* Type selector */}
              <select
                value={item.type}
                onChange={(e) => updateMediaType(i, e.target.value as MediaItem['type'])}
                className="shrink-0 text-xs px-2 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
                aria-label="Type de média"
              >
                {(Object.entries(MEDIA_TYPE_LABELS) as [MediaItem['type'], string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>

              {/* URL input */}
              <input
                type="text"
                value={item.url}
                onChange={(e) => updateMediaUrl(i, e.target.value)}
                placeholder={
                  item.type === 'telegram_link'
                    ? 'https://t.me/... ou lien Telegram direct'
                    : 'https://…'
                }
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 min-w-0"
                aria-label={`URL média ${i + 1}`}
              />

              {/* Thumbnail preview */}
              {item.type === 'image' && item.url.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}

              {mediaItems.length > 1 && (
                <button
                  type="button" onClick={() => removeMedia(i)}
                  className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                  aria-label="Supprimer le média"
                >×</button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          9. STATUT & APPROBATION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>Statut & approbation</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="approval_status" className={LABEL}>
              Statut d&apos;approbation
            </label>
            <select
              id="approval_status" name="approval_status" disabled={isPending}
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
                  type="checkbox" name="active"
                  defaultChecked={product?.active ?? false}
                  disabled={isPending}
                  className="w-4 h-4 accent-gray-900"
                />
                <span className="text-sm text-gray-700">Produit actif (visible)</span>
              </label>
            ) : (
              <div className="mt-1.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                Le produit doit être <strong>approuvé</strong> avant d&apos;être activé.
              </div>
            )}
          </div>
        </div>

        {product?.approved_by && (
          <div className="flex items-center gap-3 text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
            <span>
              Approuvé le&nbsp;
              <strong className="text-gray-600">
                {new Date(product.approved_at!).toLocaleDateString('fr-MA', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </strong>
            </span>
            <span className="text-gray-300">·</span>
            <span>Par&nbsp;<span className="font-mono">{product.approved_by.slice(0, 8)}…</span></span>
          </div>
        )}
      </section>

      {/* ── Submit ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-100">
        <button
          type="submit" disabled={isPending}
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
