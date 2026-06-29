/**
 * Liste des types d'action du journal d'audit (LOT 1E).
 *
 * Fichier PUR — pas de 'use server'. Importable client ET serveur (le filtre UI
 * et la page le consomment). Les libellés i18n sont en `admin.audit.action.<id>`.
 */
export const AUDIT_ACTIONS = [
  'order_status_change',
  'order_assign_agent',
  'order_assign_supplier',
  'cod_order_status_change',
  'promote_to_agent',
  'login',
] as const

export type AuditActionId = (typeof AUDIT_ACTIONS)[number]
