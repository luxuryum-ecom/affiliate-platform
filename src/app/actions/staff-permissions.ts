'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from './_guards'
import type { StaffCapability } from './_guards'
import type { ActionState } from '@/types/orders'
import {
  ALL_VOLETS,
  capabilitiesOfVolet,
  isValidCapability,
} from '@/lib/permissions/catalog'
import type { VoletId } from '@/lib/permissions/catalog'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

// Capacité gérée par ce panneau (mig 083 allowlist). Le toggle financier
// `affiliate_allowed` n'est PAS une capacité ici — il reste admin-only (mig 082).
const VALIDATE_CATEGORIES = 'validate_categories' as const

export type StaffMember = {
  id: string
  full_name: string
  role: string
  can_validate_categories: boolean
}

export type PermissionAuditRow = {
  id: string
  action: 'grant' | 'revoke'
  capability: string
  user_name: string
  actor_name: string
  changed_at: string
}

// ─── READ (admin-only) ───────────────────────────────────────────────────────

/**
 * Pool des salariés à qui attribuer la capacité = les `agent` approuvés
 * (personnel interne). L'admin possède déjà toutes les capacités (non listé).
 */
export async function getValidatorCandidates(): Promise<StaffMember[]> {
  const { supabase, error } = await requireAdmin()
  if (error) return []

  const { data: agents } = (await supabase
    .from('profiles')
    .select('id,full_name,role')
    .eq('role', 'agent')
    .eq('status', 'approved')
    .order('full_name')) as { data: { id: string; full_name: string; role: string }[] | null }

  const { data: perms } = (await supabase
    .from('staff_permissions')
    .select('user_id')
    .eq('capability', VALIDATE_CATEGORIES)) as { data: { user_id: string }[] | null }

  const granted = new Set((perms ?? []).map((p) => p.user_id))
  return (agents ?? []).map((a) => ({
    id: a.id,
    full_name: a.full_name,
    role: a.role,
    can_validate_categories: granted.has(a.id),
  }))
}

/** Journal d'audit (qui a accordé/retiré quoi à qui). Noms résolus côté serveur. */
export async function getPermissionAudit(limit = 50): Promise<PermissionAuditRow[]> {
  const { supabase, error } = await requireAdmin()
  if (error) return []

  const { data: rows } = (await supabase
    .from('staff_permission_audit')
    .select('id,action,capability,user_id,changed_by,changed_at')
    .order('changed_at', { ascending: false })
    .limit(limit)) as {
    data:
      | {
          id: string
          action: 'grant' | 'revoke'
          capability: string
          user_id: string | null
          changed_by: string | null
          changed_at: string
        }[]
      | null
  }
  if (!rows || rows.length === 0) return []

  const ids = Array.from(
    new Set(rows.flatMap((r) => [r.user_id, r.changed_by]).filter((v): v is string => !!v)),
  )
  const { data: profiles } = (await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', ids)) as { data: { id: string; full_name: string }[] | null }
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    capability: r.capability,
    user_name: (r.user_id && nameOf.get(r.user_id)) || '—',
    actor_name: (r.changed_by && nameOf.get(r.changed_by)) || '—',
    changed_at: r.changed_at,
  }))
}

// ─── ACTIONS GÉNÉRIQUES (sous-lot B) ─────────────────────────────────────────

/**
 * Attribue ou retire UNE capacité à un salarié.
 * Valide que `capability` ∈ StaffCapability via le catalogue (défense en
 * profondeur : en plus de la contrainte CHECK DB de la mig 087).
 *
 * Signature directe (non-formData) — l'UI optimiste appelle sans FormData.
 * Compatible avec le pattern `useTransition / startTransition(async () => ...)`.
 *
 * @example
 *   const result = await setStaffPermission({ userId, capability: 'confirm_cod_orders', enabled: true })
 */
export async function setStaffPermission(args: {
  userId: string
  capability: string
  enabled: boolean
}): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  // Validation userId
  if (!z.string().uuid().safeParse(args.userId).success) return fail('Salarié manquant.')

  // Validation capability via catalogue — rejet immédiat si inconnue
  if (!isValidCapability(args.capability)) {
    return fail(`Capacité inconnue : ${args.capability}`)
  }

  const capability: StaffCapability = args.capability
  const rpc = args.enabled ? 'grant_staff_permission' : 'revoke_staff_permission'
  const { error } = await supabase.rpc(rpc, {
    p_user_id: args.userId,
    p_capability: capability,
  })
  if (error) return fail(error.message)

  revalidatePath('/admin/permissions')
  return ok
}

