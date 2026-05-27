import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client — use in Client Components ('use client').
 * Creates a new instance per call; safe to call at the top of a component.
 *
 * NOTE: Database generic omitted — see server.ts for explanation.
 * Replace with `createBrowserClient<Database>(...)` once you run `supabase gen types`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
