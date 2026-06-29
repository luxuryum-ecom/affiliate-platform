'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserStatus } from '@/types/database'
import { isSupplierCountryCode } from '@/lib/supplier-countries'
import { requireAdmin } from './_guards'

export async function updateUserStatus(formData: FormData): Promise<void> {
  const profileId = (formData.get('profileId') as string)?.trim()
  const status = formData.get('status') as UserStatus

  if (!profileId || !['approved', 'rejected'].includes(status)) return

  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase
    .from('profiles')
    .update({ status })
    .eq('id', profileId)
    .in('role', ['affiliate', 'wholesaler', 'supplier'])

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
}

/**
 * Toggle wholesale_access on any approved user profile.
 * Admin-only. Allows granting B2B access to affiliates without changing their role.
 */
export async function toggleWholesaleAccess(formData: FormData): Promise<void> {
  const profileId = (formData.get('profileId') as string)?.trim()
  const value = formData.get('wholesale_access') === 'true'

  if (!profileId) return

  const { supabase, error } = await requireAdmin()
  if (error) return

  await supabase
    .from('profiles')
    .update({ wholesale_access: value })
    .eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${profileId}`)
}

/**
 * Promeut un utilisateur existant en role='agent', status='approved' (personnel
 * interne / dépôt). Modèle promoteToAdmin : on passe par le client service_role
 * pour écrire le rôle, MAIS l'action est gardée admin-only en amont (requireAdmin)
 * → seul un admin peut promouvoir (anti-escalade préservée). Un non-admin n'atteint
 * jamais le client service_role.
 *
 * Garde-fou : on REFUSE de modifier un compte déjà 'admin' (pas de rétrogradation
 * accidentelle). Une fois agent, l'utilisateur apparaît dans /admin/permissions et
 * devient éligible aux casiers (dépôt, assignation, confirmation…).
 */
export async function promoteToAgent(formData: FormData): Promise<void> {
  const profileId = (formData.get('profileId') as string)?.trim()
  if (!profileId) return

  // GARDE admin-only — un non-admin est rejeté AVANT tout usage de service_role.
  const { supabase, error } = await requireAdmin()
  if (error) return

  const adminClient = createAdminClient()

  // Anti-escalade : ne jamais toucher un admin existant.
  const { data: target } = (await adminClient
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .single()) as { data: { role: string } | null }
  if (!target || target.role === 'admin') return

  const { error: updErr } = await adminClient
    .from('profiles')
    .update({ role: 'agent', status: 'approved' })
    .eq('id', profileId)
  if (updErr) return // échec silencieux (ex. trigger d'immutabilité) → pas de revalidate

  // Journal d'audit : l'écriture passe par service_role (acteur=NULL côté trigger) →
  // on loggue ici via le client utilisateur pour capturer l'admin auteur (auth.uid()).
  try {
    await supabase.rpc('log_admin_action', {
      p_action: 'promote_to_agent',
      p_target_table: 'profiles',
      p_target_id: profileId,
      p_old: { role: target.role },
      p_new: { role: 'agent', status: 'approved' },
    })
  } catch {
    // best-effort : un échec de log ne doit pas casser la promotion
  }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${profileId}`)
}

export type CountrySetupState = { error: string | null; success: boolean }

/**
 * Admin pose (ou corrige) le pays d'un fournisseur — débloque l'onboarding des
 * fournisseurs pré-054 restés sans country_code. Le client admin authentifié
 * satisfait my_role()='admin' du trigger d'immutabilité (migration 054). On
 * remet aussi country_setup_requested à false : la demande est traitée.
 */
export async function setSupplierCountry(
  _prev: CountrySetupState,
  formData: FormData,
): Promise<CountrySetupState> {
  const profileId = (formData.get('profileId') as string)?.trim()
  const countryCode = (formData.get('country_code') as string)?.trim()

  if (!profileId) return { error: 'Profil non spécifié.', success: false }
  if (!isSupplierCountryCode(countryCode)) return { error: 'Pays invalide.', success: false }

  const { supabase, error } = await requireAdmin()
  if (error) return { error, success: false }

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ country_code: countryCode, country_setup_requested: false })
    .eq('id', profileId)
    .eq('role', 'supplier')

  if (updErr) return { error: updErr.message, success: false }

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${profileId}`)
  return { error: null, success: true }
}

/**
 * Le fournisseur (sans pays) signale qu'il attend la configuration de son pays.
 * Self-update autorisé par la policy « profiles: update own » (role/status
 * inchangés) ; ne touche PAS country_code (figé). Transforme le mur en demande.
 */
export async function requestCountrySetup(
  _prev: CountrySetupState,
  _formData: FormData,
): Promise<CountrySetupState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.', success: false }

  const { error } = await supabase
    .from('profiles')
    .update({ country_setup_requested: true })
    .eq('id', user.id)
    .eq('role', 'supplier')
    .is('country_code', null)

  if (error) return { error: error.message, success: false }

  revalidatePath('/supplier/products/new')
  return { error: null, success: true }
}
