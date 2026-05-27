import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/**
 * Affiliate route guard.
 * All pages under (affiliate)/ require:
 *   - authenticated user
 *   - profile.role = 'affiliate'
 *   - profile.status = 'approved'
 */
export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
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
  if (profile.role !== 'affiliate') redirect('/login')

  return <>{children}</>
}
