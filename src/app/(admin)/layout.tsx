import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/**
 * Admin route guard.
 * All pages under (admin)/ require:
 *   - authenticated user
 *   - profile.role = 'admin' or 'agent'
 *   - profile.status = 'approved'
 *
 * Agents share the admin layout — they see a filtered subset of features.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (!profile || profile.status === 'pending') redirect('/pending')
  if (profile.status === 'rejected') redirect('/login')
  if (!['admin', 'agent'].includes(profile.role)) redirect('/login')

  return <>{children}</>
}
