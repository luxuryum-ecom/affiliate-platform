'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types (colonnes renvoyées par la RPC redactée — AUCUNE PII) ─────────────

export type AgentSourcingRequest = {
  id: string
  product_name: string
  category: string
  quantity: number
  target_country_code: string
  delivery_deadline: string
  notes: string
  status: string
  created_at: string
}

export type AgentCountryCode = {
  country_code: string
}

// ─── READ actions ─────────────────────────────────────────────────────────────

/**
 * Retourne les demandes de sourcing des pays affectés à l'agent connecté.
 * La RPC list_agent_sourcing_requests() est SECURITY DEFINER et gate
 * has_capability('manage_country_sourcing') — double défense avec le gate page.
 * Ne renvoie AUCUNE PII grossiste (ni nom, ni téléphone, ni société, ni budget).
 */
export async function getMyAgentSourcingRequests(): Promise<AgentSourcingRequest[]> {
  const supabase = await createClient()
  const { data } = (await supabase.rpc('list_agent_sourcing_requests')) as {
    data: AgentSourcingRequest[] | null
    error: unknown
  }
  return data ?? []
}

/**
 * Retourne les codes pays affectés à l'agent connecté.
 * Utilisé pour afficher "vos pays" en en-tête de page.
 */
export async function getMyAgentCountries(): Promise<AgentCountryCode[]> {
  const supabase = await createClient()
  const { data } = (await supabase.rpc('list_agent_country_codes')) as {
    data: AgentCountryCode[] | null
    error: unknown
  }
  return data ?? []
}
