'use client'

import { useState } from 'react'

export interface ProductVariant {
  id: string
  attributes: Record<string, string>
  is_default: boolean
  stock_count: number
}

/**
 * Dispo par variante — calculée côté SERVEUR (strings i18n déjà résolues).
 * Passée en prop sérialisable ; jamais de fonction.
 */
export interface VariantAvailability {
  inStock: boolean
  lowStock: boolean
  /** String i18n déjà résolue côté serveur (ex: "12 unités" / "Épuisé"). */
  label: string
}

interface VariantSelectorProps {
  variants: ProductVariant[]
  /** i18n strings resolved server-side */
  strings: {
    chooseOption: string
    unavailable: string
    variantLabel: string
  }
  /** Lot B : appelé quand la sélection change — Client→Client uniquement (pas depuis Server Component). */
  onSelect?: (variantId: string) => void
  /**
   * Dictionnaire variantId → disponibilité, construit côté serveur.
   * Quand fourni, remplace le fallback `isUnavailable` par un affichage inline
   * de la dispo de la variante sélectionnée (stock count ou "épuisé").
   * Aucune fonction : toutes les strings sont déjà i18n-résolues côté serveur.
   */
  availabilityByVariant?: Record<string, VariantAvailability>
}

/**
 * Variant selector — Étape 3 (affichage) + Lot B (câblage commande via onSelect).
 * Retourne null si ≤ 1 variante ou si toutes les variantes sont la variante défaut sans attributs.
 */
export function VariantSelector({ variants, strings, onSelect, availabilityByVariant }: VariantSelectorProps) {
  // Filtre : garde uniquement les variantes ayant au moins un attribut renseigné.
  const meaningful = variants.filter(
    (v) => v.attributes && Object.keys(v.attributes).length > 0,
  )

  // Caché si pas de variantes significatives (cas actuel : 1 seule variante attributes={}).
  if (meaningful.length <= 1) return null

  // Dérive les axes (ex: "taille", "couleur") depuis toutes les variantes.
  const axes = Array.from(
    new Set(meaningful.flatMap((v) => Object.keys(v.attributes))),
  )

  return <VariantSelectorInner variants={meaningful} axes={axes} strings={strings} onSelect={onSelect} availabilityByVariant={availabilityByVariant} />
}

// Composant interne séparé pour isoler useState (évite les règles de hooks conditionnelles).
function VariantSelectorInner({
  variants,
  axes,
  strings,
  onSelect,
  availabilityByVariant,
}: {
  variants: ProductVariant[]
  axes: string[]
  strings: VariantSelectorProps['strings']
  onSelect?: (variantId: string) => void
  availabilityByVariant?: Record<string, VariantAvailability>
}) {
  const defaultVariant = variants.find((v) => v.is_default) ?? variants[0]
  const initialSelection: Record<string, string> = {}
  for (const axis of axes) {
    initialSelection[axis] = defaultVariant?.attributes[axis] ?? ''
  }

  const [selection, setSelection] = useState<Record<string, string>>(initialSelection)

  const selectedVariant = variants.find((v) =>
    axes.every((axis) => v.attributes[axis] === selection[axis]),
  )

  const isUnavailable =
    selectedVariant != null && selectedVariant.stock_count <= 0

  const handleChange = (axis: string, value: string) => {
    const next = { ...selection, [axis]: value }
    setSelection(next)
    if (onSelect) {
      const matched = variants.find((v) => axes.every((a) => v.attributes[a] === next[a]))
      if (matched) onSelect(matched.id)
    }
  }

  // Dispo de la variante sélectionnée (depuis le dict serveur si fourni).
  const currentAvail =
    availabilityByVariant && selectedVariant
      ? (availabilityByVariant[selectedVariant.id] ?? null)
      : null

  return (
    <div className="space-y-3" aria-label={strings.variantLabel}>
      {axes.map((axis) => {
        // Valeurs distinctes pour cet axe.
        const values = Array.from(
          new Set(variants.map((v) => v.attributes[axis]).filter(Boolean)),
        )

        // Label : première lettre en majuscule.
        const label = axis.charAt(0).toUpperCase() + axis.slice(1)

        return (
          <div key={axis} className="flex flex-col gap-1.5">
            <label
              htmlFor={`variant-axis-${axis}`}
              className="text-xs font-medium text-muted"
            >
              {label}
            </label>
            <select
              id={`variant-axis-${axis}`}
              value={selection[axis] ?? ''}
              onChange={(e) => handleChange(axis, e.target.value)}
              className="w-full rounded-lg border border-line bg-surface text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold-400 transition-colors"
            >
              <option value="" disabled>
                {strings.chooseOption}
              </option>
              {values.map((val) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      {/* Affichage dispo variante :
          — quand availabilityByVariant fourni : label i18n déjà résolu côté serveur
          — sinon : fallback sur le signal isUnavailable existant */}
      {currentAvail != null ? (
        <p
          className={`text-xs font-medium ${
            !currentAvail.inStock
              ? 'text-danger-fg'
              : currentAvail.lowStock
                ? 'text-warning-fg'
                : 'text-success-fg'
          }`}
        >
          {currentAvail.label}
        </p>
      ) : isUnavailable ? (
        <p
          role="alert"
          className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2"
        >
          {strings.unavailable}
        </p>
      ) : null}
    </div>
  )
}
