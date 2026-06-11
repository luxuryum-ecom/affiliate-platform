'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { submitQuoteRequest } from '@/app/actions/quote-requests'
import type { QuoteRequestFormState } from '@/app/actions/quote-requests'

const initial: QuoteRequestFormState = { error: null }

const INPUT = 'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint'
const LABEL = 'block text-xs font-medium text-muted mb-1'

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
      <div className="rounded-xl border border-success bg-success-soft p-4 text-sm text-success-fg">
        {t('quoteSuccess')}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        {t('quoteRequestButton')}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        {/* productName is DB data */}
        <h3 className="text-sm font-semibold text-foreground">{t('quoteRequestTitle', { name: productName })}</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-faint hover:text-muted text-xs"
        >
          {t('quoteRequestCancel')}
        </button>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="product_id" value={productId} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>
              {t('quoteFieldQty')} <span className="text-danger-fg">*</span>
            </label>
            <input
              name="quantity_requested"
              type="number"
              min={1}
              required
              placeholder={t('quoteQtyPlaceholder')}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>
              {t('quoteFieldWhatsapp')} <span className="text-danger-fg">*</span>
            </label>
            <input
              name="whatsapp_number"
              type="tel"
              required
              placeholder={t('quoteWhatsappPlaceholder')}
              className={INPUT}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>
              {t('quoteFieldDestCountry')} <span className="text-danger-fg">*</span>
            </label>
            <input
              name="destination_country"
              type="text"
              required
              placeholder={t('quoteDestCountryPlaceholder')}
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>{t('quoteFieldDestCity')}</label>
            <input
              name="destination_city"
              type="text"
              placeholder={t('quoteDestCityPlaceholder')}
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label className={LABEL}>{t('quoteFieldShipping')}</label>
          <select
            name="preferred_shipping_mode"
            className={INPUT}
          >
            <option value="">{t('quoteShippingNone')}</option>
            <option value="air_door_to_door_kg">{t('quoteShippingAir')}</option>
            <option value="sea_textile_kg">{t('quoteShippingSeaTextile')}</option>
            <option value="sea_volume_cbm">{t('quoteShippingSeaVolume')}</option>
          </select>
        </div>

        <div>
          <label className={LABEL}>{t('quoteFieldColors')}</label>
          <input
            name="colors_or_variants"
            type="text"
            placeholder={t('quoteColorsPlaceholder')}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>{t('quoteFieldSizes')}</label>
          <input
            name="sizes"
            type="text"
            placeholder={t('quoteSizesPlaceholder')}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>{t('quoteFieldNotes')}</label>
          <textarea
            name="buyer_notes"
            rows={3}
            placeholder={t('quoteNotesPlaceholder')}
            className={`${INPUT} resize-none`}
          />
        </div>

        {state.error && (
          <p className="text-xs px-3 py-2 bg-danger-soft border border-danger text-danger-fg rounded-lg">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? t('quoteSubmitting') : t('quoteSubmit')}
        </button>
      </form>
    </div>
  )
}
