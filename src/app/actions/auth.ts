'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/types/database'

export type AuthState = { error: string | null }

const ROLE_REDIRECTS: Record<string, string> = {
  affiliate: '/affiliate/dashboard',
  wholesaler: '/wholesale/dashboard',
  admin: '/admin/dashboard',
  agent: '/admin/dashboard',
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const full_name = (formData.get('full_name') as string)?.trim()
  const role = formData.get('role') as string

  if (!email || !password || !full_name) {
    return { error: 'Tous les champs sont requis.' }
  }

  if (password.length < 8) {
    return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }
  }

  if (!['affiliate', 'wholesaler'].includes(role)) {
    return { error: 'Type de compte invalide.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, role },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Un compte existe déjà avec cet email.' }
    }
    return { error: error.message }
  }

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
