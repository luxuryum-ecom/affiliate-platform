'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { requireAdmin } from './_guards'
import { CATEGORIES_REVALIDATE_TAG } from '@/lib/categories'
import type { ActionState } from '@/types/orders'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

// Catégorie telle que lue pour le panneau admin (toutes colonnes utiles).
export type AdminCategory = {
  id: string
  slug: string
  parent_id: string | null
  label_fr: string
  label_ar: string
  label_en: string
  icon: string | null
  image_url: string | null
  affiliate_allowed: boolean
  active: boolean
  sort_order: number
}

export type CategoryChannelAudit = {
  id: string
  category_id: string
  category_slug: string
  old_value: boolean
  new_value: boolean
  changed_by: string | null
  changed_at: string
}

// Revalide la page admin ET le cache taxonomie (IA d'ingestion). La décision D2
// (products.ts) lit FRAIS → déjà correcte sans cache.
function revalidateCategories() {
  revalidatePath('/admin/categories')
  revalidateTag(CATEGORIES_REVALIDATE_TAG)
}

// ─── READ ─────────────────────────────────────────────────────────────────────

export async function getCategoriesAdmin(): Promise<AdminCategory[]> {
  const supabase = await createClient()
  const { data } = (await supabase
    .from('categories')
    .select(
      'id,slug,parent_id,label_fr,label_ar,label_en,icon,image_url,affiliate_allowed,active,sort_order',
    )
    .order('sort_order')) as { data: AdminCategory[] | null; error: unknown }
  return data ?? []
}

export async function getCategoryChannelAudit(categoryId: string): Promise<CategoryChannelAudit[]> {
  const supabase = await createClient()
  const { data } = (await supabase
    .from('category_channel_audit')
    .select('*')
    .eq('category_id', categoryId)
    .order('changed_at', { ascending: false })) as {
    data: CategoryChannelAudit[] | null
    error: unknown
  }
  return data ?? []
}

// ─── CREATE (catégorie parente OU sous-catégorie selon parent_id) ─────────────

export async function createCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  // slug = nom canonique FR (décision : match exact products.category, zéro backfill).
  const label_fr = (formData.get('label_fr') as string)?.trim()
  const label_ar = (formData.get('label_ar') as string)?.trim()
  const label_en = (formData.get('label_en') as string)?.trim()
  const icon = (formData.get('icon') as string | null)?.trim() || null
  const image_url = (formData.get('image_url') as string | null)?.trim() || null
  const parent_id = (formData.get('parent_id') as string | null)?.trim() || null
  const sortRaw = parseInt(formData.get('sort_order') as string, 10)
  const sort_order = Number.isInteger(sortRaw) && sortRaw >= 0 ? sortRaw : 0

  if (!label_fr) return fail('Le nom FR (canonique) est requis.')
  if (!label_ar) return fail('Le libellé arabe est requis.')
  if (!label_en) return fail('Le libellé anglais est requis.')

  // parent_id, si fourni, doit exister ET être une catégorie parente (pas de niveau 3).
  if (parent_id) {
    const { data: parent } = (await supabase
      .from('categories')
      .select('id,parent_id')
      .eq('id', parent_id)
      .maybeSingle()) as { data: { id: string; parent_id: string | null } | null; error: unknown }
    if (!parent) return fail('Catégorie parente introuvable.')
    if (parent.parent_id !== null) return fail('Une sous-catégorie ne peut pas avoir de sous-catégorie.')
  }

  // affiliate_allowed VOLONTAIREMENT non fourni → défaut false (grossiste, fail-closed).
  // Passer en affilié = action auditée dédiée (setCategoryAffiliateAllowed).
  const { error } = await supabase.from('categories').insert({
    slug: label_fr,
    parent_id,
    label_fr,
    label_ar,
    label_en,
    icon,
    image_url,
    sort_order,
  })

  if (error) {
    if (error.code === '23505') return fail(`La catégorie « ${label_fr} » existe déjà à ce niveau.`)
    return fail(error.message)
  }

  revalidateCategories()
  return ok
}

// ─── UPDATE (libellés / icône / image / ordre — JAMAIS slug ni affiliate_allowed) ─

