import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/**
 * Wholesale route guard.
 * All pages under (wholesale)/ require:
 *   - authenticated user
 *   - profile.role = 'wholesaler'
 *   - profile.status = 'approved'
 */
export default async function WholesaleLayout({ children }: { children: React.ReactNode }) {
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
  if (profile.role !== 'wholesaler' && !profile.wholesale_access) redirect('/login')

  return <>{children}</>
}
