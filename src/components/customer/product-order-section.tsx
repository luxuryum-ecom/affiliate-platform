'use client'

import { useState } from 'react'
import { VariantSelector } from '@/components/product/variant-selector'
import { CodOrderForm } from '@/components/customer/cod-order-form'
import type { ProductVariant, VariantAvailability } from '@/components/product/variant-selector'

interface ProductOrderSectionProps {
  productId: string
  affiliateIdFromUrl: string | null
  productName: string
  sellPrice: number
  maxQty: number
  variants: ProductVariant[]
  defaultVariantId: string | null
  variantStrings: {
    chooseOption: string
    unavailable: string
    variantLabel: string
  }
  orderSectionTitle: string
  /**
   * Dict variantId → dispo, construit côté serveur (strings i18n déjà résolues).
   * Aucune fonction — données sérialisables uniquement.
   */
  availabilityByVariant: Record<string, VariantAvailability>
  /**
   * Dispo de repli quand aucune variante n'est sélectionnée ou identifiée
   * (ex : produit sans variantes → dérivé de product.stock_count côté serveur).
   */
  defaultAvailability: VariantAvailability
}

/**
 * Lot B : wrapper Client qui possède l'état de la variante sélectionnée.
 * Relie VariantSelector (onSelect) et CodOrderForm (variantId) côté client.
 * Toutes les données passées sont sérialisables (règle CLAUDE.md #2 respectée).
 */
export function ProductOrderSection({
  productId,
  affiliateIdFromUrl,
  productName,
  sellPrice,
  maxQty,
  variants,
  defaultVariantId,
  variantStrings,
  orderSectionTitle,
  availabilityByVariant,
  defaultAvailability,
}: ProductOrderSectionProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId)

  const hasVariants =
    variants.filter((v) => v.attributes && Object.keys(v.attributes).length > 0).length > 1

  // Dispo de la variante sélectionnée — source : dict serveur (sérialisable).
  // Fallback sur defaultAvailability si la variante n'est pas dans le dict
  // (ex : aucune variante, ou variante sans stock_count indexé).
  const currentAvail =
    (selectedVariantId != null && availabilityByVariant[selectedVariantId]) ||
    defaultAvailability

  // Étape 7.B — cap input COD basé sur la VARIANTE sélectionnée (source de vérité, mig 105) :
  // le stock de la variante remplace l'agrégat produit (maxQty prop). Fallback agrégat
  // si aucune variante identifiée (produit simple). Données locales, aucune fonction au Client.
  const selectedVariant =
    selectedVariantId != null ? variants.find((v) => v.id === selectedVariantId) ?? null : null
  const effectiveMaxQty = selectedVariant ? Math.max(selectedVariant.stock_count, 0) : maxQty

  return (
    <div className="space-y-5">
      {/* Badge dispo variante-aware — remplace l'agrégat produit du Server Component. */}
      <div className="flex flex-wrap items-center gap-2">
        {currentAvail.inStock ? (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              currentAvail.lowStock
                ? 'bg-warning-soft text-warning-fg'
                : 'bg-surface-2 text-muted'
            }`}
          >
            {currentAvail.label}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-danger-soft text-danger-fg">
            {currentAvail.label}
          </span>
        )}
      </div>

      {hasVariants && (
        <VariantSelector
          variants={variants}
          strings={variantStrings}
          onSelect={setSelectedVariantId}
        />
      )}

      <div className="bg-surface border border-line rounded-2xl p-5 shadow-premium">
        <h2 className="text-sm font-semibold text-foreground mb-4">{orderSectionTitle}</h2>
        <CodOrderForm
          productId={productId}
          affiliateIdFromUrl={affiliateIdFromUrl}
          productName={productName}
          sellPrice={sellPrice}
          maxQty={effectiveMaxQty}
          variantId={selectedVariantId}
        />
      </div>
    </div>
  )
}
