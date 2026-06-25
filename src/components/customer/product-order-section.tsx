'use client'

import { useState } from 'react'
import { VariantSelector } from '@/components/product/variant-selector'
import { CodOrderForm } from '@/components/customer/cod-order-form'
import type { ProductVariant } from '@/components/product/variant-selector'

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
}: ProductOrderSectionProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(defaultVariantId)

  const hasVariants =
    variants.filter((v) => v.attributes && Object.keys(v.attributes).length > 0).length > 1

  return (
    <div className="space-y-5">
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
          maxQty={maxQty}
          variantId={selectedVariantId}
        />
      </div>
    </div>
  )
}
