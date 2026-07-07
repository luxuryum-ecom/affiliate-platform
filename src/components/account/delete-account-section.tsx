'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { requestAccountDeletion, type DeleteAccountState } from '@/app/actions/account'

const initialState: DeleteAccountState = { error: null }

/**
 * B8/RGPD — zone « supprimer mon compte ». Case de confirmation OBLIGATOIRE
 * (garde-fou anti-clic) ; sur succès la server action anonymise + déconnecte +
 * redirige. i18n FR/AR/EN. Aucune fonction transmise (strings seulement).
 */
export function DeleteAccountSection() {
  const t = useTranslations('account.delete')
  const te = useTranslations('errors')
  const [state, action, isPending] = useActionState(requestAccountDeletion, initialState)

  const errorText = state.error
    ? state.error.startsWith('errors.')
      ? te(state.error.slice('errors.'.length))
      : state.error
    : null

  return (
    <div className="bg-surface rounded-xl border border-danger p-5">
      <h2 className="text-sm font-semibold text-danger-fg mb-1">{t('title')}</h2>
      <p className="text-xs text-muted mb-4">{t('subtitle')}</p>

      <form action={action} className="space-y-3">
        <label className="flex items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            name="confirm"
            required
            disabled={isPending}
            className="mt-0.5 accent-danger"
          />
          <span>{t('confirmLabel')}</span>
        </label>

        {errorText && (
          <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
            {errorText}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-danger text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? t('deleting') : t('button')}
        </button>
      </form>
    </div>
  )
}
