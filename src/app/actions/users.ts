'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
