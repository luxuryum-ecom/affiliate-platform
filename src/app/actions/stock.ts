'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { ActionState } from '@/types/orders'

const fail = (msg: string): ActionState => ({ error: msg, success: false })

// ─── Schéma de validation zod ────────────────────────────────────────────────

const AdjustStockSchema = z.object({
  productId: z.string().uuid({ message: 'ID produit invalide.' }),
  qtyDelta:  z.number().int({ message: 'La quantité doit être un entier.' })
               .refine((v) => v !== 0, { message: 'Le delta ne peut pas être zéro.' }),
  note:      z.string().max(500).optional(),
})

export type AdjustStockInput = z.infer<typeof AdjustStockSchema>

// ─── adjustStock — ajustement manuel gardé par manage_stock ─────────────────

/**
 * Ajustement manuel du stock d'un produit.
 *
 * Gated par la capacité `manage_stock` (admin ou salarié avec la capacité).
 * La vérification est déléguée à la RPC SECURITY DEFINER `adjust_stock_manual`
 * qui re-vérifie `has_capability('manage_stock')` côté SQL — défense en profondeur.
 *
 * WMS-1 OPTION A : le solde peut devenir négatif (ajustement négatif intentionnel).
 *
 * Retourne le nouveau solde dans `data.newBalance`.
 */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<ActionState & { data?: { newBalance: number } }> {
  // ── Validation zod ────────────────────────────────────────────────────────
  const parsed = AdjustStockSchema.safeParse(input)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return fail(firstError?.message ?? 'Données invalides.')
  }
  const { productId, qtyDelta, note } = parsed.data

  // ── Auth — doit être authentifié ──────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  // ── Appel RPC SECURITY DEFINER ────────────────────────────────────────────
  // La RPC vérifie has_capability('manage_stock') et journalise en une seule tx.
  const { data: newBalance, error } = (await supabase.rpc('adjust_stock_manual', {
    p_product_id: productId,
    p_qty_delta:  qtyDelta,
    p_actor:      user.id,
    p_note:       note ?? null,
  })) as { data: number | null; error: { message: string } | null }

  if (error) {
    // Erreurs connues remontées depuis la RPC.
    if (error.message.includes('errors.forbidden')) {
      return fail('Permission requise : manage_stock.')
    }
    if (error.message.includes('errors.product_not_found')) {
      return fail('Produit introuvable.')
    }
    if (error.message.includes('errors.stock_delta_zero')) {
      return fail('Le delta ne peut pas être zéro.')
    }
    return fail(`Erreur ajustement stock : ${error.message}`)
  }

  return { error: null, success: true, data: { newBalance: newBalance ?? 0 } }
}
