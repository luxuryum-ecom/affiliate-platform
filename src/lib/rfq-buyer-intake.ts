export const BUYER_PURCHASE_PROFILES = [
  'physical_store',
  'social_reseller',
  'wholesaler',
  'importer',
] as const

export type BuyerPurchaseProfile = (typeof BUYER_PURCHASE_PROFILES)[number]

export const BUYER_VOLUME_TIERS = [
  'test_20_50',
  'small_100_300',
  'active_500_1000',
  'importer_1000_plus',
] as const

export type BuyerVolumeTier = (typeof BUYER_VOLUME_TIERS)[number]

export const PURCHASE_PROFILE_LABELS: Record<BuyerPurchaseProfile, string> = {
  physical_store: 'Boutique physique',
  social_reseller: 'Instagram / Facebook Shop',
  wholesaler: 'E-commerce / Distributeur',
  importer: 'Importateur',
}

export const VOLUME_TIER_LABELS: Record<BuyerVolumeTier, string> = {
  test_20_50: '🚀 Test marché (20-50 pcs)',
  small_100_300: '🏪 Revendeur actif (100-300 pcs)',
  active_500_1000: '📦 Grossiste (500-1000 pcs)',
  importer_1000_plus: '🏭 Importateur / Marque privée (1000+ pcs)',
}

export function isBuyerPurchaseProfile(v: string): v is BuyerPurchaseProfile {
  return (BUYER_PURCHASE_PROFILES as readonly string[]).includes(v)
}

export function isBuyerVolumeTier(v: string): v is BuyerVolumeTier {
  return (BUYER_VOLUME_TIERS as readonly string[]).includes(v)
}

export function labelPurchaseProfile(v: string | null | undefined): string {
  if (!v || !isBuyerPurchaseProfile(v)) return '—'
  return PURCHASE_PROFILE_LABELS[v]
}

export function labelVolumeTier(v: string | null | undefined): string {
  if (!v || !isBuyerVolumeTier(v)) return '—'
  return VOLUME_TIER_LABELS[v]
}
