'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { regenerateCourierAccessCode } from '@/app/actions/courier-access'
import { CourierCopyLinkButton } from './courier-copy-link-button'

interface CourierRegenerateLinkProps {
  /** Données sérialisables uniquement — l'action est importée directement
   *  (RÈGLE ABSOLUE CLAUDE.md #2). */
  courierId: string
}

/**
 * Génère / régénère le lien d'accès cloisonné du livreur (mig 127 — le code
 * n'est plus jamais stocké en clair, seul un hash SHA-256 + TTL 30j sont en
 * base). `regenerateCourierAccessCode` ne renvoie le code en clair QU'UNE
 * FOIS : on le garde en state local (jamais persisté, jamais renvoyé au
 * serveur) le temps de l'afficher/copier, avec un avertissement explicite.
 * Remplace l'ancien affichage statique de `courier.accessCode` (souvent null
 * désormais — on ne s'appuie plus dessus).
 */
export function CourierRegenerateLink({ courierId }: CourierRegenerateLinkProps) {
  const t = useTranslations('admin.couriers')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null)

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const res = await regenerateCourierAccessCode(courierId)
      if (res.error || !res.code) {
        setError(res.error ?? 'Erreur.')
        return
      }
      const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
      setResult({ url: `${base}/courier/scan?code=${res.code}`, expiresAt: res.expiresAt ?? '' })
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('accessLinkHelp')}</p>

      {result ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2">
            {t('newLinkWarning')}
          </p>
          <code className="block text-xs bg-surface-2 rounded-lg px-3 py-2 text-foreground break-all">
            {result.url}
          </code>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CourierCopyLinkButton url={result.url} strings={{ copy: t('copyLink'), copied: t('copiedLink') }} />
            {result.expiresAt && (
              <span className="text-[11px] text-muted">
                {t('expiresLabel', { date: result.expiresAt.slice(0, 10) })}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('noLinkVisible')}</p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending}
        className="text-xs px-3 py-1.5 rounded-lg border border-line bg-surface text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? t('regenerating') : t('regenerateButton')}
      </button>

      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  )
}
