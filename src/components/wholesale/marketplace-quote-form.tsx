'use client'

import { useActionState, useState } from 'react'
import { requestSupplierProductQuote, type SupplierProductState } from '@/app/actions/supplier-products'
import {
  PURCHASE_PROFILE_LABELS,
  VOLUME_TIER_LABELS,
  BUYER_PURCHASE_PROFILES,
  BUYER_VOLUME_TIERS,
} from '@/lib/rfq-buyer-intake'

const initial: SupplierProductState = { error: null }

interface TQuote {
  qtyLabel: string
  qtyMin: string
  activityLabel: string
  activityPlaceholder: string
  volumeLabel: string
  volumePlaceholder: string
  volumeHint: string
  tier1: string
  tier2: string
  tier3: string
  tier4: string
  countryLabel: string
  cityLabel: string
  cityPlaceholder: string
  whatsappLabel: string
  whatsappPlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  cancel: string
  submit: string
  submitting: string
  cta: string
  success: string
}

interface Props {
  supplierProductId: string
  minQuantity: number
  tQuote: TQuote
}

export function MarketplaceQuoteForm({ supplierProductId, minQuantity, tQuote }: Props) {
  const [state, action, isPending] = useActionState(requestSupplierProductQuote, initial)
  const [open, setOpen] = useState(false)

  if (state?.success) {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-100 px-4 py-3 rounded-lg">
        {tQuote.success}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
      >
        {tQuote.cta}
      </button>
    )
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplier_product_id" value={supplierProductId} />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {tQuote.qtyLabel}
        </label>
        <input
          name="quantity_requested"
          type="number"
          min={minQuantity}
          defaultValue={minQuantity}
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        />
        <p className="text-xs text-gray-400 mt-0.5">{tQuote.qtyMin}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{tQuote.activityLabel}</label>
        <select
          name="buyer_purchase_profile"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">{tQuote.activityPlaceholder}</option>
          {BUYER_PURCHASE_PROFILES.map((value) => (
            <option key={value} value={value}>
              {PURCHASE_PROFILE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{tQuote.volumeLabel}</label>
        <select
          name="buyer_volume_tier"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">{tQuote.volumePlaceholder}</option>
          {BUYER_VOLUME_TIERS.map((value) => (
            <option key={value} value={value}>
              {VOLUME_TIER_LABELS[value]}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">{tQuote.volumeHint}</p>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
        <p>{tQuote.tier1}</p>
        <p>{tQuote.tier2}</p>
        <p>{tQuote.tier3}</p>
        <p>{tQuote.tier4}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{tQuote.countryLabel}</label>
        <input
          name="destination_country"
          type="text"
          defaultValue="Maroc"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{tQuote.cityLabel}</label>
        <input
          name="destination_city"
          type="text"
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder={tQuote.cityPlaceholder}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {tQuote.whatsappLabel} <span className="text-red-500">*</span>
        </label>
        <input
          name="whatsapp_number"
          type="tel"
          required
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50"
          placeholder={tQuote.whatsappPlaceholder}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{tQuote.notesLabel}</label>
        <textarea
          name="buyer_notes"
          rows={2}
          disabled={isPending}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 resize-none"
          placeholder={tQuote.notesPlaceholder}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="flex-1 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          {tQuote.cancel}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isPending ? tQuote.submitting : tQuote.submit}
        </button>
      </div>
    </form>
  )
}