/**
 * Grant ou revoke EN BLOC toutes les capacités d'un volet (bundle volet-superviseur).
 * Chaque RPC est idempotente : grant sur une capacité déjà accordée est sans effet.
 * Les erreurs individuelles sont agrégées ; un succès partiel est signalé en erreur.
 *
 * @example
 *   const result = await setVoletSupervisor({ userId, volet: 'commandes', enabled: true })
 */
export async function setVoletSupervisor(args: {
  userId: string
  volet: VoletId
  enabled: boolean
}): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  if (!z.string().uuid().safeParse(args.userId).success) return fail('Salarié manquant.')

  // Vérifie que le volet existe dans le catalogue
  const voletKnown = ALL_VOLETS.some((v) => v.id === args.volet)
  if (!voletKnown) return fail(`Volet inconnu : ${args.volet}`)

  const caps = capabilitiesOfVolet(args.volet)
  if (caps.length === 0) return fail('Volet sans capacités.')

  const rpc = args.enabled ? 'grant_staff_permission' : 'revoke_staff_permission'
  const errors: string[] = []

  for (const cap of caps) {
    const { error } = await supabase.rpc(rpc, {
      p_user_id: args.userId,
      p_capability: cap,
    })
    if (error) errors.push(`${cap}: ${error.message}`)
  }

  if (errors.length > 0) {
    return fail(`Erreurs sur ${errors.length}/${caps.length} capacité(s) : ${errors.join(' | ')}`)
  }

  revalidatePath('/admin/permissions')
  return ok
}

/**
 * Remplaçant générique de getValidatorCandidates — data-driven, sans flag booléen hard-codé.
 * Renvoie chaque salarié (agent approuvé) avec la liste de ses capacités actives.
 *
 * Le sous-lot C l'utilisera pour construire le panneau générique.
 * Les appelants actuels (getValidatorCandidates, getAgentCountryAssignments) restent intacts.
 */
export type StaffMemberWithCapabilities = {
  userId: string
  fullName: string
  grantedCapabilities: StaffCapability[]
}

export async function getStaffMembersWithCapabilities(): Promise<StaffMemberWithCapabilities[]> {
  const { supabase, error } = await requireAdmin()
  if (error) return []

  const { data: agents } = (await supabase
    .from('profiles')
    .select('id,full_name')
    .eq('role', 'agent')
    .eq('status', 'approved')
    .order('full_name')) as { data: { id: string; full_name: string }[] | null }

  if (!agents || agents.length === 0) return []

  const agentIds = agents.map((a) => a.id)

  const { data: perms } = (await supabase
    .from('staff_permissions')
    .select('user_id,capability')
    .in('user_id', agentIds)) as {
    data: { user_id: string; capability: string }[] | null
  }

  // Agrège les capacités par user, en filtrant celles connues du catalogue
  const capsByUser = new Map<string, StaffCapability[]>()
  for (const p of perms ?? []) {
    if (!isValidCapability(p.capability)) continue
    const list = capsByUser.get(p.user_id) ?? []
    list.push(p.capability)
    capsByUser.set(p.user_id, list)
  }

  return agents.map((a) => ({
    userId: a.id,
    fullName: a.full_name,
    grantedCapabilities: capsByUser.get(a.id) ?? [],
  }))
}

// ─── ACTION LEGACY (conservée pour rétro-compatibilité éventuelle) ───────────

export async function setValidateCategoriesPermission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const userId = (formData.get('user_id') as string)?.trim()
  const enabled = formData.get('enabled') === 'true'
  if (!userId) return fail('Salarié manquant.')

  const rpc = enabled ? 'grant_staff_permission' : 'revoke_staff_permission'
  const { error } = await supabase.rpc(rpc, {
    p_user_id: userId,
    p_capability: VALIDATE_CATEGORIES,
  })
  if (error) return fail(error.message)

  revalidatePath('/admin/permissions')
  return ok
}
