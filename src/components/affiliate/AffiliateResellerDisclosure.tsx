'use client'

import { useState } from 'react'

/**
 * AffiliateResellerDisclosure — bloc « Prix revendeur » PLIABLE (replié par défaut)
 * sur la fiche affilié. Ligne résumé cliquable + chevron ; au clic, déplie le détail
 * des frais déjà inclus.
 *
 * Accessible clavier : <button> natif + aria-expanded. Strings résolues serveur (déjà
 * formatées en DH par la page — règle #2 : aucune fonction passée au Client). Affichage pur.
 */

export interface AffiliateResellerDisclosureStrings {
  /** Ligne visible, ex. « Prix revendeur : 149 DH — tout compris ». */
  summary: string
  /** Détail déplié, ex. « Produit + livraison 35 + emballage 10 + confirmation 10. Tu n'avances rien. ». */
  detail: string
}

interface Props {
  strings: AffiliateResellerDisclosureStrings
}

export function AffiliateResellerDisclosure({ strings }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6 bg-surface rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-start min-h-[44px]"
      >
        <span className="text-sm font-medium text-foreground">{strings.summary}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <p className="px-4 pb-4 text-xs text-muted leading-relaxed">{strings.detail}</p>
      )}
    </div>
  )
}
