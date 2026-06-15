// =============================================================================
// FSM — TABLE DE TRANSITIONS AUTORISÉES des commandes grossistes (LOT 2 — M-1)
// =============================================================================
//
// SOURCE DE VÉRITÉ des transitions de statut. Importée par l'action serveur
// (updateWholesaleOrderStatus / assignWholesaleOrder) ET réutilisable côté front
// (DRY). Module pur : AUCUN « use server » ici — un fichier server action ne peut
// exporter que des fonctions async, pas une constante objet (sinon build Next KO).
//
// Règle : tout état absent ou avec tableau vide est terminal (aucune sortie).

import type { WholesaleOrderStatus } from '@/types/database'

export const WHOLESALE_ORDER_FSM: Record<WholesaleOrderStatus, WholesaleOrderStatus[]> = {
  // ── Cycle Deliveroo-style (LOT 1 / migration 057) ─────────────────────────
  pending:            ['assigned', 'confirmed', 'cancelled'],
  assigned:           ['supplier_confirmed', 'cancelled'],
  supplier_confirmed: ['preparing', 'cancelled'],
  preparing:          ['ready', 'cancelled'],
  ready:              ['picked_up', 'cancelled'],
  picked_up:          ['dispatched', 'cancelled'],
  dispatched:         ['delivered', 'cancelled'],
  // ── Cycle legacy (migrations 004) — conservé rétro-compat ─────────────────
  confirmed:          ['sourcing', 'assigned', 'cancelled'],
  sourcing:           ['shipped', 'cancelled'],
  shipped:            ['delivered', 'cancelled'],
  // ── États terminaux — aucune sortie ───────────────────────────────────────
  delivered:          [],
  cancelled:          [],
}

/**
 * Returns true when the transition from → to is allowed by the FSM.
 */
export function isFsmTransitionAllowed(
  from: WholesaleOrderStatus,
  to: WholesaleOrderStatus
): boolean {
  return (WHOLESALE_ORDER_FSM[from] ?? []).includes(to)
}
