/** Shared across order actions and components. */
export type ActionState = { error: string | null; success: boolean }

export type OrderFormState = {
  error: string | null
  success: boolean
  orderId: string | null
  /**
   * WMS-1 (095) : présent quand le stock était insuffisant au moment de la commande.
   * La vente passe toujours (OPTION A) — valeur : 'restocking'.
   * Le frontend peut afficher un message d'information non bloquant.
   * L'alerte admin est gérée côté SQL par record_anomaly.
   */
  warning?: 'restocking'
}

export const LOW_STOCK_THRESHOLD = 5
