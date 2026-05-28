'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { UserStatus } from '@/types/database'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Non authentifié.' as const }

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null; error: unknown }

  if (profile?.role !== 'admin') {
    return { supabase, error: 'Accès réservé aux administrateurs.' as const }
  }

  return { supabase, error: null }
}

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
