'use server'

import { requireAdmin } from './_guards'
import { parseMoneyInput } from '@/lib/money'
import type { SupplierCommissionType, SupplierPayoutStatus, SupplierQuoteRequest } from '@/types/database'

export type SupplierPayoutState = { error: string | null; success?: boolean }

// ── Admin: set supplier financial breakdown and compute payout ────────────────

export async function updateSupplierFinancials(
  _prevState: SupplierPayoutState,
  formData: FormData
): Promise<SupplierPayoutState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Non authentifié.' }

  const id = formData.get('id') as string
  // RÈGLE ARGENT n°4 — coût fournisseur validé en CHAÎNE décimale stricte (money.ts),
  // passé verbatim à la colonne numeric : zéro parseFloat. Vide = non saisi → NULL
  // (comportement inchangé) ; saisie invalide → erreur explicite (l'ancien parseFloat
  // masquait une saisie invalide en NULL silencieux).
  const supplierCostRaw = formData.get('supplier_cost_mad')
  const supplierCostStr = typeof supplierCostRaw === 'string' ? supplierCostRaw.trim() : ''
  let supplier_cost_mad: string | null = null
  if (supplierCostStr !== '') {
    const r = parseMoneyInput(supplierCostStr)
    if (!r.ok) return { error: 'Coût fournisseur invalide.' }
    supplier_cost_mad = r.value
  }
  const platform_commission_type = (formData.get('platform_commission_type') as string) || 'percent'
  const platform_commission_value = parseFloat(formData.get('platform_commission_value') as string)
  const transport_customs_cost_mad = parseFloat(formData.get('transport_customs_cost_mad') as string) || 0

  if (!id) return { error: 'Identifiant manquant.' }

  // Fetch the quote request to compute amounts
  const { data: qr } = await supabase
    .from('supplier_quote_requests')
    .select('quantity_requested, quoted_unit_price_mad')
    .eq('id', id)
    .single() as { data: Pick<SupplierQuoteRequest, 'quantity_requested' | 'quoted_unit_price_mad'> | null; error: unknown }

  if (!qr) return { error: 'Devis introuvable.' }

  const totalClientAmount = (qr.quoted_unit_price_mad ?? 0) * qr.quantity_requested

  let commissionAmount: number | null = null
  if (!isNaN(platform_commission_value)) {
    if (platform_commission_type === 'percent') {
      commissionAmount = Math.round((totalClientAmount * platform_commission_value) / 100 * 100) / 100
    } else {
      commissionAmount = platform_commission_value
    }
  }

  const payoutAmount =
    commissionAmount !== null
      ? Math.round((totalClientAmount - commissionAmount - transport_customs_cost_mad) * 100) / 100
      : null

  const { error } = await supabase
    .from('supplier_quote_requests')
    .update({
      supplier_cost_mad,
      platform_commission_type: platform_commission_type as SupplierCommissionType,
      platform_commission_value: isNaN(platform_commission_value) ? null : platform_commission_value,
      platform_commission_amount_mad: commissionAmount,
      transport_customs_cost_mad,
      supplier_payout_amount_mad: payoutAmount,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  return { error: null, success: true }
}

// ── Admin: update supplier payout status ──────────────────────────────────────

export async function updateSupplierPayoutStatus(
  _prevState: SupplierPayoutState,
  formData: FormData
): Promise<SupplierPayoutState> {
  const { supabase, error: authError, userId } = await requireAdmin()
  if (authError || !userId) return { error: authError ?? 'Non authentifié.' }

  const id = formData.get('id') as string
  const new_status = formData.get('supplier_payout_status') as SupplierPayoutStatus
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!id) return { error: 'Identifiant manquant.' }
  const validStatuses: SupplierPayoutStatus[] = ['not_due', 'pending', 'partially_paid', 'paid']
  if (!validStatuses.includes(new_status)) return { error: 'Statut invalide.' }

  // Get current status for history
  const { data: current } = await supabase
    .from('supplier_quote_requests')
    .select('supplier_payout_status')
    .eq('id', id)
    .single() as { data: Pick<SupplierQuoteRequest, 'supplier_payout_status'> | null; error: unknown }

  const previous_status = current?.supplier_payout_status ?? null

  const { error: updateError } = await supabase
    .from('supplier_quote_requests')
    .update({ supplier_payout_status: new_status })
    .eq('id', id)

  if (updateError) return { error: updateError.message }

  await supabase.from('supplier_payout_history').insert({
    supplier_quote_request_id: id,
    previous_status,
    new_status,
    changed_by: userId,
    notes,
  })

  return { error: null, success: true }
}
