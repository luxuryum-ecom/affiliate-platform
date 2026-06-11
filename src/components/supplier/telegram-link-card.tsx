'use client'

// ─── Carte de liaison Telegram (autoportante) ────────────────────────────────
//   import { TelegramLinkCard } from '@/components/supplier/telegram-link-card'
//   <TelegramLinkCard initialStatus={await getTelegramLinkStatus()} quota={...} />

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  generateTelegramLinkCode,
  type TelegramLinkState,
} from '@/app/actions/telegram-link'

type Quota = { current: number; max: number; isUnlimited: boolean }

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

  const atLimit = !!quota && !quota.isUnlimited && quota.current >= quota.max
  const nearLimit = !!quota && !quota.isUnlimited && quota.current >= quota.max - 1

  const quotaBlock = quota ? (
    <div className="shrink-0 text-end">
      <p
        className={`text-sm font-semibold ${
          atLimit ? 'text-danger-fg' : nearLimit ? 'text-warning-fg' : 'text-foreground'
        }`}
      >
        {quota.isUnlimited
          ? t('quotaUnlimited', { current: quota.current })
          : t('quotaLabel', { current: quota.current, max: quota.max })}
      </p>
      {(atLimit || nearLimit) && (
        <Link href="/supplier/premium" className="text-xs text-accent-fg underline">
          {t('upgrade')}
        </Link>
      )}
    </div>
  ) : null

  // ── État LIÉ : carte visible compacte + quota ───────────────────────────────
  if (linked) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <span className="text-success">✓</span> {t('linkedCompact')}
          </p>
          <p className="text-xs text-muted mt-0.5 truncate">
            {t('linkedHint')}
            {botUsername ? ` ${botLabel}` : ''}
          </p>
        </div>
        {quotaBlock}
      </div>
    )
  }

  // ── État NON LIÉ : bloc d'action + quota ────────────────────────────────────
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t('title')}</p>
          <p className="mt-1 text-xs text-muted">{t('subtitle')}</p>
        </div>
        {quotaBlock}
      </div>

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
