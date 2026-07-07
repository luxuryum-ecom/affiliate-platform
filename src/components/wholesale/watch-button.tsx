'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { toggleWatch, type WatchState } from '@/app/actions/watch'

/**
 * V5 — bouton « Suivre le prix » / « Suivi ». L'état initial (suit déjà ou non)
 * est résolu SERVEUR et passé en prop ; l'action bascule et renvoie l'état
 * résultant. i18n FR/AR/EN. Aucune fonction transmise (uniquement des strings).
 */
export function WatchButton({
  supplierProductId,
  initialWatching,
}: {
  supplierProductId: string
  initialWatching: boolean
}) {
  const t = useTranslations('wholesale.watch')
  const [state, action, isPending] = useActionState<WatchState, FormData>(toggleWatch, {
    error: null,
    watching: initialWatching,
  })

  const watching = state.watching

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="supplierProductId" value={supplierProductId} />
      <button
        type="submit"
        disabled={isPending}
        aria-pressed={watching}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium w-full transition-colors disabled:opacity-50 ${
          watching
            ? 'bg-accent-soft text-accent-fg border border-gold-300'
            : 'bg-surface-2 text-foreground border border-line hover:border-gold-300'
        }`}
      >
        <span aria-hidden>{watching ? '🔔' : '🔕'}</span>
        {watching ? t('following') : t('follow')}
      </button>
      {state.error === null && watching && (
        <p className="text-xs text-faint mt-1.5 text-center">{t('followingHint')}</p>
      )}
    </form>
  )
}
