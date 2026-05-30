'use server'

import { requireAdmin } from './_guards'
import type { SupplierIssueType } from '@/types/database'

export type SupplierIssueState = { error: string | null; success?: boolean }

const VALID_TYPES: SupplierIssueType[] = [
  'delay',
  'quality_problem',
  'wrong_quantity',
  'communication_problem',
  'other',
]

export async function addSupplierIssue(
  _prevState: SupplierIssueState,
  formData: FormData,
): Promise<SupplierIssueState> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { error: error ?? 'Non authentifié.' }

  const supplier_id = (formData.get('supplier_id') as string)?.trim()
  const issue_type = formData.get('issue_type') as SupplierIssueType
  const notes = (formData.get('notes') as string)?.trim() || null
  const delivery_days_raw = formData.get('delivery_days') as string

  if (!supplier_id) return { error: 'Fournisseur manquant.' }
  if (!VALID_TYPES.includes(issue_type)) return { error: 'Type de problème invalide.' }

  const delivery_days =
    delivery_days_raw && delivery_days_raw !== ''
      ? parseInt(delivery_days_raw, 10)
      : null

  if (delivery_days !== null && (isNaN(delivery_days) || delivery_days <= 0)) {
    return { error: 'Nombre de jours invalide.' }
  }

  const { error: insertError } = await supabase.from('supplier_issues').insert({
    supplier_id,
    issue_type,
    notes,
    delivery_days,
    created_by: userId,
  })

  if (insertError) return { error: insertError.message }
  return { error: null, success: true }
}
