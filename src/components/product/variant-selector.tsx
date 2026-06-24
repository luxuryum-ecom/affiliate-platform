'use client'

import { useState } from 'react'

export interface ProductVariant {
  id: string
  attributes: Record<string, string>
  is_default: boolean
  stock_count: number
}

interface VariantSelectorProps {
  variants: ProductVariant[]
  /** i18n strings resolved server-side */
  strings: {
    chooseOption: string
    unavailable: string
    variantLabel: string
  }
}

/**
 * Display-only variant selector — Étape 3 (affichage seul, sans soumission de commande).
 * Retourne null si ≤ 1 variante ou si toutes les variantes sont la variante défaut sans attributs.
 */
export function VariantSelector({ variants, strings }: VariantSelectorProps) {
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

  return <VariantSelectorInner variants={meaningful} axes={axes} strings={strings} />
}

// Composant interne séparé pour isoler useState (évite les règles de hooks conditionnelles).
function VariantSelectorInner({
  variants,
  axes,
  strings,
}: {
  variants: ProductVariant[]
  axes: string[]
  strings: VariantSelectorProps['strings']
}) {
  // Sélection initiale : valeurs de la variante défaut, ou premières valeurs disponibles.
  const defaultVariant = variants.find((v) => v.is_default) ?? variants[0]
  const initialSelection: Record<string, string> = {}
  for (const axis of axes) {
    initialSelection[axis] = defaultVariant?.attributes[axis] ?? ''
  }

  const [selection, setSelection] = useState<Record<string, string>>(initialSelection)

  // Trouve la variante correspondant à la sélection courante.
  const selectedVariant = variants.find((v) =>
    axes.every((axis) => v.attributes[axis] === selection[axis]),
  )

  const isUnavailable =
    selectedVariant != null && selectedVariant.stock_count <= 0

  const handleChange = (axis: string, value: string) => {
    setSelection((prev) => ({ ...prev, [axis]: value }))
  }

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

      {isUnavailable && (
        <p
          role="alert"
          className="text-xs text-warning-fg bg-warning-soft border border-warning rounded-lg px-3 py-2"
        >
          {strings.unavailable}
        </p>
      )}
    </div>
  )
}
