'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { createClient } from '@/lib/supabase/server'

// ─── Relevés figés (module Livreurs, Lot F) ──────────────────────────────────
//
// Génération = RPC SECURITY DEFINER admin-only (mig 130) appelée avec le client
// authentifié admin (auth.uid() = admin → la garde my_role() passe). Le PDF est
// servi par /api/statements/{payout,courier}/[id]. Les listes sont RLS-scopées :
// un affilié ne voit QUE ses relevés (policy own-or-admin), les relevés livreurs
// sont admin-only.

export interface GenerateCourierStatementResult {
  error: string | null
  statementId: string | null
}

/**
 * Fige un relevé livreur signable sur une période (admin). Délègue tout le calcul
 * à la RPC `generate_courier_statement` (SOLDE FINAL du grand livre + activité).
 */
export async function generateCourierStatement(
  courierId: string,
  periodStart: string,
  periodEnd: string,
): Promise<GenerateCourierStatementResult> {
  if (!courierId || !periodStart || !periodEnd) {
    return { error: 'Livreur et période requis.', statementId: null }
  }

  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Non autorisé.', statementId: null }

  const { data, error: rpcErr } = await supabase.rpc('generate_courier_statement', {
    p_courier_id: courierId,
    p_start: periodStart,
    p_end: periodEnd,
  })
  if (rpcErr) {
    // @security P3-1 : ne pas renvoyer le détail SQL brut au client (surface admin,
    // mais principe de moindre exposition). Détail loggé côté serveur uniquement.
    console.error('generate_courier_statement:', rpcErr.message)
    return { error: 'Génération du relevé impossible (période ou livreur invalide).', statementId: null }
  }

  const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null
  if (!row) return { error: 'Génération impossible.', statementId: null }

  revalidatePath(`/admin/couriers/${courierId}`)
  return { error: null, statementId: row.id }
}

export interface CourierStatementRow {
  id: string
  periodStart: string
  periodEnd: string
  finalBalanceMad: number
  generatedAt: string
}

/** Liste les relevés figés d'un livreur (admin only, RLS admin). */
export async function getCourierStatements(courierId: string): Promise<CourierStatementRow[]> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return []

  const { data } = (await supabase
    .from('courier_statements')
    .select('id, period_start, period_end, final_balance_mad, generated_at')
    .eq('courier_id', courierId)
    .order('generated_at', { ascending: false })) as {
    data:
      | { id: string; period_start: string; period_end: string; final_balance_mad: number; generated_at: string }[]
      | null
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    finalBalanceMad: Number(r.final_balance_mad),
    generatedAt: r.generated_at,
  }))
}

export interface PayoutStatementRow {
  id: string
  payoutId: string
  periodStart: string | null
  periodEnd: string | null
  totalAmountMad: number
  paymentMethod: string | null
  reference: string | null
  generatedAt: string
}

function mapPayoutStatement(r: {
  id: string
  payout_id: string
  period_start: string | null
  period_end: string | null
  total_amount: number
  payment_method: string | null
  reference: string | null
  generated_at: string
}): PayoutStatementRow {
  return {
    id: r.id,
    payoutId: r.payout_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    totalAmountMad: Number(r.total_amount),
    paymentMethod: r.payment_method,
    reference: r.reference,
    generatedAt: r.generated_at,
  }
}

/**
 * Relevés de paiement de l'AFFILIÉ connecté (son espace). RLS own-or-admin →
 * l'appel sous le client de l'affilié ne renvoie QUE ses propres relevés.
 */
export async function getMyPayoutStatements(): Promise<PayoutStatementRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = (await supabase
    .from('payout_statements')
    .select('id, payout_id, period_start, period_end, total_amount, payment_method, reference, generated_at')
    .eq('affiliate_id', user.id)
    .order('generated_at', { ascending: false })) as { data: Parameters<typeof mapPayoutStatement>[0][] | null }

  return (data ?? []).map(mapPayoutStatement)
}

/** Relevés de paiement d'un affilié donné, pour la fiche admin (admin only). */
export async function getPayoutStatementsForAffiliate(affiliateId: string): Promise<PayoutStatementRow[]> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return []

  const { data } = (await supabase
    .from('payout_statements')
    .select('id, payout_id, period_start, period_end, total_amount, payment_method, reference, generated_at')
    .eq('affiliate_id', affiliateId)
    .order('generated_at', { ascending: false })) as { data: Parameters<typeof mapPayoutStatement>[0][] | null }

  return (data ?? []).map(mapPayoutStatement)
}
