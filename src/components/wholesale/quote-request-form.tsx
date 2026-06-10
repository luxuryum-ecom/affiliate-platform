'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { submitQuoteRequest } from '@/app/actions/quote-requests'
import type { QuoteRequestFormState } from '@/app/actions/quote-requests'

const initial: QuoteRequestFormState = { error: null }

export function QuoteRequestForm({
  productId,
  productName,
}: {
  productId: string
  productName: string
}) {
  const t = useTranslations('wholesale.productDetail')
  const [open, setOpen] = useState(false)
  const [state, action, isPending] = useActionState(submitQuoteRequest, initial)

  if (state.success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        {t('quoteSuccess')}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {t('quoteRequestButton')}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        {/* productName is DB data */}
        <h3 className="text-sm font-semibold text-gray-900">{t('quoteRequestTitle', { name: productName })}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          {t('quoteRequestCancel')}
        </button>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="product_id" value={productId} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('quoteFieldQty')} <span className="text-red-500">*</span>
            </label>
            <input
              name="quantity_requested"
              type="number"
              min={1}
              required
              placeholder={t('quoteQtyPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('quoteFieldWhatsapp')} <span className="text-red-500">*</span>
            </label>
            <input
              name="whatsapp_number"
              type="tel"
              required
              placeholder={t('quoteWhatsappPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('quoteFieldDestCountry')} <span className="text-red-500">*</span>
            </label>
            <input
              name="destination_country"
              type="text"
              required
              placeholder={t('quoteDestCountryPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('quoteFieldDestCity')}</label>
            <input
              name="destination_city"
              type="text"
              placeholder={t('quoteDestCityPlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('quoteFieldShipping')}</label>
          <select
            name="preferred_shipping_mode"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          >
            <option value="">{t('quoteShippingNone')}</option>
            <option value="air_door_to_door_kg">{t('quoteShippingAir')}</option>
            <option value="sea_textile_kg">{t('quoteShippingSeaTextile')}</option>
            <option value="sea_volume_cbm">{t('quoteShippingSeaVolume')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('quoteFieldColors')}</label>
          <input
            name="colors_or_variants"
            type="text"
            placeholder={t('quoteColorsPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('quoteFieldSizes')}</label>
          <input
            name="sizes"
            type="text"
            placeholder={t('quoteSizesPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('quoteFieldNotes')}</label>
          <textarea
            name="buyer_notes"
            rows={3}
            placeholder={t('quoteNotesPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none resize-none"
          />
        </div>

        {state.error && (
          <p className="text-xs px-3 py-2 bg-red-50 text-red-600 rounded-lg">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {isPending ? t('quoteSubmitting') : t('quoteSubmit')}
        </button>
      </form>
    </div>
  )
}
