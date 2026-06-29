'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

/**
 * One-time admin bootstrap action.
 * Promotes the currently authenticated user to role=admin, status=approved.
 *
 * SÉCURITÉ (correctif escalade de privilège) :
 *  - Une server action est un endpoint POST invocable INDÉPENDAMMENT de la page
 *    (le garde « localhost » de bootstrap/page.tsx ne protège PAS l'action).
 *  - GARDE ANTI-ESCALADE : si un administrateur existe DÉJÀ en base, l'action
 *    REFUSE et ne change aucun rôle. C'est donc un vrai bootstrap one-time : seul
 *    le tout premier compte (quand aucun admin n'existe) peut s'auto-promouvoir.
 *  - Le comptage des admins se fait via le client service_role (bypass RLS) pour
 *    ne jamais « rater » un admin existant que l'appelant ne verrait pas.
 *  - Uses the service-role client to bypass RLS for the write.
 */
export async function promoteToAdmin(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  // GARDE : refuser si un admin existe déjà (bootstrap one-time). Comptage en
  // service_role pour voir TOUS les admins, indépendamment de la RLS de l'appelant.
  const { count: adminCount, error: countErr } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  // FAIL-CLOSED : on ne promeut QUE si le comptage a RÉUSSI et qu'AUCUN admin
  // n'existe. Toute erreur ou count indéterminé (null) → REFUS, aucune écriture.
  // (Sinon une erreur de comptage rouvrirait la faille d'escalade : count null →
  //  promotion à tort.)
  if (countErr || adminCount == null || adminCount > 0) {
    redirect('/dashboard')
  }

  // Aucun admin en base → premier bootstrap légitime.
  const { error: updErr } = await adminClient
    .from('profiles')
    .update({ role: 'admin', status: 'approved' })
    .eq('id', user.id)

  // Écriture échouée → ne pas prétendre que la promotion a réussi.
  if (updErr) redirect('/dashboard')

  redirect('/admin/dashboard')
}
