'use client'

// ─── Carte de liaison Telegram (autoportante) ────────────────────────────────
// À monter dans n'importe quelle page fournisseur :
//   import { TelegramLinkCard } from '@/components/supplier/telegram-link-card'
//   <TelegramLinkCard initialStatus={await getTelegramLinkStatus()} />

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  generateTelegramLinkCode,
  type TelegramLinkState,
} from '@/app/actions/telegram-link'

export function TelegramLinkCard({ initialStatus }: { initialStatus?: TelegramLinkState }) {
  const t = useTranslations('supplier.telegramLink')
  const [state, action, isPending] = useActionState(
    generateTelegramLinkCode,
    initialStatus ?? { error: null },
  )

  const botUsername = state.botUsername ?? initialStatus?.botUsername ?? null
  const botLabel = botUsername ? `@${botUsername}` : t('botFallback')

  // ── État LIÉ : ligne discrète (plus de gros bloc vert) ──────────────────────
  if (state.linked || initialStatus?.linked) {
    return (
      <p className="text-xs text-muted flex items-center gap-1.5">
        <span className="text-success font-semibold">✓</span>
        <span className="font-medium text-foreground">{t('linkedCompact')}</span>
        <span className="text-line">·</span>
        <span className="text-faint">{t('linkedHint')}{botUsername ? ` ${botLabel}` : ''}</span>
      </p>
    )
  }

  // ── État NON LIÉ : bloc d'action ────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-sm font-semibold text-foreground">{t('title')}</p>
      <p className="mt-1 text-xs text-muted">{t('subtitle')}</p>

      {state.code ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted">{t('instruction', { bot: botLabel })}</p>
          <code className="block rounded-lg bg-ink-900 px-4 py-3 text-center text-lg font-mono tracking-widest text-cream">
            /link {state.code}
          </code>
          <p className="text-xs text-faint">
            {t('codeValidity', { minutes: state.expiresInMinutes ?? 30 })}
          </p>
        </div>
      ) : (
        <form action={action} className="mt-4">
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
