'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAffiliateOrder } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { Product, City } from '@/types/database'

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

interface Props {
  products: ProductOption[]
  cities: Pick<City, 'id' | 'name' | 'delivery_fee_mad'>[]
}

const SOURCE_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone',    label: 'Téléphone' },
  { value: 'manual',   label: 'Saisie manuelle' },
]

export function CreateOrderForm({ products, cities }: Props) {
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

  const product = products.find((p) => p.id === selectedProductId)

  const cityRow = cities.find(
    (c) => c.name.toLowerCase() === selectedCity.toLowerCase()
  )
  const deliveryFee = cityRow?.delivery_fee_mad ?? product?.delivery_fee_mad ?? 0
  const confirmFee  = product?.confirmation_fee_mad ?? 10
  const packFee     = product?.packaging_fee_mad ?? 10

  // Rough commission preview (unit-level, like the formula)
  const estimatedCommission = product
    ? Math.max(
        0,
        (sellPrice - (product as unknown as { sell_price: number }).sell_price) * quantity
        // simplified preview: affiliate margin = sell_price - base_price
        // real commission is calculated server-side with full formula
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
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {state.error}
        </div>
      )}

      {/* Product */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Produit</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1" htmlFor="product_id">
              Produit *
            </label>
            <select
              id="product_id"
              name="product_id"
              value={selectedProductId}
              onChange={(e) => onProductChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — base {formatMAD(p.sell_price)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="quantity">
              Quantité *
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="sell_price">
              Prix de vente client (MAD) *
            </label>
            <input
              id="sell_price"
              name="sell_price"
              type="number"
              min={product?.sell_price ?? 0}
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
            {product && sellPrice < product.sell_price && (
              <p className="text-xs text-red-500 mt-1">
                Minimum : {formatMAD(product.sell_price)}
              </p>
            )}
          </div>
        </div>

        {product && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Total commande</span>
              <span className="font-medium text-gray-900 tabular-nums">
                {formatMAD(sellPrice * quantity)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Frais livraison estimés</span>
              <span className="tabular-nums">{formatMAD(deliveryFee)}</span>
            </div>
            <div className="flex justify-between">
              <span>Frais opérationnels</span>
              <span className="tabular-nums">{formatMAD(confirmFee + packFee)}</span>
            </div>
            {estimatedCommission > 0 && (
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span>Marge sup. estimée</span>
                <span className="font-medium text-green-700 tabular-nums">
                  +{formatMAD(estimatedCommission)}
                </span>
              </div>
            )}
            <p className="text-gray-400 italic pt-0.5">
              Commission définitive calculée à la livraison.
            </p>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Client</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="customer_name">
              Nom complet *
            </label>
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              placeholder="Ex : Ahmed Benali"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="customer_phone">
              Téléphone *
            </label>
            <input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              placeholder="0612345678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="customer_city">
              Ville *
            </label>
            {cities.length > 0 ? (
              <select
                id="customer_city"
                name="customer_city"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                required
              >
                <option value="">Choisir une ville…</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({formatMAD(c.delivery_fee_mad)} livraison)
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="customer_city"
                name="customer_city"
                type="text"
                placeholder="Ex : Casablanca"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                required
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1" htmlFor="customer_address">
              Adresse complète *
            </label>
            <input
              id="customer_address"
              name="customer_address"
              type="text"
              placeholder="Ex : Rue Allal Ben Abdellah, Apt 4, Casablanca"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              required
            />
          </div>
        </div>
      </div>

      {/* Source & notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Origine & notes</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="order_source">
              Source de la commande *
            </label>
            <select
              id="order_source"
              name="order_source"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1" htmlFor="notes">
              Notes internes (optionnel)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Ex : client confirmé par WhatsApp, livraison rapide demandée…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <a
          href="/affiliate/orders"
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← Retour
        </a>
        <button
          type="submit"
          disabled={isPending || (product ? sellPrice < product.sell_price : false)}
          className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Enregistrement…' : 'Créer la commande'}
        </button>
      </div>
    </form>
  )
}
