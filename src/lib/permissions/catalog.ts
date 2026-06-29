/**
 * Catalogue data-driven des capacités et volets de permissions.
 *
 * Fichier PUR — pas de 'use server', pas d'import serveur.
 * Importable côté client ET serveur.
 *
 * Capacités définies dans _guards.ts (StaffCapability) et protégées par
 * la contrainte CHECK de la migration 106 (dernier sur-ensemble).
 */

import type { StaffCapability } from '@/app/actions/_guards'

// ─── Volets ──────────────────────────────────────────────────────────────────

export type VoletId = 'commandes' | 'sourcing' | 'categories' | 'stock' | 'depot'

export type Volet = {
  id: VoletId
  /** Clé i18n câblée par le sous-lot C (admin.permissionsV2.volet.<id>) */
  labelKey: string
  capabilities: StaffCapability[]
}

export const ALL_VOLETS: Volet[] = [
  {
    id: 'commandes',
    labelKey: 'admin.permissionsV2.volet.commandes',
    capabilities: [
      'confirm_cod_orders',
      'confirm_affiliate_orders',
      'confirm_wholesale_orders',
      'assign_orders',
    ],
  },
  {
    id: 'sourcing',
    labelKey: 'admin.permissionsV2.volet.sourcing',
    capabilities: ['manage_country_sourcing'],
  },
  {
    id: 'categories',
    labelKey: 'admin.permissionsV2.volet.categories',
    capabilities: ['validate_categories'],
  },
  {
    id: 'stock',
    labelKey: 'admin.permissionsV2.volet.stock',
    capabilities: ['manage_stock'],
  },
  {
    id: 'depot',
    labelKey: 'admin.permissionsV2.volet.depot',
    capabilities: [
      'depot_reception',
      'depot_packing',
      'depot_shipping',
      'depot_confirmation',
      'depot_supervision',
    ],
  },
]

// ─── Capacités ────────────────────────────────────────────────────────────────

export type CapabilityMeta = {
  id: StaffCapability
  volet: VoletId
  /** Clé i18n du libellé court (admin.permissionsV2.cap.<id>.label) */
  labelKey: string
  /** Clé i18n de la description longue (admin.permissionsV2.cap.<id>.desc) */
  descKey: string
}

export const ALL_CAPABILITIES: CapabilityMeta[] = [
  {
    id: 'confirm_cod_orders',
    volet: 'commandes',
    labelKey: 'admin.permissionsV2.cap.confirm_cod_orders.label',
    descKey: 'admin.permissionsV2.cap.confirm_cod_orders.desc',
  },
  {
    id: 'confirm_affiliate_orders',
    volet: 'commandes',
    labelKey: 'admin.permissionsV2.cap.confirm_affiliate_orders.label',
    descKey: 'admin.permissionsV2.cap.confirm_affiliate_orders.desc',
  },
  {
    id: 'confirm_wholesale_orders',
    volet: 'commandes',
    labelKey: 'admin.permissionsV2.cap.confirm_wholesale_orders.label',
    descKey: 'admin.permissionsV2.cap.confirm_wholesale_orders.desc',
  },
  {
    id: 'assign_orders',
    volet: 'commandes',
    labelKey: 'admin.permissionsV2.cap.assign_orders.label',
    descKey: 'admin.permissionsV2.cap.assign_orders.desc',
  },
  {
    id: 'manage_country_sourcing',
    volet: 'sourcing',
    labelKey: 'admin.permissionsV2.cap.manage_country_sourcing.label',
    descKey: 'admin.permissionsV2.cap.manage_country_sourcing.desc',
  },
  {
    id: 'validate_categories',
    volet: 'categories',
    labelKey: 'admin.permissionsV2.cap.validate_categories.label',
    descKey: 'admin.permissionsV2.cap.validate_categories.desc',
  },
  {
    id: 'manage_stock',
    volet: 'stock',
    labelKey: 'admin.permissionsV2.cap.manage_stock.label',
    descKey: 'admin.permissionsV2.cap.manage_stock.desc',
  },
  {
    id: 'depot_reception',
    volet: 'depot',
    labelKey: 'admin.permissionsV2.cap.depot_reception.label',
    descKey: 'admin.permissionsV2.cap.depot_reception.desc',
  },
  {
    id: 'depot_packing',
    volet: 'depot',
    labelKey: 'admin.permissionsV2.cap.depot_packing.label',
    descKey: 'admin.permissionsV2.cap.depot_packing.desc',
  },
  {
    id: 'depot_shipping',
    volet: 'depot',
    labelKey: 'admin.permissionsV2.cap.depot_shipping.label',
    descKey: 'admin.permissionsV2.cap.depot_shipping.desc',
  },
  {
    id: 'depot_confirmation',
    volet: 'depot',
    labelKey: 'admin.permissionsV2.cap.depot_confirmation.label',
    descKey: 'admin.permissionsV2.cap.depot_confirmation.desc',
  },
  {
    id: 'depot_supervision',
    volet: 'depot',
    labelKey: 'admin.permissionsV2.cap.depot_supervision.label',
    descKey: 'admin.permissionsV2.cap.depot_supervision.desc',
  },
]

// ─── Helpers purs ────────────────────────────────────────────────────────────

/** Toutes les capacités d'un volet donné. Retourne [] si voletId inconnu. */
export function capabilitiesOfVolet(voletId: VoletId): StaffCapability[] {
  return ALL_VOLETS.find((v) => v.id === voletId)?.capabilities ?? []
}

/** Volet auquel appartient une capacité. Retourne undefined si inconnue. */
export function voletOfCapability(cap: StaffCapability): Volet | undefined {
  return ALL_VOLETS.find((v) => v.capabilities.includes(cap))
}

/** Set de toutes les capacités connues — pour validation en O(1). */
export const ALL_CAPABILITY_IDS: ReadonlySet<string> = new Set(
  ALL_CAPABILITIES.map((c) => c.id),
)

/** Vérifie qu'une chaîne est une capacité connue (type guard). */
export function isValidCapability(cap: string): cap is StaffCapability {
  return ALL_CAPABILITY_IDS.has(cap)
}
