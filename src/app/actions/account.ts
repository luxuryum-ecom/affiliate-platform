'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { anonymizedProfileFields } from '@/lib/account/anonymize'

// ─── B8 / RGPD — Suppression de compte (anonymisation) ───────────────────────
//
// Self-service : l'utilisateur AUTHENTIFIÉ supprime SON PROPRE compte. On
// anonymise sa PII (profil) et on bloque sa connexion côté auth (ban + email
// anonymisé). Les commandes/ledger gardent leur buyer_id (intégrité comptable).
//
// SÉCURITÉ : le service_role n'est utilisé QUE côté serveur, borné à `user.id`
// (l'id de l'appelant authentifié) — jamais un id fourni par le client. Un admin
// ne peut PAS s'auto-supprimer (éviter d'orpheliner la plateforme).

export type DeleteAccountState = { error: string | null }

export async function requestAccountDeletion(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'errors.unauthenticated' }

  // Confirmation explicite obligatoire (case cochée) — garde-fou anti-clic.
  if (formData.get('confirm') !== 'on') {
    return { error: 'errors.confirmation_required' }
  }

  // Rôle courant (RLS own) — un admin ne peut pas s'auto-supprimer.
  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null }

  if (profile?.role === 'admin') {
    return { error: 'errors.admin_cannot_self_delete' }
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // 1. AUTH D'ABORD (finding @security P1-3) : anonymiser l'email + BANNIR la
  //    connexion. Si ça échoue, on N'ANONYMISE PAS le profil → aucun état
  //    partiel, l'opération est intégralement réessayable (rien n'a bougé).
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    email: `deleted-${user.id}@deleted.invalid`,
    user_metadata: {},
    ban_duration: '876600h', // ~100 ans
  })
  if (authErr) {
    console.error('account deletion: auth anonymize/ban failed', user.id, authErr.message)
    return { error: 'errors.update_failed' }
  }

  // 2. Anonymiser la PII du profil (borné à l'id de l'appelant). Si ça échoue, la
  //    connexion est DÉJÀ bloquée (ban + email anonymisé) — on remonte l'erreur ;
  //    un nouvel appel ré-anonymise le profil (idempotent, sans dommage).
  const { error: profErr } = await admin
    .from('profiles')
    .update(anonymizedProfileFields(nowIso))
    .eq('id', user.id)
  if (profErr) return { error: 'errors.update_failed' }

  // 3. Révoquer TOUTES les sessions (finding @security P1-2 : scope global — sinon
  //    un JWT déjà émis sur un autre appareil resterait valide jusqu'à expiration).
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login?deleted=1')
}
