// src/components/shared/category-rail.tsx
// Server Component — aucune logique client, aucune fonction passée en prop.

import Link from 'next/link'

export interface CategoryChip {
  /** Valeur canonique (= valeur DB, passée dans l'URL). */
  value: string
  /** Libellé localisé (résolu côté serveur). */
  label: string
  /** Emoji icône. */
  icon: string
  /** true si ce chip est la catégorie active. */
  isActive: boolean
  /** URL complète du lien (construite côté serveur). */
  href: string
}

interface CategoryRailProps {
  chips: CategoryChip[]
  /** URL pour « Toutes » (sans filtre catégorie). */
  allHref: string
  /** Libellé localisé pour « Toutes ». */
  allLabel: string
  /** true si aucune catégorie n'est active (= "Toutes" est actif). */
  isAllActive: boolean
}

export function CategoryRail({ chips, allHref, allLabel, isAllActive }: CategoryRailProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
      {/* Chip "Toutes" */}
      <Link
        href={allHref}
        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
          isAllActive
            ? 'bg-accent-soft border-gold-300 text-accent-fg'
            : 'bg-surface border-line text-muted hover:border-gold-300 hover:text-foreground'
        }`}
      >
        {allLabel}
      </Link>

      {/* Chips catégories */}
      {chips.map((chip) => (
        <Link
          key={chip.value}
          href={chip.href}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
            chip.isActive
              ? 'bg-accent-soft border-gold-300 text-accent-fg'
              : 'bg-surface border-line text-muted hover:border-gold-300 hover:text-foreground'
          }`}
        >
          <span aria-hidden="true">{chip.icon}</span>
          {chip.label}
        </Link>
      ))}
    </div>
  )
}
