import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server Supabase client — use in Server Components, Server Actions, and Route Handlers.
 * Must be called inside an async function (it awaits cookies()).
 *
 * NOTE: The Database generic is intentionally omitted here. As of supabase-js v2.106+,
 * the type inference for hand-written DB stubs is unreliable (it resolves to `never`).
 * Use explicit type assertions at the call-site instead (see types/database.ts).
 * Replace with `createServerClient<Database>(...)` once you run `supabase gen types`.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The middleware handles session refresh so this is safe to ignore.
          }
        },
      },
    }
  )
}
