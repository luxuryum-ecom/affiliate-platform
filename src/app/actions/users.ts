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
    .in('role', ['affiliate', 'wholesaler'])

  revalidatePath('/admin/users')
  revalidatePath('/admin/dashboard')
}
