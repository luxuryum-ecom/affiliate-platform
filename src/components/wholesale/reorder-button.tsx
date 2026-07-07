'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { reorderLastOrder, type CartState } from '@/app/actions/cart'

const initialState: CartState = { error: null, success: false }

/**
 * AM-1 — « Recommander ma dernière commande ». Sur succès, l'action serveur
 * REDIRIGE vers le panier (aucun état de succès à gérer ici) ; on n'affiche donc
 * qu'un éventuel message d'erreur, mappé depuis une clé i18n.
 */
export function ReorderButton() {
  const t = useTranslations('wholesale.orders')
  const te = useTranslations('errors')
  const [state, action, isPending] = useActionState(reorderLastOrder, initialState)

  const errorText = state.error
    ? state.error.startsWith('errors.')
      ? te(state.error.slice('errors.'.length))
      : state.error
    : null

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 2v6h6" />
          <path d="M3 8a9 9 0 1 0 2.6-5.7L3 8" />
        </svg>
        {isPending ? t('reorderPending') : t('reorderButton')}
      </button>
      {errorText && <p className="text-xs text-danger-fg">{errorText}</p>}
    </form>
  )
}
