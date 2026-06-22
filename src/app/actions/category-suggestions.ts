'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { requireCapability } from './_guards'
import { CATEGORIES_REVALIDATE_TAG } from '@/lib/categories'
import type { ActionState } from '@/types/orders'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

const CAP = 'validate_categories' as const

// ─── Types d'affichage (champs NON sensibles uniquement) ─────────────────────
export type PendingSuggestion = {
  suggestion_id: string
  proposed_label: string
  created_at: string
  supplier_product_id: string
  product_name: string
  product_photo: string | null
  current_category: string
  current_subcategory: string
}

export type FilingCategory = {
  id: string
  slug: string
  parent_id: string | null
  label_fr: string
  label_ar: string
  label_en: string
}

function revalidateSuggestions() {
  revalidatePath('/admin/categories/suggestions')
  // Création/rangement modifient la taxonomie → invalide le cache IA d'ingestion.
  revalidateTag(CATEGORIES_REVALIDATE_TAG)
  revalidatePath('/admin/categories')
}

// ─── READ ────────────────────────────────────────────────────────────────────

/** File des suggestions en attente (lecture redacted SECURITY DEFINER, mig 085). */
export async function getPendingSuggestions(): Promise<PendingSuggestion[]> {
  const supabase = await createClient()
  const { data } = (await supabase.rpc('list_pending_category_suggestions')) as {
    data: PendingSuggestion[] | null
    error: unknown
  }
  return data ?? []
}

/** Catégories actives (pour « ranger dans une catégorie existante »). */
export async function getActiveCategoriesForFiling(): Promise<FilingCategory[]> {
  const supabase = await createClient()
  const { data } = (await supabase
    .from('categories')
    .select('id,slug,parent_id,label_fr,label_ar,label_en')
    .eq('active', true)
    .order('parent_id', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })) as {
    data: FilingCategory[] | null
    error: unknown
  }
  return data ?? []
}

// ─── ACTIONS (toutes gated requireCapability) ────────────────────────────────

/** Créer une NOUVELLE catégorie (affiliate_allowed=false forcé côté RPC) + ranger le produit. */
export async function createCategoryFromSuggestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireCapability(CAP)
  if (authError) return fail(authError)

  const suggestionId = (formData.get('suggestion_id') as string)?.trim()
  const label_fr = (formData.get('label_fr') as string)?.trim()
  const label_ar = (formData.get('label_ar') as string)?.trim()
  const label_en = (formData.get('label_en') as string)?.trim()
  const parent_id = (formData.get('parent_id') as string | null)?.trim() || null

  if (!suggestionId) return fail('Suggestion manquante.')
  if (!label_fr) return fail('Le nom FR (canonique) est requis.')
  if (!label_ar) return fail('Le libellé arabe est requis.')
  if (!label_en) return fail('Le libellé anglais est requis.')

  const { error } = await supabase.rpc('validator_create_category', {
    p_suggestion_id: suggestionId,
    p_label_fr: label_fr,
    p_label_ar: label_ar,
    p_label_en: label_en,
    p_parent_id: parent_id,
  })
  if (error) return fail(error.message)

  revalidateSuggestions()
  return ok
}

/** Ranger le produit dans une catégorie EXISTANTE. */
export async function fileSuggestionIntoCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireCapability(CAP)
  if (authError) return fail(authError)

  const suggestionId = (formData.get('suggestion_id') as string)?.trim()
  const categoryId = (formData.get('category_id') as string)?.trim()
  if (!suggestionId) return fail('Suggestion manquante.')
  if (!categoryId) return fail('Catégorie cible requise.')

  const { error } = await supabase.rpc('validator_resolve_suggestion', {
    p_suggestion_id: suggestionId,
    p_category_id: categoryId,
  })
  if (error) return fail(error.message)

  revalidateSuggestions()
  return ok
}

/** Rejeter la suggestion (le produit reste sur « Autres », le filet). */
export async function rejectSuggestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireCapability(CAP)
  if (authError) return fail(authError)

  const suggestionId = (formData.get('suggestion_id') as string)?.trim()
  if (!suggestionId) return fail('Suggestion manquante.')

  const { error } = await supabase.rpc('validator_reject_suggestion', {
    p_suggestion_id: suggestionId,
  })
  if (error) return fail(error.message)

  revalidateSuggestions()
  return ok
}
