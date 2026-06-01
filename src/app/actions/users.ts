'use server'

import { revalidatePath } from 'next/cache'
import type { UserStatus } from '@/types/database'
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
