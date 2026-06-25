'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAffiliateOrder } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import { VariantSelector } from '@/components/product/variant-selector'
import type { Product, City } from '@/types/database'
import type { ProductVariant } from '@/components/product/variant-selector'

type ProductOption = Pick<
  Product,
  | 'id'
  | 'name'
  | 'sell_price'
  | 'commission_amount'
  | 'delivery_fee_mad'
  | 'confirmation_fee_mad'
  | 'packaging_fee_mad'
>

export interface CreateOrderFormStrings {
  sectionProduct: string
  fieldProduct: string
  /** ICU template: {name}, {price} */
  productOption: string
  fieldQuantity: string
  fieldSellPrice: string
  /** ICU template: {min} */
  priceMinError: string
  summaryOrderTotal: string
  summaryDelivery: string
  summaryOps: string
  summaryMargin: string
  summaryNote: string
  sectionCustomer: string
  fieldName: string
  namePlaceholder: string
  fieldPhone: string
  phonePlaceholder: string
  fieldCity: string
  cityPlaceholder: string
  /** ICU template: {name}, {fee} */
  cityOption: string
  cityFreeInput: string
  fieldAddress: string
  addressPlaceholder: string
  sectionSource: string
  fieldSource: string
  sourceWhatsapp: string
  sourcePhone: string
  sourceManual: string
  fieldNotes: string
  notesPlaceholder: string
  backButton: string
  submitButton: string
  submitting: string
  restockingWarning: string
}

interface Props {
  products: ProductOption[]
  cities: Pick<City, 'id' | 'name' | 'delivery_fee_mad'>[]
  strings: CreateOrderFormStrings
  /** C3 : variantes par product_id, chargées server-side, données sérialisables uniquement. */
  variantsPerProduct: Record<string, ProductVariant[]>
  variantStrings: {
    chooseOption: string
    unavailable: string
    variantLabel: string
  }
}

