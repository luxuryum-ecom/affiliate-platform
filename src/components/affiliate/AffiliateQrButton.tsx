'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * AffiliateQrButton — porte de conversion « Mon QR ».
 * Génère LOCALEMENT (qrcode.react, aucun appel externe → le lien d'affiliation
 * ne quitte jamais le navigateur) le QR code du lien de parrainage et l'affiche
 * dans une modale. Strings résolues serveur (règle #2).
 */

export interface AffiliateQrStrings {
  title: string
  desc: string
  hint: string
  close: string
}

interface Props {
  url: string
  strings: AffiliateQrStrings
}

export function AffiliateQrButton({ url, strings }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-start gap-1 rounded-xl border-2 border-gold-300 bg-surface p-3 text-start min-h-[44px] hover:bg-surface-2 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><line x1="14" y1="14" x2="14" y2="14" /><line x1="20" y1="14" x2="20" y2="20" /><line x1="14" y1="20" x2="17" y2="20" />
          </svg>
          {strings.title}
        </span>
        <span className="text-[11px] text-muted leading-snug">{strings.desc}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={strings.title}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface rounded-2xl border border-line p-5 w-full max-w-xs text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-foreground mb-3">{strings.title}</p>
            <div className="inline-block rounded-lg bg-white p-3">
              <QRCodeSVG value={url} size={200} level="M" />
            </div>
            <p className="text-xs text-muted mt-3 leading-snug">{strings.hint}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full min-h-[44px] rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {strings.close}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
