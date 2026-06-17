'use client'

import { useActionState, useState, useRef } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { upsertProduct, type ProductFormState } from '@/app/actions/products'
import { ProductCoverUpload } from '@/components/admin/product-cover-upload'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { uploadProductImage, formatProductImageUploadError } from '@/lib/product-image-upload'
import { isValidMediaUrl } from '@/lib/product-media'
import { formatMAD, calculatePlatformPrice, calculateNetAffiliateCommission } from '@/lib/utils'
import { parseMoneyInput } from '@/lib/money'
import { parseRateInput, parsePercentInput } from '@/lib/rate'
import type { Product, WholesaleTier, ProductApprovalStatus, MediaItem, ImportTariff, TariffMode, ImportShippingMode, PlatformMarginType } from '@/types/database'
import { SHIPPING_MODE_LABELS, unitFromShippingMode } from '@/lib/tariff-utils'
import { PRODUCT_CATEGORIES, getSubcategories } from '@/lib/taxonomy'

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
  'w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent disabled:bg-surface-2 disabled:text-faint'

const LABEL = 'block text-xs font-medium text-muted mb-1'

const SECTION_TITLE = 'text-sm font-semibold text-foreground pb-1 border-b border-line'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs text-muted leading-relaxed">
      {children}
    </div>
  )
}

function CalcRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${highlight ? 'text-success-fg' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ProductFormProps {
  product?: Product
  tariffs?: ImportTariff[]
  /** Taux centraux courants par devise (rate_vs_mad), ex. { MAD:1, USD:10, ... }. */
  rates?: Record<string, number>
}

const initialState: ProductFormState = { error: null }

export function ProductForm({ product, tariffs = [], rates = {} }: ProductFormProps) {
  const t = useTranslations('admin.productForm')
  const tc = useTranslations('admin.common')
  const locale = useLocale()

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

  // ── Taxonomy (migration 039) ────────────────────────────────────────────────
  const [productCategory, setProductCategory] = useState<string>(product?.category ?? '')
  const [productSubcategory, setProductSubcategory] = useState<string>(product?.subcategory ?? '')
  const subcategoryOptions = getSubcategories(productCategory)

  // ── Import-on-demand fields (migrations 019 + 020 + 022) ────────────────
  const [importOriginCountry, setImportOriginCountry] = useState<string>(
    product?.origin_country ?? ''
  )

  // Shipping mode (migration 022) — replaces importPricingMode
  const [importShippingMode, setImportShippingMode] = useState<ImportShippingMode>(
    product?.import_shipping_mode ??
    (product?.import_pricing_mode === 'sea_freight_cbm_or_kg' && product?.import_price_unit === 'cbm'
      ? 'sea_volume_cbm'
      : product?.import_pricing_mode === 'sea_freight_cbm_or_kg'
      ? 'sea_textile_kg'
      : 'air_door_to_door_kg')
  )

  const [estimatedImportPriceMad, setEstimatedImportPriceMad] = useState<string>(
    product?.estimated_import_price_mad != null
      ? String(product.estimated_import_price_mad)
      : product?.estimated_cost_mad != null
      ? String(product.estimated_cost_mad)
      : ''
  )
  const [estimatedDeliveryDays, setEstimatedDeliveryDays] = useState<string>(
    product?.estimated_delivery_days != null ? String(product.estimated_delivery_days) : ''
  )
  const [importNotes, setImportNotes] = useState<string>(product?.import_notes ?? '')

  // ── Tariff mode (migration 021) ───────────────────────────────────────────
  const [tariffMode, setTariffMode] = useState<TariffMode>(
    product?.tariff_mode ?? 'global'
  )

  // ── Cost/margin state (for live preview + auto-tier) ──────────────────────
  const [purchasePrice, setPurchasePrice] = useState<string>(
    product?.purchase_price != null ? String(product.purchase_price) : ''
  )
  const [purchaseCurrency, setPurchaseCurrency] = useState<string>(
    product?.purchase_currency ?? 'MAD'
  )
  // Taux central par défaut d'une devise (réconciliation Étape 2). MAD ⇒ 1.
  const centralRateFor = (code: string): number => (code === 'MAD' ? 1 : rates[code] ?? 1)
  const [exchangeRate, setExchangeRate] = useState<string>(
    // Produit existant : on garde le taux enregistré (override). Nouveau : taux central.
    String(product?.exchange_rate_to_mad ?? centralRateFor(product?.purchase_currency ?? 'MAD'))
  )
  // À la bascule de devise, pré-remplir le taux central (l'admin peut surcharger ensuite).
  const handleCurrencyChange = (code: string) => {
    setPurchaseCurrency(code)
    setExchangeRate(String(centralRateFor(code)))
  }
  const [margin, setMargin] = useState<string>(
    String(product?.margin_percentage ?? 20)
  )

  // ── Platform margin type & value (migration 013) ──────────────────────────
  const [platformMarginType, setPlatformMarginType] = useState<string>(
    product?.platform_margin_type ?? 'percentage'
  )
  const [platformMarginValue, setPlatformMarginValue] = useState<string>(
    product?.platform_margin_value != null ? String(product.platform_margin_value) : '20'
  )

  // ── Factory cost (migration 016) ───────────────────────────────────────────
  const [factoryCostMad, setFactoryCostMad] = useState<string>(
    product?.factory_cost_mad != null
      ? String(product.factory_cost_mad)
      : product?.purchase_price_mad != null
      ? String(product.purchase_price_mad)
      : ''
  )

  // ── Sell price + operational fees (for commission preview) ────────────────
  const [sellPrice, setSellPrice] = useState<string>(
    product?.sell_price != null ? String(product.sell_price) : ''
  )
  const [confirmationFee, setConfirmationFee] = useState<string>(
    String(product?.confirmation_fee_mad ?? 10)
  )
  const [packagingFee, setPackagingFee] = useState<string>(
    String(product?.packaging_fee_mad ?? 10)
  )
  const [deliveryFee, setDeliveryFee] = useState<string>(
    String(product?.delivery_fee_mad ?? 0)
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

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Live pricing calculation ──────────────────────────────────────────────
  // Preview client = MIROIR EXACT du serveur : mêmes helpers (calculatePlatformPrice,
  // calculateNetAffiliateCommission) + même arrondi half-up. Zéro parseFloat : les
  // saisies live sont validées (money/rate/percent) → NaN tant qu'incomplètes.
  const numMoney = (s: string): number => {
    const r = parseMoneyInput(s)
    return r.ok ? Number(r.value) : NaN
  }
  const numRate = (s: string): number => {
    const r = parseRateInput(s)
    return r.ok ? Number(r.value) : 1
  }
  const numPct = (s: string): number => {
    const r = parsePercentInput(s)
    return r.ok ? Number(r.value) : 0
  }

  const pp = numMoney(purchasePrice)
  const er = numRate(exchangeRate)
  const mg = numPct(margin)

  const needsConversion =
    originDetail === 'imported_but_in_morocco_stock' ||
    availabilityType === 'import_on_demand'

  const purchasePriceMad =
    !isNaN(pp) && pp > 0
      ? needsConversion
        ? Math.round(pp * er * 100) / 100 // half-up, miroir serveur
        : pp
      : null

  const suggestedSellPrice =
    purchasePriceMad !== null ? Math.round(purchasePriceMad * (1 + mg / 100)) : null

  // ── Platform cost & commission preview ────────────────────────────────────
  const fCost = numMoney(factoryCostMad)
  const pmType = platformMarginType as PlatformMarginType
  const pmValue = pmType === 'percentage' ? numPct(platformMarginValue) : numMoney(platformMarginValue)
  const spVal = numMoney(sellPrice)
  // NB : le serveur calcule la commission STOCKÉE avec le plancher logistique
  // (previewDeliveryFee), pas delivery_fee_mad du produit. Le preview affiche ici
  // la livraison saisie — divergence d'affichage connue, à câbler via une prop (hors money).
  const confFeeVal = numMoney(confirmationFee)
  const packFeeVal = numMoney(packagingFee)
  const delivFeeVal = numMoney(deliveryFee)

  // calculatePlatformPrice = coût plateforme (factory + marge), arrondi MAD entier (serveur).
  const platformCostMad =
    !isNaN(fCost) && fCost > 0 ? calculatePlatformPrice(fCost, pmType, pmValue) : null

  const platformMarginMad =
    platformCostMad !== null ? platformCostMad - fCost : null

  const estimatedCommission =
    affiliateEnabled &&
    !isNaN(fCost) && fCost > 0 &&
    !isNaN(spVal) && spVal > 0
      ? Math.max(
          0,
          calculateNetAffiliateCommission({
            affiliateSellPrice: spVal,
            factoryCostMad: fCost,
            marginType: pmType,
            marginValue: pmValue,
            packagingFee: isNaN(packFeeVal) ? 0 : packFeeVal,
            deliveryFee: isNaN(delivFeeVal) ? 0 : delivFeeVal,
            confirmationFee: isNaN(confFeeVal) ? 0 : confFeeVal,
            quantity: 1,
          }),
        )
      : null

  // ── Tier helpers ──────────────────────────────────────────────────────────
  const addTier = () =>
    setTiers((prev) => [...prev, { min_qty: '', max_qty: '', price_per_unit: '' }])
  const removeTier = (i: number) => setTiers((prev) => prev.filter((_, idx) => idx !== i))
  const updateTier = (i: number, key: keyof TierRow, val: string) =>
    setTiers((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)))

  // Auto-generate standard tiers from factory cost (10+/50+/100+/500+ pieces)
  const autoGenerateTiers = () => {
    const base = !isNaN(fCost) && fCost > 0 ? fCost : purchasePriceMad
    if (!base) return
    setTiers([
      { min_qty: '10',  max_qty: '49',  price_per_unit: String(Math.round(base * 1.30)) },
      { min_qty: '50',  max_qty: '99',  price_per_unit: String(Math.round(base * 1.25)) },
      { min_qty: '100', max_qty: '499', price_per_unit: String(Math.round(base * 1.20)) },
      { min_qty: '500', max_qty: '',    price_per_unit: String(Math.round(base * 1.15)) },
    ])
  }

  // ── Media helpers ─────────────────────────────────────────────────────────
  const addMedia = () => setMediaItems((prev) => [...prev, { url: '', type: 'image' }])
  const removeMedia = (i: number) => setMediaItems((prev) => prev.filter((_, idx) => idx !== i))
  const updateMediaUrl = (i: number, url: string) =>
    setMediaItems((prev) => prev.map((m, idx) => (idx === i ? { ...m, url } : m)))
  const updateMediaType = (i: number, type: MediaItem['type']) =>
    setMediaItems((prev) => prev.map((m, idx) => (idx === i ? { ...m, type } : m)))

  // ── Image upload ─────────────────────────────────────────────────────────
  const handleFileUpload = async (index: number, file: File) => {
    setUploadingIndex(index)
    setUploadError(null)

    try {
      const url = await uploadProductImage(file)
      updateMediaUrl(index, url)
      updateMediaType(index, 'image')
    } catch (err) {
      setUploadError(formatProductImageUploadError(err))
    } finally {
      setUploadingIndex(null)
    }
  }

  const handleCoverUploaded = (url: string) => {
    setUploadError(null)
    setMediaItems((prev) => {
      if (prev.length > 0 && prev[0].type === 'image') {
        return prev.map((m, i) => (i === 0 ? { url, type: 'image' as const } : m))
      }
      const rest = prev.filter((m, i) => i > 0 || m.url.trim())
      return [{ url, type: 'image' as const }, ...rest]
    })
  }

  const coverUrl =
    mediaItems.find((m) => m.type === 'image' && isValidMediaUrl(m.url))?.url ??
    mediaItems[0]?.url ??
    ''

  const productDisplayName = product?.name ?? tc('product')

  // ── Serialised hidden values ──────────────────────────────────────────────
  const validTiers = tiers.map(rowToTier).filter((row): row is WholesaleTier => row !== null)
  const validMedia = mediaItems.filter(
    (m) => m.url.trim().length > 0 && (m.type !== 'image' || isValidMediaUrl(m.url))
  )

  // Handle availability change: reset affiliate_enabled when import_on_demand
  const handleAvailabilityChange = (val: string) => {
    setAvailabilityType(val)
    if (val === 'import_on_demand') setAffiliateEnabled(false)
  }

  // ── Media type labels (i18n) ──────────────────────────────────────────────
  const MEDIA_TYPE_LABELS: Record<MediaItem['type'], string> = {
    image:         t('mediaTypeImage'),
    video:         t('mediaTypeVideo'),
    telegram_link: t('mediaTypeTelegram'),
    external_link: t('mediaTypeExternalLink'),
  }

  return (
    <form action={action} className="space-y-8">
      {/* Hidden serialised state */}
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="wholesale_tiers" value={JSON.stringify(validTiers)} />
      <input type="hidden" name="media" value={JSON.stringify(validMedia)} />
      <input type="hidden" name="submitted_via" value="admin_dashboard" />
      <input type="hidden" name="tariff_mode" value={availabilityType === 'import_on_demand' ? tariffMode : 'global'} />
      <input type="hidden" name="import_shipping_mode" value={availabilityType === 'import_on_demand' ? importShippingMode : ''} />

      {/* Error banner */}
      {state?.error && (
        <div className="bg-danger-soft border border-danger text-danger-fg text-sm px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. INFORMATIONS GÉNÉRALES
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section1')}</h2>

        <div>
          <label htmlFor="name" className={LABEL}>
            {t('productName')} <span className="text-danger-fg">*</span>
          </label>
          <input
            id="name" name="name" type="text" required disabled={isPending}
            defaultValue={product?.name}
            className={INPUT}
            placeholder={t('productNamePlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className={LABEL}>{t('category')}</label>
            <select
              id="category"
              name="category"
              disabled={isPending}
              value={productCategory}
              onChange={(e) => {
                const newCat = e.target.value
                setProductCategory(newCat)
                // Reset subcategory only if it no longer belongs to the new category
                const newSubs = getSubcategories(newCat) as readonly string[]
                if (newSubs.length > 0 && !newSubs.includes(productSubcategory)) {
                  setProductSubcategory('')
                }
              }}
              className={INPUT}
            >
              <option value="">{t('categoryPlaceholder')}</option>
              {productCategory && !(PRODUCT_CATEGORIES as readonly string[]).includes(productCategory) && (
                <option value={productCategory}>{productCategory} ({t('legacyValue')})</option>
              )}
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subcategory" className={LABEL}>{t('subcategory')}</label>
            {subcategoryOptions.length > 0 ? (
              <select
                id="subcategory"
                name="subcategory"
                disabled={isPending}
                value={productSubcategory}
                onChange={(e) => setProductSubcategory(e.target.value)}
                className={INPUT}
              >
                <option value="">{t('subcategoryPlaceholder')}</option>
                {/* Preserve legacy value if it doesn't match any current option */}
                {productSubcategory && !(subcategoryOptions as readonly string[]).includes(productSubcategory) && (
                  <option value={productSubcategory}>{productSubcategory} ({t('legacyValue')})</option>
                )}
                {subcategoryOptions.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            ) : (
              <input
                id="subcategory"
                name="subcategory"
                type="text"
                disabled={isPending || !productCategory}
                value={productSubcategory}
                onChange={(e) => setProductSubcategory(e.target.value)}
                className={INPUT}
                placeholder={productCategory ? t('subcategoryPlaceholder') : t('subcategoryParentPlaceholder')}
              />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>{t('description')}</label>
          <textarea
            id="description" name="description" rows={3} disabled={isPending}
            defaultValue={product?.description ?? ''}
            className={INPUT + ' resize-none'}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. DISPONIBILITÉ COMMERCIALE
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section2')}</h2>

        {/* availability_type */}
        <div>
          <p className={LABEL}>
            {t('availabilityType')} <span className="text-danger-fg">*</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {([
              {
                val: 'local_stock',
                title: t('availLocalTitle'),
                desc: t('availLocalDesc'),
                color: 'border-line bg-surface',
                activeColor: 'border-success bg-success-soft ring-2 ring-success',
              },
              {
                val: 'import_on_demand',
                title: t('availImportTitle'),
                desc: t('availImportDesc'),
                color: 'border-line bg-surface',
                activeColor: 'border-primary bg-accent-soft ring-2 ring-gold-400',
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
                  className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* origin_detail — only when local_stock */}
        {availabilityType === 'local_stock' && (
          <div>
            <label htmlFor="origin_detail" className={LABEL}>
              {t('originDetail')}
            </label>
            <select
              id="origin_detail"
              name="origin_detail"
              disabled={isPending}
              value={originDetail}
              onChange={(e) => setOriginDetail(e.target.value)}
              className={INPUT}
            >
              <option value="locally_produced">{t('originLocallyProduced')}</option>
              <option value="imported_but_in_morocco_stock">{t('originImportedStock')}</option>
            </select>
          </div>
        )}

        {/* import_on_demand display fields — only shown when relevant */}
        {availabilityType === 'import_on_demand' && (
          <div className="space-y-4 p-4 rounded-xl border border-line bg-surface-2">
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                {t('importSectionTitle')}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {t('importSectionDesc')}
              </p>
            </div>

            {/* Tariff mode selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    val: 'global' as TariffMode,
                    title: t('tariffGlobalTitle'),
                    desc: t('tariffGlobalDesc'),
                  },
                  {
                    val: 'custom' as TariffMode,
                    title: t('tariffCustomTitle'),
                    desc: t('tariffCustomDesc'),
                  },
                ] as const
              ).map(({ val, title, desc }) => (
                <label
                  key={val}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    tariffMode === val
                      ? 'border-primary bg-accent-soft ring-2 ring-gold-400'
                      : 'border-line bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="_tariff_mode_ui"
                    value={val}
                    checked={tariffMode === val}
                    onChange={() => setTariffMode(val)}
                    disabled={isPending}
                    className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Global tariff preview */}
            {tariffMode === 'global' && (() => {
              const matchingTariff = tariffs.find(
                (row) =>
                  row.country === importOriginCountry &&
                  row.shipping_mode === importShippingMode &&
                  row.active
              )
              const needsCountry = !importOriginCountry
              return (
                <div className="rounded-lg border border-line bg-surface px-4 py-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
                    {t('globalTariffTitle')}
                  </p>
                  {needsCountry ? (
                    <p className="text-xs text-faint italic">
                      {t('tariffSelectHint')}
                    </p>
                  ) : matchingTariff ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">{t('tariffMode')}</span>
                        <span className="font-medium text-foreground">
                          {SHIPPING_MODE_LABELS[matchingTariff.shipping_mode]}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">{t('tariffTransportFees')}</span>
                        <span className="font-medium text-foreground">
                          {Number(matchingTariff.transport_customs_price_mad).toFixed(2)} MAD&nbsp;
                          <span className="text-faint font-normal text-xs">
                            / {matchingTariff.unit === 'cbm' ? t('shippingUnitCBM') : t('shippingUnitKG')}
                          </span>
                        </span>
                      </div>
                      {matchingTariff.delivery_days != null && (
                        <div className="flex justify-between">
                          <span className="text-muted">{t('tariffDeliveryDays')}</span>
                          <span className="font-medium text-foreground">
                            {t('deliveryDaysCount', { count: matchingTariff.delivery_days })}
                          </span>
                        </div>
                      )}
                      {matchingTariff.notes && (
                        <p className="text-xs text-muted pt-1 border-t border-line mt-1">
                          {matchingTariff.notes}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-warning-fg">
                      {t('tariffNoActive', { country: importOriginCountry, mode: SHIPPING_MODE_LABELS[importShippingMode] })}{' '}
                      <Link
                        href="/admin/import-tariffs"
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-500 hover:text-gold-600 underline"
                      >
                        {t('tariffConfigure')}
                      </Link>
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Row: Origin country + Shipping mode — always visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="import_origin_country" className={LABEL}>
                  {t('originCountry')} <span className="text-danger-fg">*</span>
                </label>
                <select
                  id="import_origin_country"
                  name="origin_country"
                  disabled={isPending}
                  value={importOriginCountry}
                  onChange={(e) => setImportOriginCountry(e.target.value)}
                  className={INPUT}
                >
                  <option value="">{t('originCountrySelect')}</option>
                  <option value="Turquie">{t('countryTurkey')}</option>
                  <option value="Chine">{t('countryChina')}</option>
                  <option value="Égypte">{t('countryEgypt')}</option>
                  <option value="Dubai">{t('countryDubai')}</option>
                  <option value="Autre">{t('countryOther')}</option>
                  <option value="Mixte">{t('countryMixed')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="import_shipping_mode_ui" className={LABEL}>
                  {t('shippingMode')}
                </label>
                <select
                  id="import_shipping_mode_ui"
                  disabled={isPending}
                  value={importShippingMode}
                  onChange={(e) => setImportShippingMode(e.target.value as ImportShippingMode)}
                  className={INPUT}
                >
                  {(Object.entries(SHIPPING_MODE_LABELS) as [ImportShippingMode, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <p className="text-xs text-faint mt-1">
                  {t('shippingUnitAuto')}{' '}
                  <strong>{unitFromShippingMode(importShippingMode) === 'cbm' ? t('shippingUnitCBM') : t('shippingUnitKG')}</strong>
                </p>
              </div>
            </div>

            {/* Custom tariff fields — only shown when tariffMode = 'custom' */}
            {tariffMode === 'custom' && (
              <>
                <div className="bg-warning-soft border border-warning rounded-lg px-3 py-2 text-xs text-warning-fg">
                  {t('customTariffWarning')}
                </div>

                {/* Price + delivery days */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="estimated_import_price_mad" className={LABEL}>
                      {t('importTransportFees', { unit: unitFromShippingMode(importShippingMode) === 'cbm' ? t('shippingUnitCBM') : t('shippingUnitKG') })}
                    </label>
                    <input
                      id="estimated_import_price_mad"
                      name="estimated_import_price_mad"
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={isPending}
                      value={estimatedImportPriceMad}
                      onChange={(e) => setEstimatedImportPriceMad(e.target.value)}
                      className={INPUT}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-faint mt-1">
                      {t('importUnitAuto')}{' '}
                      <strong>{unitFromShippingMode(importShippingMode) === 'cbm' ? t('shippingUnitCBM') : t('shippingUnitKG')}</strong>
                    </p>
                  </div>

                  <div>
                    <label htmlFor="estimated_delivery_days" className={LABEL}>
                      {t('deliveryDays')}
                    </label>
                    <input
                      id="estimated_delivery_days"
                      name="estimated_delivery_days"
                      type="number"
                      step="1"
                      min="1"
                      disabled={isPending}
                      value={estimatedDeliveryDays}
                      onChange={(e) => setEstimatedDeliveryDays(e.target.value)}
                      className={INPUT}
                      placeholder={t('deliveryDaysPlaceholder')}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="import_notes" className={LABEL}>
                    {t('importNotes')}
                    {importOriginCountry === 'Mixte' && (
                      <span className="ml-1.5 text-warning-fg font-semibold">{t('importNotesMixed')}</span>
                    )}
                  </label>
                  <textarea
                    id="import_notes"
                    name="import_notes"
                    rows={2}
                    disabled={isPending}
                    value={importNotes}
                    onChange={(e) => setImportNotes(e.target.value)}
                    className={`${INPUT} resize-none ${importOriginCountry === 'Mixte' ? 'border-warning ring-1 ring-warning' : ''}`}
                    placeholder={t('importNotesPlaceholder')}
                  />
                  {importOriginCountry === 'Mixte' && (
                    <p className="text-xs text-warning-fg mt-1">
                      {t('importNotesMixedWarn')}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Channel availability toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`flex items-center justify-between px-3 py-2.5 border rounded-lg ${
            availabilityType === 'import_on_demand'
              ? 'bg-surface-2 border-line opacity-50'
              : 'bg-surface border-line'
          }`}>
            <div>
              <p className="text-sm font-medium text-foreground">{t('affiliateChannel')}</p>
              <p className="text-xs text-faint">
                {availabilityType === 'import_on_demand'
                  ? t('affiliateChannelDisabled')
                  : t('affiliateChannelDesc')}
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
              <div className="w-9 h-5 bg-surface-2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-line after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-success" />
            </label>
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 border border-line bg-surface rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">{t('wholesaleChannel')}</p>
              <p className="text-xs text-faint">{t('wholesaleChannelAlways')}</p>
            </div>
            <span className="text-xs font-medium text-success-fg bg-success-soft px-2 py-0.5 rounded-full">
              {t('wholesaleChannelYes')}
            </span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. SOURCING & TRAÇABILITÉ
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section3')}</h2>

        <InfoBox>
          {t('sourcingInfo')}
        </InfoBox>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="supplier_name" className={LABEL}>{t('supplierName')}</label>
            <input
              id="supplier_name" name="supplier_name" type="text" disabled={isPending}
              defaultValue={product?.supplier_name ?? ''}
              className={INPUT}
              placeholder={t('supplierNamePlaceholder')}
            />
          </div>

          {/* origin_country shown here for local_stock; for import_on_demand it is in the availability section */}
          {availabilityType === 'local_stock' && (
            <div>
              <label htmlFor="origin_country" className={LABEL}>{t('originCountryLocal')}</label>
              <input
                id="origin_country"
                name="origin_country"
                type="text"
                disabled={isPending}
                defaultValue={product?.origin_country ?? ''}
                className={INPUT}
                placeholder={t('originCountryLocalPlaceholder')}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="source_notes" className={LABEL}>{t('sourceNotes')}</label>
          <textarea
            id="source_notes" name="source_notes" rows={2} disabled={isPending}
            defaultValue={product?.source_notes ?? ''}
            className={INPUT + ' resize-none'}
            placeholder={t('sourceNotesPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border border-line rounded-lg bg-surface-2 text-xs text-muted">
          <span>{t('channel')}</span>
          <span className="font-medium text-foreground">
            {product?.submitted_via === 'telegram_future'
              ? t('channelTelegram')
              : product?.submitted_via === 'supplier_future'
              ? t('channelSupplier')
              : t('channelDashboard')}
          </span>
          {product?.submitted_by && (
            <span className="ml-auto font-mono text-faint">
              {product.submitted_by.slice(0, 8)}…
            </span>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. COÛT USINE & MARGE PLATEFORME
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section4')}</h2>

        {/* Sourcing / traceability row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purchase_price" className={LABEL}>{t('purchasePrice')}</label>
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
            <label htmlFor="purchase_currency" className={LABEL}>{t('currency')}</label>
            <select
              id="purchase_currency" name="purchase_currency" disabled={isPending}
              value={purchaseCurrency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className={INPUT}
            >
              <option value="MAD">{t('currencyMAD')}</option>
              <option value="USD">{t('currencyUSD')}</option>
              <option value="AED">{t('currencyAED')}</option>
            </select>
          </div>

          <div className={!needsConversion ? 'opacity-40' : ''}>
            <label htmlFor="exchange_rate_to_mad" className={LABEL}>
              {t('exchangeRate')}
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
              <p className="text-xs text-faint mt-1">{t('exchangeRateNA')}</p>
            )}
          </div>
        </div>

        {/* Factory cost MAD — the operative cost used for commission */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="factory_cost_mad" className={LABEL}>
              {t('factoryCostMad')} <span className="text-danger-fg">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="factory_cost_mad" name="factory_cost_mad" type="number"
                step="0.01" min="0" disabled={isPending}
                value={factoryCostMad}
                onChange={(e) => setFactoryCostMad(e.target.value)}
                className={INPUT}
                placeholder="0.00"
              />
              {purchasePriceMad !== null && (
                <button
                  type="button"
                  onClick={() => setFactoryCostMad(String(purchasePriceMad))}
                  disabled={isPending}
                  className="shrink-0 text-xs px-2.5 py-1.5 border border-line rounded-lg hover:bg-surface-2 transition-colors whitespace-nowrap"
                  title={t('autoFillTitle')}
                >
                  {t('autoFill')}
                </button>
              )}
            </div>
            <p className="text-xs text-faint mt-1">
              {t('factoryCostHint')}
              {purchasePriceMad !== null && (
                <> {t('factoryCostComputed')} <strong>{formatMAD(purchasePriceMad)}</strong></>
              )}
            </p>
          </div>

          {/* Legacy margin for auto-tier — hidden from main display but kept for backward compat */}
          <input type="hidden" name="margin_percentage" value={margin} />
        </div>

        {/* Platform margin type + value */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="platform_margin_type" className={LABEL}>
              {t('platformMarginType')}
            </label>
            <select
              id="platform_margin_type" name="platform_margin_type" disabled={isPending}
              value={platformMarginType}
              onChange={(e) => setPlatformMarginType(e.target.value)}
              className={INPUT}
            >
              <option value="percentage">{t('marginTypePercentage')}</option>
              <option value="fixed">{t('marginTypeFixed')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="platform_margin_value" className={LABEL}>
              {platformMarginType === 'percentage' ? t('marginPct') : t('marginFixedLabel')}
            </label>
            <input
              id="platform_margin_value" name="platform_margin_value"
              type="number" step="0.5" min="0"
              disabled={isPending}
              value={platformMarginValue}
              onChange={(e) => {
                setPlatformMarginValue(e.target.value)
                if (platformMarginType === 'percentage') setMargin(e.target.value)
              }}
              className={INPUT}
              placeholder={platformMarginType === 'percentage' ? '20' : '0.00'}
            />
          </div>
        </div>

        {/* Cost breakdown preview */}
        {!isNaN(fCost) && fCost > 0 && platformMarginMad !== null && (
          <div className="bg-surface-2 border border-line rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">
              {t('costBreakdown')}
            </p>
            <CalcRow label={t('costFactory')} value={formatMAD(fCost)} />
            <CalcRow
              label={t('costPlatformMargin', { type: pmType === 'percentage' ? `${pmValue}%` : t('marginFixed') })}
              value={formatMAD(platformMarginMad)}
            />
            <div className="pt-1 border-t border-line">
              <CalcRow
                label={t('costPlatformTotal')}
                value={platformCostMad !== null ? formatMAD(platformCostMad) : '—'}
                highlight
              />
            </div>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          5. PRIX DE VENTE & COMMISSIONS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section5')}</h2>

        <div>
          <label htmlFor="sell_price" className={LABEL}>
            {t('sellPrice')} <span className="text-danger-fg">*</span>
          </label>
          <input
            id="sell_price" name="sell_price" type="number"
            step="0.01" min="0.01" required disabled={isPending}
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className={INPUT}
            placeholder={suggestedSellPrice ? String(suggestedSellPrice) : '0.00'}
          />
          <p className="text-xs text-faint mt-1">
            {t('sellPriceHint')}
            {suggestedSellPrice && (
              <> {t('sellPriceSuggested')} <strong>{formatMAD(suggestedSellPrice)}</strong></>
            )}
          </p>
        </div>

        {/* Operational fees */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="confirmation_fee_mad" className={LABEL}>
              {t('confirmationFee')}
            </label>
            <input
              id="confirmation_fee_mad" name="confirmation_fee_mad"
              type="number" step="0.01" min="0" disabled={isPending}
              value={confirmationFee}
              onChange={(e) => setConfirmationFee(e.target.value)}
              className={INPUT}
            />
            <p className="text-xs text-faint mt-1">{t('confirmationFeeHint')}</p>
          </div>

          <div>
            <label htmlFor="packaging_fee_mad" className={LABEL}>
              {t('packagingFee')}
            </label>
            <input
              id="packaging_fee_mad" name="packaging_fee_mad"
              type="number" step="0.01" min="0" disabled={isPending}
              value={packagingFee}
              onChange={(e) => setPackagingFee(e.target.value)}
              className={INPUT}
            />
            <p className="text-xs text-faint mt-1">{t('packagingFeeHint')}</p>
          </div>

          <div>
            <label htmlFor="delivery_fee_mad" className={LABEL}>
              {t('deliveryFee')}
            </label>
            <input
              id="delivery_fee_mad" name="delivery_fee_mad"
              type="number" step="0.01" min="0" disabled={isPending}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              className={INPUT}
            />
            <p className="text-xs text-faint mt-1">{t('deliveryFeeHint')}</p>
          </div>
        </div>

        {/* Auto-computed commission — read-only preview, no manual input */}
        <div className={`rounded-xl border p-4 space-y-2 ${
          !affiliateEnabled ? 'bg-surface-2 border-line opacity-60' : 'bg-success-soft border-success'
        }`}>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            {t('commissionTitle')}
          </p>
          {affiliateEnabled ? (
            <>
              <div className="space-y-1">
                <CalcRow
                  label={t('commissionSellPrice')}
                  value={!isNaN(spVal) && spVal > 0 ? formatMAD(spVal) : '—'}
                />
                <CalcRow label={t('commissionFactoryCost')} value={!isNaN(fCost) && fCost > 0 ? `−${formatMAD(fCost)}` : '—'} />
                <CalcRow
                  label={t('commissionPlatformMargin', { type: pmType === 'percentage' ? `${pmValue}%` : t('marginFixed') })}
                  value={platformMarginMad !== null ? `−${formatMAD(platformMarginMad)}` : '—'}
                />
                <CalcRow label={t('commissionDeliveryFee')} value={delivFeeVal > 0 ? `−${formatMAD(delivFeeVal)}` : `−${formatMAD(0)}`} />
                <CalcRow label={t('commissionConfirmFee')} value={`−${formatMAD(confFeeVal)}`} />
                <CalcRow label={t('commissionPackagingFee')} value={`−${formatMAD(packFeeVal)}`} />
              </div>
              <div className="pt-2 border-t border-success">
                <CalcRow
                  label={t('commissionNet')}
                  value={estimatedCommission !== null ? formatMAD(estimatedCommission) : '—'}
                  highlight
                />
              </div>
              {estimatedCommission !== null && estimatedCommission <= 0 && (
                <p className="text-xs text-warning-fg mt-1">
                  {t('commissionWarnZero')}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-faint">
              {t('commissionDisabled')}
            </p>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          6. STOCK & QUANTITÉS
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section6')}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stock_count" className={LABEL}>{t('stockCount')}</label>
            <input
              id="stock_count" name="stock_count" type="number"
              min="0" disabled={isPending}
              defaultValue={product?.stock_count ?? 0}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="wholesale_min_qty" className={LABEL}>
              {t('wholesaleMinQty')}
            </label>
            <input
              id="wholesale_min_qty" name="wholesale_min_qty" type="number"
              min="1" disabled={isPending}
              defaultValue={product?.wholesale_min_qty ?? (availabilityType === 'import_on_demand' ? 10 : 1)}
              className={INPUT}
            />
            <p className="text-xs text-faint mt-1">
              {availabilityType === 'import_on_demand'
                ? t('wholesaleMinQtyHintImport')
                : t('wholesaleMinQtyHint')}
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
            <h2 className={SECTION_TITLE}>{t('section7')}</h2>
            <p className="text-xs text-faint mt-0.5">
              {t('tierHint')}
            </p>
          </div>
          <div className="flex gap-2">
            {(!isNaN(fCost) && fCost > 0 || purchasePriceMad !== null) && (
              <button
                type="button"
                onClick={autoGenerateTiers}
                className="text-xs px-3 py-1.5 border border-line text-muted rounded-lg hover:bg-surface-2 transition-colors"
                title={t('tierAutoTitle')}
              >
                {t('tierAuto')}
              </button>
            )}
            <button
              type="button"
              onClick={addTier}
              className="text-xs px-3 py-1.5 border border-line rounded-lg hover:bg-surface-2 transition-colors"
            >
              {t('addTier')}
            </button>
          </div>
        </div>

        {tiers.length === 0 ? (
          <p className="text-xs text-faint py-3 bg-surface-2 rounded-lg text-center">
            {t('tierEmpty')}
            {(!isNaN(fCost) && fCost > 0) || purchasePriceMad
              ? t('tierEmptyWithCost')
              : t('tierEmptyNoCost')}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1">
              {[t('tierQtyMin'), t('tierQtyMax'), t('tierPriceUnit'), ''].map((h) => (
                <span key={h} className="text-xs font-medium text-muted">{h}</span>
              ))}
            </div>
            {tiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <input
                  type="number" min="1" placeholder="10"
                  value={tier.min_qty}
                  onChange={(e) => updateTier(i, 'min_qty', e.target.value)}
                  className="px-2 py-2 border border-line bg-surface text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label={t('tierAriaMin')}
                />
                <input
                  type="number" min="1" placeholder="∞"
                  value={tier.max_qty}
                  onChange={(e) => updateTier(i, 'max_qty', e.target.value)}
                  className="px-2 py-2 border border-line bg-surface text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label={t('tierAriaMax')}
                />
                <input
                  type="number" min="1" step="1" placeholder="120"
                  value={tier.price_per_unit}
                  onChange={(e) => updateTier(i, 'price_per_unit', e.target.value)}
                  className="px-2 py-2 border border-line bg-surface text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label={t('tierAriaPrice')}
                />
                <button
                  type="button" onClick={() => removeTier(i)}
                  className="text-faint hover:text-danger-fg transition-colors text-lg leading-none"
                  aria-label={t('tierAriaRemove')}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Tier preview */}
        {tiers.length > 0 && (!isNaN(fCost) && fCost > 0 || purchasePriceMad !== null) && (
          <div className="bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs text-muted space-y-0.5">
            <p className="font-semibold mb-1">{t('tierPreviewTitle')}</p>
            {tiers.map((row, i) => {
              const costBase = !isNaN(fCost) && fCost > 0 ? fCost : (purchasePriceMad ?? 0)
              const price = numMoney(row.price_per_unit) // affichage marge tier, zéro parseFloat
              const marginPct = costBase > 0 && !isNaN(price)
                ? (((price - costBase) / costBase) * 100).toFixed(0)
                : '—'
              const label = row.max_qty
                ? t('tierPreviewUnit', { min: row.min_qty, max: row.max_qty })
                : t('tierPreviewPlus', { min: row.min_qty })
              return (
                <div key={i} className="flex justify-between">
                  <span>{label}</span>
                  <span>{t('tierPreviewMargin', { price: isNaN(price) ? '—' : String(price), pct: marginPct })}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          8. MÉDIAS (images, vidéos, liens Telegram)
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={SECTION_TITLE}>{t('section8')}</h2>
            <p className="text-xs text-faint mt-0.5">
              {t('mediasHint')}
            </p>
          </div>
          <button
            type="button" onClick={addMedia}
            className="text-xs px-3 py-1.5 border border-line rounded-lg hover:bg-surface-2 transition-colors"
          >
            {t('addMedia')}
          </button>
        </div>

        <ProductCoverUpload
          coverUrl={coverUrl}
          productName={productDisplayName}
          disabled={isPending || uploadingIndex !== null}
          onUploaded={handleCoverUploaded}
          onError={setUploadError}
        />

        {/* Upload error banner */}
        {uploadError && (
          <div className="flex items-start gap-2 bg-danger-soft border border-danger rounded-lg px-3 py-2 text-xs text-danger-fg">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="ml-auto shrink-0 text-danger-fg hover:opacity-80 transition-opacity"
              aria-label={t('uploadClose')}
            >×</button>
          </div>
        )}

        <div className="space-y-2">
          {mediaItems.map((item, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex gap-2 items-center">
                {/* Type selector */}
                <select
                  value={item.type}
                  onChange={(e) => updateMediaType(i, e.target.value as MediaItem['type'])}
                  className="shrink-0 text-xs px-2 py-2.5 border border-line bg-surface text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  aria-label={t('mediaAriaType')}
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
                      ? t('mediaPlaceholderTelegram')
                      : item.type === 'image'
                      ? t('mediaPlaceholderImage')
                      : t('mediaPlaceholderLink')
                  }
                  className="flex-1 px-3 py-2 border border-line bg-surface text-foreground rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 min-w-0"
                  aria-label={t('mediaAriaUrl', { n: i + 1 })}
                />

                {/* Upload button (images only) */}
                {item.type === 'image' && (
                  <>
                    <input
                      ref={(el) => { fileInputRefs.current[i] = el }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(i, file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingIndex !== null || isPending}
                      onClick={() => fileInputRefs.current[i]?.click()}
                      className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-2 border border-line rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      title={t('uploadTriggerTitle')}
                    >
                      {uploadingIndex === i ? (
                        <span className="inline-block w-3 h-3 border-2 border-line border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>↑</span>
                      )}
                      {uploadingIndex === i ? t('uploadingBtn') : t('uploadBtn')}
                    </button>
                  </>
                )}

                {/* Thumbnail preview */}
                {item.type === 'image' && isValidMediaUrl(item.url) && (
                  <ProductThumbnail
                    src={item.url}
                    name={productDisplayName}
                    className="w-9 h-9 rounded border border-line text-[10px]"
                  />
                )}

                {mediaItems.length > 1 && (
                  <button
                    type="button" onClick={() => removeMedia(i)}
                    className="shrink-0 text-faint hover:text-danger-fg transition-colors text-lg leading-none"
                    aria-label={t('mediaAriaRemove')}
                  >×</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-faint">
          {t('uploadHint')} <code className="font-mono bg-surface-2 px-1 rounded">{t('uploadHintBucket')}</code>.{' '}
          {t('uploadHintFallback')}
        </p>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          9. STATUT & APPROBATION
         ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className={SECTION_TITLE}>{t('section9')}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="approval_status" className={LABEL}>
              {t('approvalStatus')}
            </label>
            <select
              id="approval_status" name="approval_status" disabled={isPending}
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value as ProductApprovalStatus)}
              className={INPUT}
            >
              <option value="draft">{t('approvalDraft')}</option>
              <option value="pending_review">{t('approvalPendingReview')}</option>
              <option value="approved">{t('approvalApproved')}</option>
              <option value="rejected">{t('approvalRejected')}</option>
            </select>
          </div>

          <div>
            <p className={LABEL}>{t('catalogVisibility')}</p>
            {approvalStatus === 'approved' ? (
              <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                <input
                  type="checkbox" name="active"
                  defaultChecked={product?.active ?? false}
                  disabled={isPending}
                  className="w-4 h-4 accent-gold-500"
                />
                <span className="text-sm text-foreground">{t('activeCheckbox')}</span>
              </label>
            ) : (
              <div className="mt-1.5 px-3 py-2.5 bg-warning-soft border border-warning rounded-lg text-xs text-warning-fg">
                {t('notApprovedYet')}
              </div>
            )}
          </div>
        </div>

        {product?.approved_by && (
          <div className="flex items-center gap-3 text-xs text-faint bg-surface-2 px-3 py-2 rounded-lg">
            <span>
              {t('approvedAt', {
                date: new Date(product.approved_at!).toLocaleDateString(locale, {
                  day: '2-digit', month: 'long', year: 'numeric',
                }),
              })}
            </span>
            <span className="text-line">·</span>
            <span>{t('approvedBy')}&nbsp;<span className="font-mono">{product.approved_by.slice(0, 8)}…</span></span>
          </div>
        )}
      </section>

      {/* ── Submit ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-line">
        <button
          type="submit" disabled={isPending}
          className="py-2.5 px-6 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending
            ? tc('saving')
            : product
            ? t('submitUpdate')
            : t('submitCreate')}
        </button>
        <Link
          href="/admin/products"
          className="py-2.5 px-4 border border-line text-foreground text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors text-center"
        >
          {tc('cancel')}
        </Link>
      </div>
    </form>
  )
}
