'use client'

// ─── Carte de liaison Telegram (autoportante) ────────────────────────────────
//   import { TelegramLinkCard } from '@/components/supplier/telegram-link-card'
//   <TelegramLinkCard initialStatus={await getTelegramLinkStatus()} quota={...} />

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import {
  generateTelegramLinkCode,
  type TelegramLinkState,
} from '@/app/actions/telegram-link'

type Quota = { current: number; max: number; isUnlimited: boolean }

// Icône couronne (pas de lib d'icônes dans le projet) — couleur via currentColor.
function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 7.5l4.2 3.3L12 4l4.8 6.8L21 7.5 19.2 17H4.8L3 7.5zM4.8 19h14.4v2H4.8v-2z" />
    </svg>
  )
}

export function TelegramLinkCard({
  initialStatus,
  quota,
}: {
  initialStatus?: TelegramLinkState
  quota?: Quota
}) {
  const t = useTranslations('supplier.telegramLink')
  const [state, action, isPending] = useActionState(
    generateTelegramLinkCode,
    initialStatus ?? { error: null },
  )

  const botUsername = state.botUsername ?? initialStatus?.botUsername ?? null
  const botLabel = botUsername ? `@${botUsername}` : t('botFallback')
  const linked = state.linked || initialStatus?.linked

  // Lien magique Telegram : clic/scan → le bot s'ouvre ET lie le compte (/start CODE
  // est déjà géré côté bot). Construit uniquement si le username du bot est connu ;
  // sinon on retombe sur le repli textuel « /link CODE ».
  const startUrl =
    botUsername && state.code
      ? `https://t.me/${botUsername}?start=${state.code}`
      : null

  const atLimit = !!quota && !quota.isUnlimited && quota.current >= quota.max

  // ── Section quota / incitation Premium (partagée liée + non liée) ────────────
  // Compteur X/Y issu de la vraie limite du plan (quota). Numéraux latins forcés
  // via String() (substitution verbatim, sans formatage numérique localisé).
  const quotaSection = !quota ? null : quota.isUnlimited ? (
    <p className="text-xs font-medium text-muted">
      {t('quotaUnlimited', { current: String(quota.current) })}
    </p>
  ) : atLimit ? (
    // Carte PREMIUM OR (pas rouge) — incitation à l'abonnement.
    <div className="flex items-start gap-3 rounded-xl border border-[#EF9F27] bg-[#FAEEDA] p-4">
      <CrownIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-fg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-accent-fg">
          {t('limitReached', { current: String(quota.current), max: String(quota.max) })}
        </p>
        <p className="mt-0.5 text-xs text-accent-fg/80">{t('limitReachedSub')}</p>
      </div>
      <Link
        href="/supplier/premium"
        className="shrink-0 rounded-lg bg-[#BA7517] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        {t('goPremium')}
      </Link>
    </div>
  ) : (
    <p className="text-xs font-medium text-muted">
      {t('quotaLabel', { current: String(quota.current), max: String(quota.max) })}
    </p>
  )

  // ── État LIÉ : en-tête + guide + bouton PERMANENT « Envoyer un produit » ──────
  // Lien direct vers le bot (t.me/<bot>, SANS code) : le compte est déjà lié, le
  // fournisseur retrouve le bot en 1 clic pour envoyer une photo. Construit
  // uniquement si le username du bot est connu (sinon on omet le bouton, le guide
  // textuel reste). NE remplace PAS le bouton « Activer » (état non lié, ci-dessous).
  const botDirectUrl = botUsername ? `https://t.me/${botUsername}` : null
  if (linked) {
    return (
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="text-success">✅</span> {t('linkedCompact')}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {t('linkedGuide', { bot: botLabel })}
          </p>
        </div>
        {botDirectUrl && (
          <a
            href={botDirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <span aria-hidden="true">📸</span> {t('sendProductButton')}
          </a>
        )}
        {quotaSection}
      </div>
    )
  }

  // ── État NON LIÉ : bloc d'action + quota ────────────────────────────────────
  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{t('title')}</p>
        <p className="mt-1 text-xs text-muted">{t('subtitle')}</p>
      </div>

      {quotaSection}

      {state.code ? (
        <div className="space-y-3">
          {startUrl && (
            <>
              {/* (1) Gros bouton — un clic ouvre Telegram et lie le compte. */}
              <a
                href={startUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t('openTelegramButton')}
              </a>

              {/* (2) QR code du même lien — généré côté client, sans appel externe. */}
              <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-xs text-muted">{t('qrHint')}</p>
                <div className="rounded-lg bg-white p-3">
                  <QRCodeSVG value={startUrl} size={160} />
                </div>
              </div>
            </>
          )}

          {/* (3) Repli textuel discret : /link CODE (si le bouton/QR échoue). */}
          <details className="text-xs text-faint">
            <summary className="cursor-pointer select-none hover:text-muted">
              {t('fallbackToggle')}
            </summary>
            <p className="mt-2 text-muted">{t('instruction', { bot: botLabel })}</p>
            <code className="mt-1 block rounded-lg bg-ink-900 px-4 py-2 text-center font-mono tracking-widest text-cream">
              /link {state.code}
            </code>
          </details>

          <p className="text-xs text-faint">
            {t('codeValidity', { minutes: state.expiresInMinutes ?? 30 })}
          </p>
        </div>
      ) : (
        <form action={action}>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? t('generating') : t('generate')}
          </button>
        </form>
      )}

      {state.error && <p className="mt-3 text-xs text-danger-fg">{state.error}</p>}
    </div>
  )
}