export async function updateCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const id = (formData.get('id') as string)?.trim()
  const label_fr = (formData.get('label_fr') as string)?.trim()
  const label_ar = (formData.get('label_ar') as string)?.trim()
  const label_en = (formData.get('label_en') as string)?.trim()
  const icon = (formData.get('icon') as string | null)?.trim() || null
  const image_url = (formData.get('image_url') as string | null)?.trim() || null
  const sortRaw = parseInt(formData.get('sort_order') as string, 10)

  if (!id) return fail('ID catégorie manquant.')
  if (!label_fr) return fail('Le nom FR est requis.')
  if (!label_ar) return fail('Le libellé arabe est requis.')
  if (!label_en) return fail('Le libellé anglais est requis.')

  // slug NON modifié (clé de jointure products.category) ; affiliate_allowed NON
  // modifiable ici (action auditée dédiée + trigger DB).
  const patch: Record<string, unknown> = {
    label_fr,
    label_ar,
    label_en,
    icon,
    image_url,
    updated_at: new Date().toISOString(),
  }
  if (Number.isInteger(sortRaw) && sortRaw >= 0) patch.sort_order = sortRaw

  const { error } = await supabase.from('categories').update(patch).eq('id', id)
  if (error) return fail(error.message)

  revalidateCategories()
  return ok
}

// ─── TOGGLE ACTIVE (le trigger DB protège 'Autres' contre la désactivation) ───

export async function toggleCategoryActive(id: string, active: boolean): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)
  if (!id) return fail('ID catégorie manquant.')

  const { error } = await supabase
    .from('categories')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return fail(error.message)

  revalidateCategories()
  return ok
}

// ─── REORDER ────────────────────────────────────────────────────────────────

export async function setCategorySortOrder(id: string, sortOrder: number): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)
  if (!id) return fail('ID catégorie manquant.')
  if (!Number.isInteger(sortOrder) || sortOrder < 0) return fail('Ordre invalide.')

  const { error } = await supabase
    .from('categories')
    .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return fail(error.message)

  revalidateCategories()
  return ok
}

// ─── DELETE (refus si enfants OU produits liés ; 'Autres' protégé par trigger) ─

export async function deleteCategory(id: string): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)
  if (!id) return fail('ID catégorie manquant.')

  const { data: cat } = (await supabase
    .from('categories')
    .select('slug,parent_id')
    .eq('id', id)
    .maybeSingle()) as { data: { slug: string; parent_id: string | null } | null; error: unknown }
  if (!cat) return fail('Catégorie introuvable.')

  // Refus si des sous-catégories existent.
  const { count: childCount } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
  if ((childCount ?? 0) > 0) return fail('Supprimez d’abord les sous-catégories.')

  // Refus si des produits référencent ce slug (catégorie OU sous-catégorie).
  const column = cat.parent_id === null ? 'category' : 'subcategory'
  const { count: prodCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq(column, cat.slug)
  if ((prodCount ?? 0) > 0)
    return fail('Des produits utilisent cette catégorie — désactivez-la plutôt que de la supprimer.')

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return fail(error.message)

  revalidateCategories()
  return ok
}

// ─── 🔴 POINT SENSIBLE — CHANGER LE CANAL (D2), ATOMIQUE + AUDITÉ ─────────────
// Passe par la RPC `set_category_affiliate_allowed` (SECURITY DEFINER) : gate admin,
// booléen explicite (décision POSITIVE), UPDATE + audit immuable atomiques. Le
// trigger DB interdit tout autre chemin. La décision D2 (products.ts) lit FRAIS.

export async function setCategoryAffiliateAllowed(
  categoryId: string,
  allowed: boolean,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)
  if (!categoryId) return fail('ID catégorie manquant.')
  // Booléen STRICT (jamais null/undefined → pas d'élargissement par erreur).
  if (allowed !== true && allowed !== false) return fail('Valeur de canal invalide.')

  const { error } = await supabase.rpc('set_category_affiliate_allowed', {
    p_category_id: categoryId,
    p_allowed: allowed,
  })
  if (error) return fail(error.message)

  revalidateCategories()
  return ok
}
