'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type AuthState } from '@/app/actions/auth'

const initialState: AuthState = { error: null }

const ROLE_LABELS: Record<string, string> = {
  affiliate: 'Affiliation — dropshipping COD',
  wholesaler: 'Achat en gros — B2B',
}

interface SignupFormProps {
  defaultRole: 'affiliate' | 'wholesaler'
}

export function SignupForm({ defaultRole }: SignupFormProps) {
  const [state, action, isPending] = useActionState(signUp, initialState)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="role" value={defaultRole} />

      {/* Role badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {ROLE_LABELS[defaultRole]}
      </div>

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
          Nom complet
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="Mohamed Benali"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="vous@exemple.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          disabled={isPending}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          placeholder="8 caractères minimum"
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
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Création du compte…' : 'Créer mon compte'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Déjà inscrit ?{' '}
        <Link href="/login" className="text-gray-900 font-medium underline underline-offset-2">
          Se connecter
        </Link>
      </p>
    </form>
  )
}
