'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const INPUT =
  'w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint'
const LABEL = 'block text-xs font-medium text-muted mb-1'

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
      <div className="mt-3 w-full rounded-xl border border-success bg-success-soft p-4">
        <p className="text-sm font-semibold text-foreground">{t('ctaTitle')}</p>
        <p className="text-xs text-muted mt-1">{t('ctaBody')}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full text-center text-sm font-semibold px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
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
            className="bg-surface rounded-xl border border-line shadow-lg w-full max-w-md p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sourcing-modal-title" className="text-base font-bold text-foreground mb-3">
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
                className="flex-1 px-4 py-2 border border-line text-muted text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors"
              >
                {t('cancelBtn')}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!productDesc.trim()}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
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