/** Minimal ICU-like interpolation for string templates with named params. */
function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`)
}

/** Retourne le premier variant_id significatif d'un produit (stock > 0 en priorité). */
function getDefaultVariantId(variants: ProductVariant[]): string | null {
  const meaningful = variants.filter((v) => Object.keys(v.attributes).length > 0)
  return meaningful.find((v) => v.is_default)?.id ?? meaningful[0]?.id ?? null
}

export function CreateOrderForm({ products, cities, strings: s, variantsPerProduct, variantStrings }: Props) {
  const router = useRouter()
  const [state, action, isPending] = useActionState(createAffiliateOrder, {
    error: null,
    success: false,
    orderId: null,
  })

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [sellPrice, setSellPrice] = useState(products[0]?.sell_price ?? 0)
  const [selectedCity, setSelectedCity] = useState('')
  // C3 — variant_id sélectionné pour ce produit. null = commande sans variante (produit simple).
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() =>
    getDefaultVariantId(variantsPerProduct[products[0]?.id ?? ''] ?? []),
  )

  const product = products.find((p) => p.id === selectedProductId)
  // Variantes réelles (attrs non-vides) pour le produit sélectionné.
  const currentVariants = variantsPerProduct[selectedProductId] ?? []
  const hasMeaningfulVariants =
    currentVariants.filter((v) => Object.keys(v.attributes).length > 0).length > 1

  const cityRow = cities.find(
    (c) => c.name.toLowerCase() === selectedCity.toLowerCase()
  )
  const deliveryFee = cityRow?.delivery_fee_mad ?? product?.delivery_fee_mad ?? 0
  const confirmFee  = product?.confirmation_fee_mad ?? 10
  const packFee     = product?.packaging_fee_mad ?? 10

  const estimatedCommission = product
    ? Math.max(
        0,
        (sellPrice - (product as unknown as { sell_price: number }).sell_price) * quantity
      )
    : 0

  useEffect(() => {
    if (state.success && state.orderId) {
      router.push('/affiliate/orders')
    }
  }, [state.success, state.orderId, router])

  function onProductChange(id: string) {
    setSelectedProductId(id)
    const p = products.find((x) => x.id === id)
    if (p) setSellPrice(p.sell_price)
    // C3 : réinitialise la variante sélectionnée au défaut du nouveau produit.
    setSelectedVariantId(getDefaultVariantId(variantsPerProduct[id] ?? []))
  }

  const sourceOptions = [
    { value: 'whatsapp', label: s.sourceWhatsapp },
    { value: 'phone',    label: s.sourcePhone },
    { value: 'manual',   label: s.sourceManual },
  ]

  return (
    <form action={action} className="space-y-6">
      {/* C3 : variant_id transmis silencieusement — null si produit simple (pas de variantes). */}
      {selectedVariantId && (
        <input type="hidden" name="variant_id" value={selectedVariantId} />
      )}
      {state.error && (
        <div className="bg-danger-soft border border-danger text-danger-fg text-sm rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}
      {state.warning === 'restocking' && (
        <div className="bg-accent-soft border border-accent px-3 py-2 rounded-lg">
          <p className="text-sm text-accent-fg">{s.restockingWarning}</p>
        </div>
      )}

      {/* Product */}
      <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{s.sectionProduct}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1" htmlFor="product_id">
              {s.fieldProduct}
            </label>
            <select
              id="product_id"
              name="product_id"
              value={selectedProductId}
              onChange={(e) => onProductChange(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {interpolate(s.productOption, { name: p.name, price: formatMAD(p.sell_price) })}
                </option>
              ))}
            </select>
          </div>

          {/* C3 : Sélecteur de variante — visible uniquement si le produit a ≥ 2 variantes réelles. */}
          {hasMeaningfulVariants && (
            <div className="sm:col-span-2">
              <VariantSelector
                variants={currentVariants}
                strings={variantStrings}
                onSelect={setSelectedVariantId}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="quantity">
              {s.fieldQuantity}
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="sell_price">
              {s.fieldSellPrice}
            </label>
            <input
              id="sell_price"
              name="sell_price"
              type="number"
              min={product?.sell_price ?? 0}
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
            {product && sellPrice < product.sell_price && (
              <p className="text-xs text-danger-fg mt-1">
                {interpolate(s.priceMinError, { min: formatMAD(product.sell_price) })}
              </p>
            )}
          </div>
        </div>

        {product && (
          <div className="bg-surface-2 rounded-lg p-3 text-xs text-muted space-y-1">
            <div className="flex justify-between">
              <span>{s.summaryOrderTotal}</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatMAD(sellPrice * quantity)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{s.summaryDelivery}</span>
              <span className="tabular-nums">{formatMAD(deliveryFee)}</span>
            </div>
            <div className="flex justify-between">
              <span>{s.summaryOps}</span>
              <span className="tabular-nums">{formatMAD(confirmFee + packFee)}</span>
            </div>
            {estimatedCommission > 0 && (
              <div className="flex justify-between border-t border-line pt-1 mt-1">
                <span>{s.summaryMargin}</span>
                <span className="font-medium text-success-fg tabular-nums">
                  +{formatMAD(estimatedCommission)}
                </span>
              </div>
            )}
            <p className="text-faint italic pt-0.5">{s.summaryNote}</p>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{s.sectionCustomer}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="customer_name">
              {s.fieldName}
            </label>
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              placeholder={s.namePlaceholder}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="customer_phone">
              {s.fieldPhone}
            </label>
            <input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              placeholder={s.phonePlaceholder}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="customer_city">
              {s.fieldCity}
            </label>
            {cities.length > 0 ? (
              <select
                id="customer_city"
                name="customer_city"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                required
              >
                <option value="">{s.cityPlaceholder}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.name}>
                    {interpolate(s.cityOption, { name: c.name, fee: formatMAD(c.delivery_fee_mad) })}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="customer_city"
                name="customer_city"
                type="text"
                placeholder={s.cityFreeInput}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
                required
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1" htmlFor="customer_address">
              {s.fieldAddress}
            </label>
            <input
              id="customer_address"
              name="customer_address"
              type="text"
              placeholder={s.addressPlaceholder}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400"
              required
            />
          </div>
        </div>
      </div>

      {/* Source & notes */}
      <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{s.sectionSource}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1" htmlFor="order_source">
              {s.fieldSource}
            </label>
            <select
              id="order_source"
              name="order_source"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
            >
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-muted mb-1" htmlFor="notes">
              {s.fieldNotes}
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder={s.notesPlaceholder}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <Link
          href="/affiliate/orders"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          {s.backButton}
        </Link>
        <button
          type="submit"
          disabled={isPending || (product ? sellPrice < product.sell_price : false)}
          className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? s.submitting : s.submitButton}
        </button>
      </div>
    </form>
  )
}
