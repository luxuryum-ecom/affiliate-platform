'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

/**
 * One-time admin bootstrap action.
 * Promotes the currently authenticated user to role=admin, status=approved.
 * Uses the service-role client to bypass RLS.
 * After promotion, /bootstrap becomes a permanent no-op (redirects to /admin/dashboard).
 */
export async function promoteToAdmin(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  await adminClient
    .from('profiles')
    .update({ role: 'admin', status: 'approved' })
    .eq('id', user.id)

  redirect('/admin/dashboard')
}
