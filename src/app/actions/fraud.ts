'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'

/**
 * Anti-fraude B7 (mig 124) — lève la RETENUE fraude d'une commande après revue admin.
 * Appelle la RPC SECURITY DEFINER `clear_order_fraud_hold` (garde admin/service_role
 * en base) qui trace la levée et, si la commande est déjà réconciliée, approuve
 * immédiatement la commission (rattrapage). Écriture 100 % serveur, réservée admin.
 */
export async function clearOrderFraudHold(
  orderId: string
): Promise<{ error: string | null }> {
  if (!orderId) return { error: 'Commande non spécifiée.' }

  const { supabase, error, userId } = await requireAdmin({ allowAgent: false })
  if (error || !userId) return { error: error ?? 'Erreur.' }

  // RPC mig 124 — pas encore dans les types générés (schéma prod). Cast ciblé typé
  // (aucun `any`), à retirer quand la migration sera appliquée en prod + types régénérés.
  const rpc = supabase.rpc as unknown as (
    fn: 'clear_order_fraud_hold',
    args: { p_order_id: string }
  ) => Promise<{ error: { message: string } | null }>
  const { error: rpcErr } = await rpc('clear_order_fraud_hold', { p_order_id: orderId })
  if (rpcErr) return { error: rpcErr.message }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { error: null }
}
