'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { submitRfqOffer } from '@/app/actions/rfq-engine'

const initial = { error: null, success: false }

export default function OfferForm({ matchId }: { matchId: string }) {
  const [state, action, isPending] = useActionState(submitRfqOffer, initial)
  const t = useTranslations('supplier.offerForm')

  if (state.success) {
    return (
      <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        {t('successMessage')}
      </div>
    )
  }

  return (
    <form action={action} className="space-y-3 pt-3 border-t border-gray-100">
      <input type="hidden" name="rfq_match_id" value={matchId} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('responseTypeLabel')}</label>
        <select
          name="response_type"
          required
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">{t('responseTypePlaceholder')}</option>
          <option value="offer">📨 {t('responseTypeOffer')}</option>
          <option value="decline">❌ {t('responseTypeDecline')}</option>
          <option value="clarification">❓ {t('responseTypeClarification')}</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('unitPriceLabel')}</label>
          <input
            name="unit_price_usd"
            type="number"
            step="0.01"
            min={0}
            placeholder={t('unitPricePlaceholder')}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('moqLabel')}</label>
          <input
            name="moq_offered"
            type="number"
            min={1}
            placeholder={t('moqPlaceholder')}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('leadTimeLabel')}</label>
          <input
            name="lead_time_days"
            type="number"
            min={1}
            placeholder={t('leadTimePlaceholder')}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('messageLabel')}</label>
        <textarea
          name="message"
          rows={2}
          placeholder={t('messagePlaceholder')}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('sending') : t('ctaSend')}
      </button>
    </form>
  )
}
