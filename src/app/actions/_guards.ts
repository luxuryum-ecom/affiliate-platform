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
