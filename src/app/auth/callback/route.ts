import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/callback
 *
 * Point d'entrée des liens d'authentification Supabase. Gère DEUX flux :
 *
 *  1. `token_hash` + `type` → `verifyOtp` (STATELESS). Utilisé par les liens
 *     email (réinitialisation MDP `recovery`, confirmation signup…). Ne requiert
 *     PAS de `code_verifier` côté navigateur → fonctionne même si le lien est
 *     ouvert sur un autre appareil/navigateur que celui qui l'a demandé.
 *  2. `code` → `exchangeCodeForSession` (PKCE). Flux OAuth/login standard, en
 *     aller-retour sur le même navigateur. INCHANGÉ (fallback historique).
 *
 * Après échange réussi, redirige vers `?next=` (par défaut `/reset-password`).
 *
 * NOTE OPS :
 *  - `${NEXT_PUBLIC_APP_URL}/auth/callback` doit figurer dans l'allowlist
 *    "Redirect URLs" du dashboard Supabase Auth.
 *  - Pour le reset MDP, le template email "Reset Password" doit pointer sur
 *    `${SiteURL}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
 *    (flux 1 stateless), et non sur `/auth/v1/verify?token=pkce_…` (flux PKCE,
 *    fragile sur les liens email).
 */

// Allowlist anti-abus : on ne relaie JAMAIS un `type` arbitraire à `verifyOtp`.
// Sous-ensemble de `EmailOtpType` (@supabase/auth-js) restreint aux liens email.
const ALLOWED_OTP_TYPES = [
  'recovery',
  'email',
  'magiclink',
  'signup',
  'invite',
  'email_change',
] as const
type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number]

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const typeParam = searchParams.get('type')
  const next = searchParams.get('next') ?? '/reset-password'

  // Sécurité : redirect INTERNE uniquement. On exige un chemin commençant par '/'
  // MAIS on rejette les formes protocole-relatives ('//evil.com', '/\evil.com') qui
  // `new URL(..., origin)` résoudrait vers un domaine externe (open-redirect). @security P2.
  const isSafePath =
    next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
  const safeNext = isSafePath ? next : '/reset-password'

  const loginError = NextResponse.redirect(new URL('/login?error=auth', origin))

  // Flux 1 — lien email STATELESS (token_hash + type). Pas de code_verifier requis.
  const otpType: AllowedOtpType | null = ALLOWED_OTP_TYPES.includes(
    typeParam as AllowedOtpType
  )
    ? (typeParam as AllowedOtpType)
    : null

  if (tokenHash && otpType) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash })
    return error ? loginError : NextResponse.redirect(new URL(safeNext, origin))
  }

  // Flux 2 — PKCE OAuth/login standard (?code=). INCHANGÉ.
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return error ? loginError : NextResponse.redirect(new URL(safeNext, origin))
  }

  // Ni token_hash+type valide, ni code → lien invalide/expiré.
  return loginError
}
