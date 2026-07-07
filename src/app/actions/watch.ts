'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── V5 — Watchlist grossiste (suivre un produit pour l'alerte de prix) ──────
//
// SÉCURITÉ : client RLS-scoped (jamais service_role). Les policies mig 118
// garantissent que le grossiste ne lit/écrit QUE ses propres suivis
// (buyer_id = auth.uid()). On ne suit qu'un produit VISIBLE (approuvé).

export interface WatchState {
  error: string | null
  watching: boolean
}

/**
 * Bascule le suivi d'un produit fournisseur : suit → arrête, non suivi → suit.
 * Renvoie l'état RÉSULTANT (`watching`). Ne touche aucun prix ni calcul.
 */
export async function toggleWatch(
  _prevState: WatchState,
  formData: FormData,
): Promise<WatchState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthenticated', watching: false }

  const supplierProductId = (formData.get('supplierProductId') as string)?.trim()
  if (!supplierProductId) return { error: 'errors.product_not_found', watching: false }

  // Le produit doit être VISIBLE (approuvé) — via la vue redacted grossiste.
  const { data: prod } = (await supabase
    .from('supplier_products_wholesaler_read')
    .select('id, approval_status')
    .eq('id', supplierProductId)
    .maybeSingle()) as { data: { id: string; approval_status: string } | null }

  if (!prod || prod.approval_status !== 'approved') {
    return { error: 'errors.product_not_found', watching: false }
  }

  // Suit déjà ?
  const { data: existing } = (await supabase
    .from('product_watches')
    .select('id')
    .eq('buyer_id', user.id)
    .eq('supplier_product_id', supplierProductId)
    .maybeSingle()) as { data: { id: string } | null }

  if (existing) {
    const { error } = await supabase
      .from('product_watches')
      .delete()
      .eq('id', existing.id)
      .eq('buyer_id', user.id)
    if (error) return { error: 'errors.update_failed', watching: true }
    revalidatePath(`/wholesale/marketplace/${supplierProductId}`)
    return { error: null, watching: false }
  }

  const { error } = await supabase
    .from('product_watches')
    .insert({ buyer_id: user.id, supplier_product_id: supplierProductId })
  if (error) {
    // Course possible (double clic) → contrainte unique : on considère « suivi ».
    if ((error as { code?: string }).code === '23505') {
      return { error: null, watching: true }
    }
    return { error: 'errors.update_failed', watching: false }
  }

  revalidatePath(`/wholesale/marketplace/${supplierProductId}`)
  return { error: null, watching: true }
}

/** Le grossiste courant suit-il ce produit ? (lecture RLS own-only). */
export async function isWatching(supplierProductId: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = (await supabase
    .from('product_watches')
    .select('id')
    .eq('buyer_id', user.id)
    .eq('supplier_product_id', supplierProductId)
    .maybeSingle()) as { data: { id: string } | null }

  return data != null
}
