// src/components/shared/category-showcase.tsx
// Server Component — aucune logique client, aucune fonction passée en prop.
// Grandes cartes-images de navigation par rayon (clients peu lettrés).
// Affichage PUR : ne reçoit que des strings sérialisables (RÈGLE ABSOLUE #2).

import Link from 'next/link'

export interface CategoryCardData {
  /** Valeur canonique (= valeur DB, passée dans l'URL). */
  value: string
  /** Libellé localisé (résolu côté serveur). */
  label: string
  /** URL complète du lien (construite côté serveur). */
  href: string
  /** Chemin de l'image-rayon self-hostée (/categories/xxx.webp). */
  image: string
  /** Emoji icône — couche de repli si l'image manque/échoue. */
  icon: string
  /** true si cette catégorie est la catégorie active. */
  isActive: boolean
}

/** Une grande carte-image cliquable. Fallback emoji posé DERRIÈRE l'image (CSS pur, zéro JS). */
function CategoryCard({ card }: { card: CategoryCardData }) {
  return (
    <Link
      href={card.href}
      className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border transition-colors ${
        card.isActive ? 'border-gold-300 ring-2 ring-gold-400' : 'border-line hover:border-gold-300'
      }`}
    >
      {/* Couche de repli : emoji centré, visible si l'image ne charge pas. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center bg-surface-2 text-5xl"
      >
        {card.icon}
      </div>
      {/* Image-rayon (recouvre le fallback si elle charge). */}
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      {/* Dégradé noir bas → transparent pour la lisibilité du libellé or. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      {/* Libellé localisé. */}
      <span className="absolute inset-x-0 bottom-0 p-2.5 text-sm font-semibold leading-tight text-white sm:text-base">
        {card.label}
      </span>
    </Link>
  )
}

interface CategoryShowcaseProps {
  cards: CategoryCardData[]
  /**
   * 'scroll' = carrousel horizontal sur mobile, grille sur ≥sm (en-tête marketplace,
   * pour ne pas repousser la grille produit de 6 rangées sur mobile).
   * 'grid'  = grille pleine sur toutes tailles (page dédiée /categories).
   */
  layout: 'scroll' | 'grid'
}

export function CategoryShowcase({ cards, layout }: CategoryShowcaseProps) {
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <CategoryCard key={card.value} card={card} />
        ))}
      </div>
    )
  }

  // layout 'scroll' : rangée scrollable sur mobile (-mx-4 pour border-to-border),
  // grille à partir de sm. Aucune carte coupée, scroll tactile fluide.
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.value} className="w-36 shrink-0 snap-start sm:w-auto sm:shrink">
          <CategoryCard card={card} />
        </div>
      ))}
    </div>
  )
}
