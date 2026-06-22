'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type { ActionState } from '@/types/orders'

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

// ─── ACTION (admin-only) — toggle on/off en un clic, réversible ──────────────

/**
 * Attribue (enabled=true) ou retire (false) la capacité `validate_categories`
 * à un salarié. Passe par les RPC auditées (gate admin côté DB également).
 */
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
