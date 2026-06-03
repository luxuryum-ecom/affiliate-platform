import type { Product, ProductAvailabilityType } from '@/types/database'

export type WholesaleCtaMode = 'direct' | 'rfq'

/** Internal catalogue product (`products` table). */
export function getCatalogProductCtaMode(
  availabilityType: ProductAvailabilityType
): WholesaleCtaMode {
  return availabilityType === 'import_on_demand' ? 'rfq' : 'direct'
}

/** Supplier marketplace listing (`supplier_products`). */
export function getSupplierProductCtaMode(product: {
  availability_type: ProductAvailabilityType
  suggested_wholesale_price_mad: number | null
  stock_quantity: number | null
  min_quantity: number
}): WholesaleCtaMode {
  if (product.availability_type === 'import_on_demand') return 'rfq'

  const hasPrice =
    product.suggested_wholesale_price_mad != null && product.suggested_wholesale_price_mad > 0
  const hasStock = product.stock_quantity != null && product.stock_quantity > 0
  const hasMoq = product.min_quantity >= 1

  if (hasPrice && hasStock && hasMoq) return 'direct'
  return 'rfq'
}

export function normalizeCatalogLookupName(name: string): string {
  return name.trim().toLowerCase()
}

/** Match marketplace public title to an internal catalogue row for cart checkout. */
export function catalogNameMatchesProduct(
  catalogProduct: Pick<Product, 'name'>,
  lookupName: string
): boolean {
  return normalizeCatalogLookupName(catalogProduct.name) === normalizeCatalogLookupName(lookupName)
}
