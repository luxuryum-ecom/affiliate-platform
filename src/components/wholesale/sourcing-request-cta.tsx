'use client'

import { useState } from 'react'

const INPUT =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
const LABEL = 'block text-xs font-medium text-gray-500 mb-1'

export function SourcingRequestCta({ whatsappPhone }: { whatsappPhone: string }) {
  const [open, setOpen] = useState(false)
  const [productDesc, setProductDesc] = useState('')
  const [productLink, setProductLink] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [quantity, setQuantity] = useState('')
  const [whatsapp, setWhatsapp] = useState('')

  function buildMessage(): string {
    const lines = [
      'Bonjour, je souhaite un sourcing personnalisé.',
      '',
      `Produit : ${productDesc.trim() || '—'}`,
    ]
    if (productLink.trim()) lines.push(`Lien produit : ${productLink.trim()}`)
    if (imageUrl.trim()) lines.push(`Image : ${imageUrl.trim()}`)
    if (quantity.trim()) lines.push(`Quantité : ${quantity.trim()}`)
    if (whatsapp.trim()) lines.push(`WhatsApp : ${whatsapp.trim()}`)
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
        <p className="text-sm font-semibold text-gray-900">Vous ne trouvez pas votre produit ?</p>
        <p className="text-xs text-gray-600 mt-1">
          Notre équipe se charge de le rechercher pour vous en Turquie, Chine, Égypte ou Dubaï.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full text-center text-sm font-semibold px-4 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Demander un sourcing personnalisé
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
              Demande de sourcing personnalisé
            </h2>

            <div className="space-y-3">
              <div>
                <label className={LABEL}>Nom / description du produit *</label>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  rows={3}
                  className={`${INPUT} resize-none`}
                  placeholder="Décrivez le produit recherché..."
                  required
                />
              </div>
              <div>
                <label className={LABEL}>Lien produit (optionnel)</label>
                <input
                  type="url"
                  value={productLink}
                  onChange={(e) => setProductLink(e.target.value)}
                  className={INPUT}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className={LABEL}>URL image (optionnel)</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className={INPUT}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className={LABEL}>Quantité souhaitée</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={INPUT}
                  placeholder="ex: 500 unités"
                />
              </div>
              <div>
                <label className={LABEL}>Numéro WhatsApp</label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className={INPUT}
                  placeholder="ex: 06XXXXXXXX"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!productDesc.trim()}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Envoyer sur WhatsApp
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
