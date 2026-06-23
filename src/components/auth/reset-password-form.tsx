'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { updatePassword, type UpdatePasswordState } from '@/app/actions/auth'

const initialState: UpdatePasswordState = { success: false, error: null }

interface ResetPasswordFormProps {
  /** Pré-résolu côté serveur : indique si une session recovery est active. */
  hasSession: boolean
  expiredLabel: string
  requestNewLabel: string
}

export function ResetPasswordForm({ hasSession, expiredLabel, requestNewLabel }: ResetPasswordFormProps) {
  const [state, action, isPending] = useActionState(updatePassword, initialState)
  const tr = useTranslations('auth.resetPassword')

  if (!hasSession) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted leading-relaxed">{expiredLabel}</p>
        <Link
          href="/forgot-password"
          className="block text-center text-sm text-gold-400 underline underline-offset-2"
        >
          {requestNewLabel}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-muted mb-1">
          {tr('newPasswordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder={tr('newPasswordPlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-muted mb-1">
          {tr('confirmLabel')}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder={tr('confirmPlaceholder')}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? tr('submitting') : tr('submit')}
      </button>
    </form>
  )
}
