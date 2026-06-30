'use server'

/**
 * Actions ÉTROITES réservées au superviseur de volet "Commandes".
 *
 * PÉRIMÈTRE STRICTEMENT LIMITÉ :
 *  - confirmOrderAsSupervisor    → orders      : pending_confirmation → confirmed UNIQUEMENT
 *  - confirmWholesaleAsSupervisor → wholesale_orders : pending → confirmed UNIQUEMENT
 *
 * GARANTIES ABSOLUES :
 *  - AUCUNE colonne financière touchée (cod_received, commission, ledger, prix).
 *  - Le statut `delivered` est inatteignable : whitelist stricte de la transition cible.
 *  - Le trigger handle_order_delivered (mig 052) ne peut jamais être déclenché ici :
 *    il ne s'arme QUE sur status='delivered', état inatteignable depuis 'confirmed'.
 *  - Délégation au RPC confirm_cod_order (mig 088, SECURITY DEFINER) qui porte
 *    le gate d'autorisation (has_capability par canal), le verrou FOR UPDATE,
 *    la whitelist statut, la réservation stock et l'UPDATE étroit.
 *  - Défense en profondeur applicative : validation zod + guard requireCapability
 *    côté serveur AVANT l'appel RPC (le RPC reste l'autorité finale).
 *  - service_role jamais utilisé ici.
 */

import { revalidatePath } from 'next/cache'
import { requireCapability } from './_guards'
import { notifyOrderConfirmed } from '@/lib/notifications/order-created'
import { isFsmTransitionAllowed } from '@/lib/wholesale-fsm'
import type { ActionState } from '@/types/orders'
import type { WholesaleOrderStatus } from '@/types/database'
import { z } from 'zod'

const ok: ActionState  = { error: null, success: true }
const fail = (msg: string): ActionState => ({ error: msg, success: false })

// ── Validation zod ────────────────────────────────────────────────────────────
const OrderIdSchema = z.string().uuid('ID commande invalide.')

// ── Mapping clés d'erreur RPC → messages affichables ─────────────────────────
// Les exceptions du RPC lèvent 'errors.<clé>' (pattern mig 061).
// On extrait la clé et on mappe vers un message utilisateur.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  'errors.unauthenticated':     'Non authentifié.',
  'errors.order_not_found':     'Commande introuvable.',
  'errors.forbidden':           'Permission insuffisante pour confirmer cette commande.',
  'errors.invalid_status':      "Cette action n'est autorisée que sur les commandes en attente de confirmation.",
  'errors.insufficient_stock':  'Stock insuffisant pour confirmer la commande.',
  'errors.update_failed':       'Mise à jour échouée (race condition ou statut modifié). Veuillez réessayer.',
}

function mapRpcError(message: string): string {
  const key = message.match(/errors\.[a-z_]+/)?.[0] ?? ''
  return RPC_ERROR_MESSAGES[key] ?? message
}

// =============================================================================
// COD / AFFILIÉ — confirmOrderAsSupervisor
// =============================================================================

/**
 * Confirme une commande COD (affiliate_id IS NULL) ou affiliée (affiliate_id NOT NULL).
 * Transition autorisée UNIQUEMENT : pending_confirmation → confirmed.
 *
 * Délègue au RPC confirm_cod_order (mig 088, SECURITY DEFINER) qui :
 *   - Vérifie la capacité selon le canal (confirm_cod_orders / confirm_affiliate_orders).
 *   - Pose un verrou FOR UPDATE sur la commande.
 *   - Valide le statut (whitelist stricte pending_confirmation uniquement).
 *   - Réserve le stock via reserve_stock() (mig 004).
 *   - Met à jour status='confirmed' + confirmed_at UNIQUEMENT.
 *   - Retourne TRUE ou lève une exception nommée 'errors.<clé>'.
 *
 * Plus de faux succès : on ne retourne ok() QUE si le RPC retourne TRUE sans erreur.
 * Aucune colonne financière touchée ni ici ni dans le RPC.
 */
