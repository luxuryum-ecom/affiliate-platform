'use client'

import { useActionState, useState } from 'react'
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

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_id" value={requestId} />

      {/* ── Prix marchandise en devise source → conversion MAD ── */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Devise source <span className="text-red-500">*</span>
          </label>
          <select
            name="source_currency"
            value={sourceCurrency}
            onChange={(e) => setSourceCurrency(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          >
            {currencyCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Prix unitaire ({sourceCurrency}) <span className="text-red-500">*</span>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Quantité <span className="text-red-500">*</span></label>
          <input
            type="number"
            name="quoted_quantity"
            min="1"
            required
            defaultValue={currentQuote.quoted_quantity ?? quantityRequested}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* ── Taux de change (override optionnel) + aperçu MAD ── */}
      {sourceCurrency !== 'MAD' && (
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Taux {sourceCurrency}→MAD (override)
            </label>
            <input
              type="number"
              name="fx_rate_override"
              step="0.00000001"
              min="0"
              value={fxOverride}
              onChange={(e) => setFxOverride(e.target.value)}
              placeholder={centralRate != null ? `central : ${centralRate}` : 'aucun taux central'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div className="text-xs text-gray-600">
            Taux appliqué : <span className="font-semibold">{effectiveRate ?? '—'}</span>
            {centralRate == null && overrideNum == null && (
              <span className="text-red-600 block">Aucun taux central — saisissez un override.</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        Prix unitaire converti :{' '}
        <span className="font-bold">{previewMad != null ? formatCurrency(previewMad, 'MAD') : '—'}</span>
        <span className="text-indigo-500"> (pivot interne MAD)</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Transport + douane total (MAD) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="quoted_transport_total_mad"
          step="0.01"
          min="0"
          required
          defaultValue={currentQuote.quoted_transport_total_mad ?? ''}
          placeholder="0.00"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mode de transport</label>
        <input
          type="text"
          name="quoted_shipping_mode"
          defaultValue={currentQuote.quoted_shipping_mode ?? ''}
          placeholder="ex. Aérien door-to-door, Maritime FCL…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Délai de livraison estimé</label>
        <input
          type="text"
          name="quoted_delivery_delay"
          defaultValue={currentQuote.quoted_delivery_delay ?? ''}
          placeholder="ex. 21–28 jours ouvrés"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Validité du devis</label>
        <input
          type="date"
          name="quote_validity_date"
          defaultValue={currentQuote.quote_validity_date ?? ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Note publique au client</label>
        <textarea
          name="quote_public_note"
          rows={3}
          defaultValue={currentQuote.quote_public_note ?? ''}
          placeholder="Conditions particulières, remarques visibles par le client…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none resize-none"
        />
      </div>

      <p className="text-xs text-gray-400">
        Le client verra ce devis dans sa devise : <span className="font-medium">{displayCurrency}</span>.
      </p>

      {state.error && (
        <p className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700">
          Devis enregistré — statut mis à jour en &laquo;&nbsp;Devis préparé&nbsp;&raquo;.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Enregistrement…' : 'Enregistrer le devis'}
      </button>
    </form>
  )
}
