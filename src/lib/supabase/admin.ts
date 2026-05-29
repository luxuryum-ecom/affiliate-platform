import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client.
 * Bypasses RLS — use ONLY in server actions and server components, never in client code.
 * Requires SUPABASE_SERVICE_ROLE_KEY env var (never exposed to the browser).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
