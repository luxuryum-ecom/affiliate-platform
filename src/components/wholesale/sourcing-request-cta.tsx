'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const INPUT =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
const LABEL = 'block text-xs font-medium text-gray-500 mb-1'

export function SourcingRequestCta({ whatsappPhone }: { whatsappPhone: string }) {
  const t = useTranslations('wholesale.sourcingCta')

  const [open, setOpen] = useState(false)
  const [productDesc, setProductDesc] = useState('')
  const [productLink, setProductLink] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [quantity, setQuantity] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  function buildMessage(): string {
    const lines = [
      t('waGreeting'),
      '',
      t('waProduct', { value: productDesc.trim() || '—' }),
    ]
    if (productLink.trim()) lines.push(t('waLink', { value: productLink.trim() }))
    if (imageUrl.trim()) lines.push(t('waImage', { value: imageUrl.trim() }))
    if (quantity.trim()) lines.push(t('waQty', { value: quantity.trim() }))
    if (whatsapp.trim()) lines.push(t('waWhatsapp', { value: whatsapp.trim() }))
    return encodeURIComponent(lines.join('\n'))
  }

  function handleSend() {
    if (!productDesc.trim()) return
    window.open(`https://wa.me/${whatsappPhone}?text=${buildMessage()}`, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <>
      <div className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-gray-900">{t('ctaTitle')}</p>
        <p className="text-xs text-gray-600 mt-1">{t('ctaBody')}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full text-center text-sm font-semibold px-4 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          {t('ctaBtn')}
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sourcing-modal-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-lg w-full max-w-md p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sourcing-modal-title" className="text-base font-bold text-gray-900 mb-3">
              {t('modalTitle')}
            </h2>

            <div className="space-y-3">
              <div>
                <label className={LABEL}>{t('fieldProduct')}</label>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  rows={3}
                  className={`${INPUT} resize-none`}
                  placeholder={t('fieldProductPlaceholder')}
                  required
                />
              </div>
              <div>
                <label className={LABEL}>{t('fieldLink')}</label>
                <input
                  type="url"
                  value={productLink}
                  onChange={(e) => setProductLink(e.target.value)}
                  className={INPUT}
                  placeholder={t('fieldLinkPlaceholder')}
                />
              </div>
              <div>
                <label className={LABEL}>{t('fieldImage')}</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className={INPUT}
                  placeholder={t('fieldImagePlaceholder')}
                />
              </div>
              <div>
                <label className={LABEL}>{t('fieldQty')}</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={INPUT}
                  placeholder={t('fieldQtyPlaceholder')}
                />
              </div>
              <div>
                <label className={LABEL}>{t('fieldWhatsapp')}</label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className={INPUT}
                  placeholder={t('fieldWhatsappPlaceholder')}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('cancelBtn')}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!productDesc.trim()}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('sendBtn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
