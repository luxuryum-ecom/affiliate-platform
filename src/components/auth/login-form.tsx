'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signIn, type AuthState } from '@/app/actions/auth'

const initialState: AuthState = { error: null }

export function LoginForm() {
  const [state, action, isPending] = useActionState(signIn, initialState)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-muted mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder="vous@exemple.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-muted mb-1">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-line rounded-lg text-sm bg-surface text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 disabled:bg-surface-2 disabled:text-faint"
          placeholder="Votre mot de passe"
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
        {isPending ? 'Connexion…' : 'Se connecter'}
      </button>

      <p className="text-center text-sm text-muted">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="text-foreground font-medium underline underline-offset-2">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  )
}
