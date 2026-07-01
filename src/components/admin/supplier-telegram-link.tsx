'use client'

// ─── Admin : génère le lien magique Telegram d'UN fournisseur et le partage ───
//   L'admin clique « Générer le lien », obtient un lien cliquable + QR + un bouton
//   « Partager sur WhatsApp » (pré-rempli avec le numéro E.164 du fournisseur).
//   Le mécanisme de liaison (/start CODE) est déjà géré côté bot — ici on n'affiche
//   que ce qui entoure. Aucune donnée sensible : uniquement le code + le lien.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import {
  generateLinkCodeForSupplier,
  type TelegramLinkState,
} from '@/app/actions/telegram-link'

export function SupplierTelegramLink({
  supplierId,
  phone,
  botUsername: botUsernameProp,
}: {
  supplierId: string
  phone: string | null
  botUsername: string | null
}) {
  const t = useTranslations('admin.userDetail.telegram')
  const [state, setState] = useState<TelegramLinkState | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      setState(await generateLinkCodeForSupplier(supplierId))
    })
  }

  const botUsername = state?.botUsername ?? botUsernameProp
  const startUrl =
    botUsername && state?.code ? `https://t.me/${botUsername}?start=${state.code}` : null

  // wa.me exige un numéro en chiffres seuls (sans « + » ni séparateurs).
  const waPhone = (phone ?? '').replace(/[^\d]/g, '')
  const waHref =
    startUrl && waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(t('waMessage', { url: startUrl }))}`
      : null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{t('title')}</p>
          <p className="text-xs text-faint mt-0.5">{t('desc')}</p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t('generating') : t('generate')}
        </button>
      </div>

      {state?.linked && (
        <p className="text-xs font-medium text-success-fg">{t('linkedAlready')}</p>
      )}

      {state?.error && <p className="text-xs text-danger-fg">{state.error}</p>}

      {state?.code && startUrl && (
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
          <a
            href={startUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t('openLink')}
          </a>

          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('shareWhatsApp')}
            </a>
          )}

          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-muted">{t('scanQr')}</p>
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={startUrl} size={150} />
            </div>
          </div>

          <p className="text-center text-xs text-faint">
            {t('validity', { minutes: state.expiresInMinutes ?? 15 })}
          </p>
        </div>
      )}
    </div>
  )
}
