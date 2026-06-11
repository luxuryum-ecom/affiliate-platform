'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { prepareQuote } from '@/app/actions/quote-requests'
import { formatCurrency } from '@/lib/utils'
import type { QuoteRequest } from '@/types/database'

interface Props {
  requestId: string
  quantityRequested: number
  currentQuote: Pick<
    QuoteRequest,
    | 'quoted_unit_price_mad'
    | 'quoted_quantity'
    | 'quoted_transport_total_mad'
    | 'quoted_shipping_mode'
    | 'quoted_delivery_delay'
    | 'quote_validity_date'
    | 'quote_public_note'
  > & {
    source_currency?: string | null
    quoted_unit_price_source?: number | null
  }
  /** Taux centraux courants par devise (rate_vs_mad), ex. { MAD:1, USD:10, ... }. */
  rates: Record<string, number>
  /** Devise d'affichage du client (= devise du pays destination), pour information. */
  displayCurrency: string
}

const initialState = { error: null }

export function PrepareQuoteForm({
  requestId,
  quantityRequested,
  currentQuote,
  rates,
  displayCurrency,
}: Props) {
  const t = useTranslations('admin.prepareQuoteForm')
  const [state, action, isPending] = useActionState(prepareQuote, initialState)

  const currencyCodes = Object.keys(rates)
  const [sourceCurrency, setSourceCurrency] = useState<string>(
    currentQuote.source_currency ?? 'MAD',
  )
  const [sourceUnitPrice, setSourceUnitPrice] = useState<string>(
    String(currentQuote.quoted_unit_price_source ?? currentQuote.quoted_unit_price_mad ?? ''),
  )
  const [fxOverride, setFxOverride] = useState<string>('')

  const centralRate = sourceCurrency === 'MAD' ? 1 : rates[sourceCurrency] ?? null
  const overrideNum = fxOverride.trim() !== '' ? parseFloat(fxOverride) : null
  const effectiveRate =
    sourceCurrency === 'MAD' ? 1 : overrideNum && overrideNum > 0 ? overrideNum : centralRate
  const priceNum = parseFloat(sourceUnitPrice)
  const previewMad =
    effectiveRate && !isNaN(priceNum) ? parseFloat((priceNum * effectiveRate).toFixed(2)) : null

  const inputCls = "w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />

      {/* ── Prix marchandise en devise source → conversion MAD ── */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('labelSourceCurrency')} <span className="text-danger">{t('required')}</span>
          </label>
          <select
            name="source_currency"
            value={sourceCurrency}
            onChange={(e) => setSourceCurrency(e.target.value)}
            className={inputCls}
          >
            {currencyCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('labelUnitPrice', { currency: sourceCurrency })} <span className="text-danger">{t('required')}</span>
          </label>
          <input
            type="number"
            name="quoted_unit_price_source"
            step="0.0001"
            min="0.0001"
            required
            value={sourceUnitPrice}
            onChange={(e) => setSourceUnitPrice(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {t('labelQuantity')} <span className="text-danger">{t('required')}</span>
          </label>
          <input
            type="number"
            name="quoted_quantity"
            min="1"
            required
            defaultValue={currentQuote.quoted_quantity ?? quantityRequested}
            className={inputCls}
          />
        </div>
      </div>

      {/* ── Taux de change (override optionnel) + aperçu MAD ── */}
      {sourceCurrency !== 'MAD' && (
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('labelFxOverride', { currency: sourceCurrency })}
            </label>
            <input
              type="number"
              name="fx_rate_override"
              step="0.00000001"
              min="0"
              value={fxOverride}
              onChange={(e) => setFxOverride(e.target.value)}
              placeholder={centralRate != null ? `central : ${centralRate}` : 'aucun taux central'}
              className={inputCls}
            />
          </div>
          <div className="text-xs text-muted">
            {t('fxApplied', { rate: effectiveRate ?? '—' })}
            {centralRate == null && overrideNum == null && (
              <span className="text-danger block">{t('fxNoRate')}</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-surface-2 border border-line px-3 py-2 text-sm text-foreground">
        {t('previewMad', { price: previewMad != null ? formatCurrency(previewMad, 'MAD') : '—' })}{' '}
        <span className="text-muted">{t('previewMadPivot')}</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          {t('labelTransport')} <span className="text-danger">{t('required')}</span>
        </label>
        <input
          type="number"
          name="quoted_transport_total_mad"
          step="0.01"
          min="0"
          required
          defaultValue={currentQuote.quoted_transport_total_mad ?? ''}
          placeholder="0.00"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelShippingMode')}</label>
        <input
          type="text"
          name="quoted_shipping_mode"
          defaultValue={currentQuote.quoted_shipping_mode ?? ''}
          placeholder={t('placeholderShippingMode')}
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelDeliveryDelay')}</label>
        <input
          type="text"
          name="quoted_delivery_delay"
          defaultValue={currentQuote.quoted_delivery_delay ?? ''}
          placeholder={t('placeholderDeliveryDelay')}
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelValidity')}</label>
        <input
          type="date"
          name="quote_validity_date"
          defaultValue={currentQuote.quote_validity_date ?? ''}
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('labelPublicNote')}</label>
        <textarea
          name="quote_public_note"
          rows={3}
          defaultValue={currentQuote.quote_public_note ?? ''}
          placeholder={t('placeholderPublicNote')}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
        />
      </div>

      <p className="text-xs text-faint">
        {t('clientCurrencyInfo', { currency: displayCurrency })}
      </p>

      {state.error && (
        <p className="text-xs px-3 py-2 rounded-lg bg-danger-subtle text-danger border border-danger-line">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs px-3 py-2 rounded-lg bg-success-subtle text-success border border-success-line">
          {t('successMessage')}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity focus:outline-none focus:ring-2 focus:ring-gold-400"
      >
        {isPending ? t('submitting') : t('submitLabel')}
      </button>
    </form>
  )
}
