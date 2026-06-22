import { createClient } from '@/lib/supabase/server'

/**
 * Shared auth guard for admin server actions.
 * Returns the Supabase client and the authenticated userId so callers
 * do not create a second client instance.
 *
 * Usage:
 *   const { supabase, error, userId } = await requireAdmin()
 *   if (error || !userId) return { error: error ?? 'Erreur.' }
 *
 * Pass { allowAgent: true } to also accept the 'agent' role.
 */
export async function requireAdmin({ allowAgent = false }: { allowAgent?: boolean } = {}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Non authentifié.', userId: null }

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null; error: unknown }

  const allowed = allowAgent
    ? profile?.role === 'admin' || profile?.role === 'agent'
    : profile?.role === 'admin'

  if (!allowed) {
    return { supabase, error: 'Accès réservé aux administrateurs.', userId: null }
  }

  return { supabase, error: null, userId: user.id }
}

/**
 * Capacités modulables connues (mig 083 staff_permissions, allowlist CHECK + RPC).
 * Union littérale → toute typo est bloquée au compile-time (finding @security P2-2).
 * AJOUTER une capacité ici ET dans la migration (CHECK + allowlist RPC) ET le code.
 *
 * 'validate_categories'      — valider la file de suggestions de catégories (mig 083)
 * 'manage_country_sourcing'  — accès aux demandes de sourcing filtrées par pays (mig 086)
 * 'confirm_cod_orders'       — confirmation des commandes COD (mig 087)
 * 'confirm_affiliate_orders' — confirmation des commandes affiliés (mig 087)
 * 'confirm_wholesale_orders' — confirmation des commandes grossistes B2B (mig 087)
 */
export type StaffCapability =
  | 'validate_categories'
  | 'manage_country_sourcing'
  | 'confirm_cod_orders'
  | 'confirm_affiliate_orders'
  | 'confirm_wholesale_orders'

/**
 * Guard for a granular, admin-grantable capability (mig 083 staff_permissions).
 * Admin passes unconditionally (superuser). Otherwise the `has_capability` RPC
 * (SECURITY DEFINER) checks the caller's staff_permissions row for `capability`.
 *
 * Usage:
 *   const { supabase, error, userId, isAdmin } = await requireCapability('validate_categories')
 *   if (error || !userId) return { error: error ?? 'Permission requise.' }
 */
export async function requireCapability(capability: StaffCapability) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Non authentifié.', userId: null, isAdmin: false }

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null; error: unknown }

  if (profile?.role === 'admin') {
    return { supabase, error: null, userId: user.id, isAdmin: true }
  }

  const { data: hasCap } = (await supabase.rpc('has_capability', {
    p_capability: capability,
  })) as { data: boolean | null; error: unknown }

  if (!hasCap) {
    return { supabase, error: 'Permission requise.', userId: null, isAdmin: false }
  }

  return { supabase, error: null, userId: user.id, isAdmin: false }
}
