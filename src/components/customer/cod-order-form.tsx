'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { placeOrder } from '@/app/actions/orders'
import type { OrderFormState } from '@/types/orders'
import { recordAffiliateClick } from '@/app/actions/affiliate-clicks'
import { formatMAD } from '@/lib/utils'
import {
  getOrCreateSessionId,
  storeAttribution,
  readAttribution,
} from '@/lib/affiliate-attribution'
import { WhatsAppCodButton } from '@/components/customer/whatsapp-cod-button'

interface CodOrderFormProps {
  productId: string
  affiliateIdFromUrl: string | null
  productName: string
  sellPrice: number
  maxQty: number
  /** Lot B : variante sélectionnée par le parent. Envoyée en hidden input pour placeOrder. */
  variantId?: string | null
}

const initialState: OrderFormState = { error: null, success: false, orderId: null }

const INPUT =
  'w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2'

export function CodOrderForm({
  productId,
  affiliateIdFromUrl,
  productName,
  sellPrice,
  maxQty,
  variantId,
}: CodOrderFormProps) {
  const t = useTranslations('publicProduct')
  const [state, action, isPending] = useActionState(placeOrder, initialState)
  const [qty, setQty] = useState(1)
  const [attribution, setAttribution] = useState<{
    affiliateId: string | null
    clickId: string | null
  }>({ affiliateId: affiliateIdFromUrl, clickId: null })

  useEffect(() => {
    const sessionId = getOrCreateSessionId()

    if (affiliateIdFromUrl) {
      // Fresh visit via ?ref= link: record click server-side, then store attribution
      // with the real clickId so subsequent visits and the order submission both have it.
      setAttribution({ affiliateId: affiliateIdFromUrl, clickId: null })
      recordAffiliateClick(affiliateIdFromUrl, productId, sessionId).then(({ clickId }) => {
        storeAttribution({ affiliateId: affiliateIdFromUrl, productId, clickId, sessionId })
        setAttribution({ affiliateId: affiliateIdFromUrl, clickId })
      })
    } else {
      // Return visit without ?ref=: recover affiliate + clickId from 30-day localStorage window.
      const stored = readAttribution(productId)
      if (stored) {
        setAttribution({ affiliateId: stored.affiliateId, clickId: stored.clickId })
      }
    }
  }, [affiliateIdFromUrl, productId])

  const total = sellPrice * qty

  if (state.success && state.orderId) {
    return (
      <div className="space-y-3">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center space-y-2">
          <p className="text-2xl">{t('form.successIcon')}</p>
          <p className="font-semibold text-green-800">{t('form.successTitle')}</p>
          <p className="text-sm text-green-700">
            {t('form.successRef', { ref: state.orderId.slice(0, 8).toUpperCase() })}
          </p>
          <p className="text-xs text-green-600 pt-1">
            {t('form.successNote')}
          </p>
        </div>
        {state.warning === 'restocking' && (
          <div className="bg-accent-soft border border-accent px-3 py-2 rounded-lg">
            <p className="text-sm text-accent-fg">{t('form.restockingWarning')}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        {variantId && (
          <input type="hidden" name="variantId" value={variantId} />
        )}
        {attribution.affiliateId && (
          <input type="hidden" name="affiliateId" value={attribution.affiliateId} />
        )}
        {attribution.clickId && (
          <input type="hidden" name="attributionClickId" value={attribution.clickId} />
        )}
        <input type="hidden" name="quantity" value={qty} />

        <div>
          <label className="block text-xs font-medium text-muted mb-2">{t('form.labelQty')}</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label={t('form.ariaDecrease')}
              className="w-10 h-10 flex items-center justify-center border border-line rounded-lg text-foreground hover:bg-surface-2 disabled:opacity-40 text-lg"
            >
              −
            </button>
            <span className="w-12 text-center font-semibold text-foreground text-lg">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty}
              aria-label={t('form.ariaIncrease')}
              className="w-10 h-10 flex items-center justify-center border border-line rounded-lg text-foreground hover:bg-surface-2 disabled:opacity-40 text-lg"
            >
              +
            </button>
            <span className="text-sm text-muted ms-auto">
              {t('form.totalLabel', { amount: formatMAD(total) })}
            </span>
          </div>
        </div>

        <hr className="border-line" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('form.labelName')} <span className="text-red-500">{t('form.required')}</span>
            </label>
            <input
              name="customer_name"
              type="text"
              required
              disabled={isPending}
              placeholder={t('form.placeholderName')}
              className={INPUT}
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('form.labelPhone')} <span className="text-red-500">{t('form.required')}</span>
            </label>
            <input
              name="customer_phone"
              type="tel"
              required
              disabled={isPending}
              placeholder={t('form.placeholderPhone')}
              className={INPUT}
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('form.labelCity')} <span className="text-red-500">{t('form.required')}</span>
            </label>
            <input
              name="customer_city"
              type="text"
              required
              disabled={isPending}
              placeholder={t('form.placeholderCity')}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('form.labelAddress')} <span className="text-red-500">{t('form.required')}</span>
            </label>
            <textarea
              name="customer_address"
              required
              disabled={isPending}
              rows={2}
              placeholder={t('form.placeholderAddress')}
              className={INPUT + ' resize-none'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              {t('form.labelNotes')}
            </label>
            <input
              name="notes"
              type="text"
              disabled={isPending}
              placeholder={t('form.placeholderNotes')}
              className={INPUT}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-800">
          💵 {t('form.codBadge', { amount: formatMAD(total) })}
        </div>

        {state.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || maxQty === 0}
          className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-gold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isPending
            ? t('form.submitting')
            : maxQty === 0
            ? t('form.outOfStock')
            : t('form.submit')}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface px-2 text-faint">{t('form.orSeparator')}</span>
        </div>
      </div>

      <WhatsAppCodButton productName={productName} sellPrice={sellPrice} />

      <p className="text-xs text-center text-faint leading-relaxed">
        {t('form.consent')}
      </p>
    </div>
  )
}