export async function confirmOrderAsSupervisor(
  orderId: string,
): Promise<ActionState> {
  // ── 1. Validation zod de l'input ────────────────────────────────────────────
  const parsed = OrderIdSchema.safeParse(orderId)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  // ── 2. Défense en profondeur applicative : guard avant appel RPC ───────────
  // L'utilisateur doit avoir AU MOINS UNE des deux capacités de confirmation COD.
  // Le RPC est l'autorité finale ; ce guard est une première barrière applicative
  // (évite un aller-retour DB inutile si l'utilisateur n'a clairement aucun droit).
  const guardCod = await requireCapability('confirm_cod_orders')
  const guardAff = await requireCapability('confirm_affiliate_orders')

  const hasAnyCap = guardCod.userId !== null || guardAff.userId !== null
  if (!hasAnyCap) return fail('Permission requise.')

  // Utiliser le client du premier guard valide pour appeler le RPC.
  const { supabase, userId } =
    guardCod.userId !== null ? guardCod : guardAff

  if (!userId) return fail('Non authentifié.')

  // ── 3. Délégation au RPC SECURITY DEFINER (mig 088) ───────────────────────
  // Le RPC porte : gate has_capability par canal, verrou FOR UPDATE,
  // whitelist statut, reserve_stock(), UPDATE statut+confirmed_at UNIQUEMENT.
  // Il retourne TRUE en succès, ou lève une exception nommée 'errors.<clé>'.
  const { data: confirmed, error: rpcErr } = await supabase.rpc(
    'confirm_cod_order',
    { p_order_id: parsed.data },
  )

  // ── 4. Contrôle du résultat : PLUS DE FAUX SUCCÈS ─────────────────────────
  // On ne retourne ok() QUE si le RPC a retourné TRUE sans erreur.
  // Toute exception RPC est une erreur réelle (rollback atomique Postgres).
  if (rpcErr) {
    return fail(mapRpcError(rpcErr.message ?? 'errors.update_failed'))
  }

  // Le RPC retourne boolean ; on vérifie explicitement TRUE.
  // Si pour une raison inattendue il retourne false/null → échec signalé.
  if (confirmed !== true) {
    return fail('Confirmation échouée (résultat inattendu du RPC). Veuillez réessayer.')
  }

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${parsed.data}`)
  revalidatePath('/admin/orders-confirm')

  // LOT 1B — notification COD confirmée (best-effort, post-commit, ne touche aucun montant).
  await notifyOrderConfirmed(parsed.data)

  return ok
}

// =============================================================================
// GROS — confirmWholesaleAsSupervisor
// =============================================================================

/**
 * Confirme une commande grossiste.
 * Transition autorisée UNIQUEMENT : pending → confirmed (via RPC transition existant).
 *
 * Le RPC `transition_wholesale_order_status` (mig 061) ne touche aucune colonne
 * financière — comme documenté dans orders.ts:848.
 * Les états delivered, cancelled, payment* restent hors d'atteinte : la FSM le garantit
 * ET la whitelist d'entrée ici bloque toute tentative de passer newStatus = autre chose.
 *
 * État de départ attendu : 'pending' (seul état initial non-financier confirmable).
 * État cible fixé à 'confirmed' par cette action (pas de paramètre).
 */
export async function confirmWholesaleAsSupervisor(
  orderId: string,
): Promise<ActionState> {
  // ── Input validation ────────────────────────────────────────────────────────
  const parsed = OrderIdSchema.safeParse(orderId)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  // ── Guard capacité ─────────────────────────────────────────────────────────
  const { supabase, error: authError, userId } =
    await requireCapability('confirm_wholesale_orders')
  if (authError || !userId) return fail(authError ?? 'Non authentifié.')

  // ── Lecture statut courant ─────────────────────────────────────────────────
  const { data: order, error: fetchErr } = (await supabase
    .from('wholesale_orders')
    .select('status')
    .eq('id', parsed.data)
    .single()) as { data: { status: WholesaleOrderStatus } | null; error: unknown }

  if (fetchErr || !order) return fail('Commande grossiste introuvable.')

  // ── WHITELIST STATUT : UNIQUEMENT pending → confirmed ─────────────────────
  // 'confirmed' est la seule transition de "confirmation" non-financière dans la FSM.
  // La FSM autorise pending → confirmed (WHOLESALE_ORDER_FSM:16).
  if (order.status !== 'pending') {
    return fail("Cette action n'est autorisee que sur les commandes grossistes en attente.")
  }

  const targetStatus: WholesaleOrderStatus = 'confirmed'

  // Vérification FSM (défense en profondeur — le RPC re-vérifie côté DB)
  if (!isFsmTransitionAllowed(order.status, targetStatus)) {
    return fail('Transition non autorisée par la FSM.')
  }

  // ── Délégation au RPC existant (mig 061) — AUCUNE colonne financière ──────
  const { error: rpcErr } = await supabase.rpc('transition_wholesale_order_status', {
    p_order_id:   parsed.data,
    p_new_status: targetStatus,
    p_notes:      null,
  })

  if (rpcErr) {
    const msg = rpcErr.message ?? 'errors.update_failed'
    const key = msg.match(/errors\.[a-z_]+/)?.[0] ?? 'errors.update_failed'
    return fail(key)
  }

  revalidatePath('/admin/wholesale-orders')
  revalidatePath(`/admin/wholesale-orders/${parsed.data}`)
  revalidatePath('/admin/orders-confirm')

  return ok
}
