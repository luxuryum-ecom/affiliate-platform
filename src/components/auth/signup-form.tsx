'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signUp, type AuthState } from '@/app/actions/auth'
import { SUPPLIER_COUNTRIES } from '@/lib/supplier-countries'

const initialState: AuthState = { error: null }

interface NicheOption {
  value: string
  label: string
  icon: string
}

interface SignupFormProps {
  defaultRole: 'affiliate' | 'wholesaler' | 'supplier'
  /** Options de niche déclarée (grossiste). Vide pour les autres rôles. */
  nicheOptions?: NicheOption[]
}

export function SignupForm({ defaultRole, nicheOptions = [] }: SignupFormProps) {
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
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
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

      {defaultRole === 'supplier' && (
        <div>
          <label htmlFor="country_code" className="block text-sm font-medium text-muted mb-1">
            {ts('countryLabel')} <span className="text-danger">*</span>
          </label>
          <select
            id="country_code"
            name="country_code"
            required
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          >
            <option value="" disabled>{ts('countryPlaceholder')}</option>
            {SUPPLIER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.label} ({c.currency})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            {ts('countryHelp')}
          </p>
        </div>
      )}

      {(defaultRole === 'supplier' || defaultRole === 'wholesaler') && (
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-muted mb-1">
            {ts('phoneLabel')} <span className="text-danger">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint text-start"
            placeholder={ts('phonePlaceholder')}
          />
          <p className="mt-1 text-xs text-muted">{ts('phoneHelp')}</p>
        </div>
      )}

      {defaultRole === 'wholesaler' && nicheOptions.length > 0 && (
        <div>
          <label htmlFor="declared_niche" className="block text-sm font-medium text-muted mb-1">
            {ts('nicheLabel')} <span className="text-faint">{ts('nicheOptional')}</span>
          </label>
          <select
            id="declared_niche"
            name="declared_niche"
            defaultValue=""
            disabled={isPending}
            className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          >
            <option value="">{ts('nichePlaceholder')}</option>
            {nicheOptions.map((n) => (
              <option key={n.value} value={n.value}>
                {n.icon} {n.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">{ts('nicheHelp')}</p>
        </div>
      )}

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
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
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
