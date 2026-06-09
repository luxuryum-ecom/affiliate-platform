'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signUp, type AuthState } from '@/app/actions/auth'

const initialState: AuthState = { error: null }

interface SignupFormProps {
  defaultRole: 'affiliate' | 'wholesaler' | 'supplier'
}

export function SignupForm({ defaultRole }: SignupFormProps) {
  const [state, action, isPending] = useActionState(signUp, initialState)
  const t = useTranslations('auth')
  const ts = useTranslations('auth.signup')

  const roleLabel = {
    affiliate: t('roleAffiliate'),
    wholesaler: t('roleWholesaler'),
    supplier: t('roleSupplier'),
  }[defaultRole]

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="role" value={defaultRole} />

      {/* Role badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-2 rounded-full text-xs font-medium text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {roleLabel}
      </div>

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-muted mb-1">
          {ts('fullNameLabel')}
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder={ts('fullNamePlaceholder')}
        />
      </div>

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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-muted mb-1">
          {t('passwordLabel')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder={ts('passwordPlaceholder')}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? ts('submitting') : ts('submit')}
      </button>

      <p className="text-center text-sm text-muted">
        {ts('haveAccount')}{' '}
        <Link href="/login" className="text-foreground font-medium underline underline-offset-2">
          {ts('loginLink')}
        </Link>
      </p>
    </form>
  )
}
