'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { isSupplierCountryCode } from '@/lib/supplier-countries'
import { isValidCategory } from '@/lib/taxonomy'
import { notifyAdminNewSignup } from '@/lib/notifications/new-signup'
import type { Profile } from '@/types/database'

// Format E.164 : « + » suivi d'un indicatif (1er chiffre non nul) puis 6 à 14
// chiffres (8 à 15 chiffres au total). Ex. +212600000000. Niveau 1 : stocké,
// pas de vérification OTP — sert à joindre l'utilisateur (appel / WhatsApp).
const E164_RE = /^\+[1-9]\d{6,14}$/
const ROLES_REQUIRING_PHONE = ['supplier', 'wholesaler']

export type AuthState = { error: string | null }

const ROLE_REDIRECTS: Record<string, string> = {
  affiliate: '/affiliate/dashboard',
  wholesaler: '/wholesale/dashboard',
  admin: '/admin/dashboard',
  agent: '/admin/dashboard',
  supplier: '/supplier/dashboard',
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const full_name = (formData.get('full_name') as string)?.trim()
  const role = formData.get('role') as string
  const country_code = (formData.get('country_code') as string)?.trim() || ''
  // Normalisation téléphone : on retire espaces, tirets, points et parenthèses
  // saisis par l'utilisateur, on conserve le « + » et les chiffres (E.164).
  const phone = ((formData.get('phone') as string) ?? '').replace(/[\s\-().]/g, '')
  // Niche déclarée (grossiste, optionnelle) : catégorie canonique validée par
  // l'allowlist taxonomie. Toute valeur hors taxonomie → ignorée (null). Sert de
  // fallback cold-start à la perso comportementale. AFFICHAGE seul, aucun prix.
  const declared_niche_raw = (formData.get('declared_niche') as string)?.trim() || ''

  if (!email || !password || !full_name) {
    return { error: 'Tous les champs sont requis.' }
  }

  if (password.length < 8) {
    return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  }

  if (!['affiliate', 'wholesaler', 'supplier'].includes(role)) {
    return { error: 'Type de compte invalide.' }
  }

  // Pays OBLIGATOIRE pour un fournisseur (détermine sa devise de saisie) — figé ensuite.
  if (role === 'supplier') {
    if (!country_code) return { error: 'Sélectionnez votre pays (il détermine votre devise).' }
    if (!isSupplierCountryCode(country_code)) return { error: 'Pays invalide.' }
  }

  // Téléphone OBLIGATOIRE pour fournisseur ET grossiste (joignabilité appel/WhatsApp).
  // Niveau 1 : stocké tel quel après validation du format, sans vérification OTP.
  const phoneRequired = ROLES_REQUIRING_PHONE.includes(role)
  if (phoneRequired) {
    const ts = await getTranslations('auth.signup')
    if (!phone) return { error: ts('phoneRequired') }
    if (!E164_RE.test(phone)) return { error: ts('phoneInvalid') }
  }

  // Niche déclarée retenue UNIQUEMENT pour un grossiste ET si c'est une catégorie
  // valide (allowlist taxonomie). Sinon ignorée silencieusement (champ facultatif).
  const declared_niche =
    role === 'wholesaler' && isValidCategory(declared_niche_raw) ? declared_niche_raw : ''

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        role,
        ...(role === 'supplier' ? { country_code } : {}),
        ...(phoneRequired ? { phone } : {}),
        ...(declared_niche ? { declared_niche } : {}),
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Un compte existe déjà avec cet email.' }
    }
    return { error: error.message }
  }

  // PARTIE 3 — notif admin best-effort : un nouvel inscrit (pending) attend validation
  // dans /admin/users. N'altère jamais le signup (try/catch interne). Zéro PII sensible.
  await notifyAdminNewSignup({ role, fullName: full_name })

  redirect('/pending')
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email et mot de passe requis.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Email ou mot de passe incorrect.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Erreur de connexion. Réessayez.' }
  }

  // Journal d'audit : trace la connexion (qui + quand + appareil). JAMAIS le mot
  // de passe (inaccessible ici de toute façon). Best-effort — ne bloque pas le login.
  try {
    const ua = (await headers()).get('user-agent') ?? null
    await supabase.rpc('log_admin_action', {
      p_action: 'login',
      p_target_table: 'auth',
      p_target_id: user.id,
      p_old: null,
      p_new: { device: ua },
    })
  } catch {
    // best-effort : un échec de log ne doit jamais empêcher la connexion
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (!profile) {
    return { error: 'Profil introuvable. Contactez le support.' }
  }

  if (profile.status === 'rejected') {
    await supabase.auth.signOut()
    return { error: 'Votre compte a été rejeté. Contactez le support.' }
  }

  // B8/RGPD — compte supprimé/anonymisé : connexion bloquée (double garde en plus
  // du ban auth). Message neutre (cohérent avec le pattern raw de ce fichier).
  if (profile.status === 'deleted') {
    await supabase.auth.signOut()
    return { error: 'Ce compte a été supprimé.' }
  }

  if (profile.status === 'pending') {
    redirect('/pending')
  }

  redirect(ROLE_REDIRECTS[profile.role] ?? '/pending')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export type PasswordResetState = { sent: boolean; error: string | null }

export async function requestPasswordReset(
  _prevState: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const email = (formData.get('email') as string)?.trim()

  if (!email) {
    return { sent: false, error: 'Email requis.' }
  }

  const supabase = await createClient()

  // Best-effort : on appelle resetPasswordForEmail même si le compte n'existe pas.
  // Supabase ne retourne pas d'erreur dans ce cas — anti-énumération de comptes.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  })

  // Toujours retourner sent=true, quelle que soit l'existence du compte.
  return { sent: true, error: null }
}

export type UpdatePasswordState = { success: boolean; error: string | null }

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string

  if (!password || password.length < 8) {
    return { success: false, error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  }

  if (password !== confirm) {
    return { success: false, error: 'Les mots de passe ne correspondent pas.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { success: false, error: error.message }
  }

  redirect('/login?reset=1')
}
