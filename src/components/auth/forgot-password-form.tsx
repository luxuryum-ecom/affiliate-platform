'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { requestPasswordReset, type PasswordResetState } from '@/app/actions/auth'

const initialState: PasswordResetState = { sent: false, error: null }

interface ForgotPasswordFormProps {
  backToLoginLabel: string
}

export function ForgotPasswordForm({ backToLoginLabel }: ForgotPasswordFormProps) {
  const [state, action, isPending] = useActionState(requestPasswordReset, initialState)
  const t = useTranslations('auth')
  const tf = useTranslations('auth.forgotPassword')

  if (state.sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">{tf('sent')}</p>
        <Link
          href="/login"
          className="block text-center text-sm text-gold-400 underline underline-offset-2"
        >
          {backToLoginLabel}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-muted mb-1">
          {t('emailLabel')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder={t('emailPlaceholder')}
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
        {isPending ? tf('submitting') : tf('submit')}
      </button>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-foreground font-medium underline underline-offset-2">
          {backToLoginLabel}
        </Link>
      </p>
    </form>
  )
}
