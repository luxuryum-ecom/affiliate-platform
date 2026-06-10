import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/**
 * Supplier route guard.
 * All pages under (supplier)/ require:
 *   - authenticated user
 *   - profile.role = 'supplier'
 *   - profile.status = 'approved'
 */
export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
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
  if (profile.role !== 'supplier') redirect('/login')

  return <>{children}</>
}
