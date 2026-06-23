import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/callback
 *
 * Route handler PKCE standard @supabase/ssr.
 * Supabase envoie `?code=` après un flux de réinitialisation de mot de passe
 * (ou magic link). On échange le code contre une session, puis on redirige
 * vers `?next=` (par défaut /reset-password).
 *
 * NOTE OPS : l'URL ${NEXT_PUBLIC_APP_URL}/auth/callback doit figurer dans
 * l'allowlist "Redirect URLs" du dashboard Supabase Auth.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/reset-password'

  // Sécurité : redirect INTERNE uniquement. On exige un chemin commençant par '/'
  // MAIS on rejette les formes protocole-relatives ('//evil.com', '/\evil.com') qui
  // `new URL(..., origin)` résoudrait vers un domaine externe (open-redirect). @security P2.
  const isSafePath =
    next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
  const safeNext = isSafePath ? next : '/reset-password'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth', origin))
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth', origin))
  }

  return NextResponse.redirect(new URL(safeNext, origin))
}
