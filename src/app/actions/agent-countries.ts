'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from './_guards'
import type { ActionState } from '@/types/orders'

export type AgentWithCountries = {
  id: string
  full_name: string
  role: string
  has_capability: boolean
  country_codes: string[]
}

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

const MANAGE_COUNTRY_SOURCING = 'manage_country_sourcing' as const

export async function getAgentCountryAssignments(): Promise<AgentWithCountries[]> {
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
    .eq('capability', MANAGE_COUNTRY_SOURCING)) as { data: { user_id: string }[] | null }

  const { data: assignments } = (await supabase
    .from('agent_countries')
    .select('agent_id,country_code')) as { data: { agent_id: string; country_code: string }[] | null }

  const granted = new Set((perms ?? []).map((p) => p.user_id))
  const byAgent = new Map<string, string[]>()
  for (const row of assignments ?? []) {
    if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, [])
    byAgent.get(row.agent_id)!.push(row.country_code)
  }

  return (agents ?? []).map((a) => ({
    id: a.id,
    full_name: a.full_name,
    role: a.role,
    has_capability: granted.has(a.id),
    country_codes: byAgent.get(a.id) ?? [],
  }))
}

// Pays de sourcing affectables via l'UI (4 pays internationaux). Aligné sur
// country-checkboxes.tsx. La migration 086 garde MA en allowlist DB (défense en
// profondeur), mais l'UI/action ne l'expose pas (sourcing = international).
const setAgentCountrySchema = z.object({
  agentId: z.string().uuid(),
  countryCode: z.enum(['CN', 'TR', 'EG', 'AE']),
  linked: z.boolean(),
})

export async function setAgentCountry(args: {
  agentId: string
  countryCode: string
  linked: boolean
}): Promise<ActionState> {
  const parsed = setAgentCountrySchema.safeParse(args)
  if (!parsed.success) return fail('Données invalides.')

  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const { agentId, countryCode, linked } = parsed.data
  const rpc = linked ? 'link_agent_country' : 'unlink_agent_country'
  const { error } = await supabase.rpc(rpc, {
    p_agent_id: agentId,
    p_country_code: countryCode,
  })
  if (error) return fail(error.message)

  revalidatePath('/admin/sourcing/agents')
  return ok
}

export async function setManageCountrySourcingPermission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, error: authError } = await requireAdmin()
  if (authError) return fail(authError)

  const userId = (formData.get('user_id') as string)?.trim()
  const enabled = formData.get('enabled') === 'true'
  if (!z.string().uuid().safeParse(userId).success) return fail('Agent manquant.')

  const rpc = enabled ? 'grant_staff_permission' : 'revoke_staff_permission'
  const { error } = await supabase.rpc(rpc, {
    p_user_id: userId,
    p_capability: MANAGE_COUNTRY_SOURCING,
  })
  if (error) return fail(error.message)

  revalidatePath('/admin/sourcing/agents')
  return ok
}
