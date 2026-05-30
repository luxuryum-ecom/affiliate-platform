import type { ImportShippingMode, ImportPriceUnit } from '@/types/database'

export const SHIPPING_MODE_LABELS: Record<ImportShippingMode, string> = {
  air_door_to_door_kg: 'Aérien door-to-door / kg',
  sea_textile_kg:      'Maritime textile / kg',
  sea_volume_cbm:      'Maritime volume carton / CBM',
}

/** Unit is deterministic from shipping mode — never ask the user. */
export function unitFromShippingMode(mode: ImportShippingMode): ImportPriceUnit {
  return mode === 'sea_volume_cbm' ? 'cbm' : 'kg'
}
