'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import { autoRunRfqForSourcing } from './rfq-engine'
import type {
  SourcingRequest,
  SourcingRequestStatus,
  ScoredSupplier,
  SupplierProduct,
  SupplierIssue,
  SupplierQuoteRequest,
  Profile,
} from '@/types/database'

// ─── Shared result type ───────────────────────────────────────────────────────

type ActionResult = { error: string | null; success: boolean }
const ok: ActionResult = { error: null, success: true }
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

// ─── Wholesaler: submit sourcing request ─────────────────────────────────────

export async function submitSourcingRequest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: { role: string } | null; error: unknown }

  if (profile?.role !== 'wholesaler') return fail('Accès réservé aux grossistes.')

  const productName   = (formData.get('product_name') as string | null)?.trim() ?? ''
  const category      = (formData.get('category') as string | null)?.trim() ?? ''
  const quantityRaw   = Number(formData.get('quantity'))
  const budgetRaw     = Number(formData.get('target_budget_mad'))
  const targetCountry = (formData.get('target_country') as string | null)?.trim() || null
  const deadlineRaw   = (formData.get('delivery_deadline') as string | null)?.trim() || null
  const notes         = (formData.get('notes') as string | null)?.trim() || null

  if (!productName) return fail('Nom du produit requis.')
  if (!category)    return fail('Catégorie requise.')
  if (!quantityRaw || quantityRaw <= 0) return fail('Quantité invalide.')
  if (!budgetRaw   || budgetRaw  <= 0) return fail('Budget cible invalide.')

  const { error } = await supabase.from('sourcing_requests').insert({
    wholesaler_id:     user.id,
    product_name:      productName,
    category,
    quantity:          quantityRaw,
    target_budget_mad: budgetRaw,
    target_country:    targetCountry,
    delivery_deadline: deadlineRaw,
    notes,
  })

  if (error) return fail('Erreur lors de la soumission.')

  // Auto-run RFQ matching engine (non-blocking)
  const { data: newReq } = await supabase
    .from('sourcing_requests')
    .select('id')
    .eq('wholesaler_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (newReq?.id) {
    void autoRunRfqForSourcing(newReq.id)
  }

  revalidatePath('/wholesale/sourcing')
  return ok
}

// ─── Admin: update sourcing request status ────────────────────────────────────

export async function updateSourcingStatus(
  requestId: string,
  status: SourcingRequestStatus,
  adminNotes?: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const patch: Partial<SourcingRequest> = { status }
  if (adminNotes !== undefined) patch.admin_notes = adminNotes

  const { error: dbErr } = await supabase
    .from('sourcing_requests')
    .update(patch)
    .eq('id', requestId)

  if (dbErr) return fail('Erreur lors de la mise à jour.')

  revalidatePath('/admin/sourcing')
  return ok
}

// ─── Admin: select supplier for a sourcing request ───────────────────────────

export async function selectSupplierForSourcing(
  requestId: string,
  supplierId: string,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const { error: dbErr } = await supabase
    .from('sourcing_requests')
    .update({ selected_supplier_id: supplierId, status: 'matched' })
    .eq('id', requestId)

  if (dbErr) return fail('Erreur lors de la sélection du fournisseur.')

  revalidatePath('/admin/sourcing')
  return ok
}

// ─── Admin: convert sourcing request to quote ────────────────────────────────

export async function convertSourcingToQuote(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return fail(error ?? 'Erreur.')

  const requestId  = formData.get('sourcing_request_id') as string
  const productId  = formData.get('product_id') as string
  const quantity   = Number(formData.get('quantity'))
  const notes      = (formData.get('notes') as string | null)?.trim() || null

  if (!requestId || !productId) return fail('Données manquantes.')

  const { data: req } = await supabase
    .from('sourcing_requests')
    .select('wholesaler_id, product_name, category, target_country, delivery_deadline, notes')
    .eq('id', requestId)
    .single() as { data: Pick<SourcingRequest, 'wholesaler_id' | 'product_name' | 'category' | 'target_country' | 'delivery_deadline' | 'notes'> | null; error: unknown }

  if (!req) return fail('Demande introuvable.')

  const { data: buyerProfile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', req.wholesaler_id)
    .single() as { data: { phone: string | null } | null; error: unknown }

  const { data: quote, error: qErr } = await supabase
    .from('quote_requests')
    .insert({
      buyer_id:              req.wholesaler_id,
      product_id:            productId,
      quantity_requested:    quantity,
      destination_country:   req.target_country ?? 'Maroc',
      whatsapp_number:       buyerProfile?.phone ?? '',
      buyer_notes:           notes ?? req.notes ?? undefined,
    })
    .select('id')
    .single()

  if (qErr || !quote) return fail('Erreur lors de la création du devis.')

  const { error: updateErr } = await supabase
    .from('sourcing_requests')
    .update({ status: 'quoted', quote_request_id: (quote as { id: string }).id })
    .eq('id', requestId)

  if (updateErr) return fail('Erreur lors du lien devis.')

  revalidatePath('/admin/sourcing')
  revalidatePath('/admin/quote-requests')
  return ok
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

type SupplierProductRow = Pick<SupplierProduct, 'supplier_id' | 'category' | 'origin_country' | 'min_quantity'> & {
  supplier: Pick<Profile, 'id' | 'full_name'> | null
}
type IssueRow = Pick<SupplierIssue, 'supplier_id' | 'issue_type' | 'delivery_days'>
type QuoteRow = Pick<SupplierQuoteRequest, 'status'> & {
  supplier_product: { supplier_id: string } | null
}

export async function computeSourcingMatches(requestId: string): Promise<ScoredSupplier[]> {
  const supabase = await createClient()

  const { data: req } = await supabase
    .from('sourcing_requests')
    .select('category, target_country, quantity')
    .eq('id', requestId)
    .single() as { data: Pick<SourcingRequest, 'category' | 'target_country' | 'quantity'> | null; error: unknown }

  if (!req) return []

  const [{ data: productsData }, { data: issuesData }, { data: quotesData }] = await Promise.all([
    supabase
      .from('supplier_products')
      .select('supplier_id, category, origin_country, min_order_quantity, supplier:profiles!supplier_id(id, full_name)')
      .eq('approval_status', 'approved') as unknown as Promise<{ data: SupplierProductRow[] | null; error: unknown }>,
    supabase
      .from('supplier_issues')
      .select('supplier_id, issue_type, delivery_days') as unknown as Promise<{ data: IssueRow[] | null }>,
    supabase
      .from('supplier_quote_requests')
      .select('status, supplier_product:supplier_products!supplier_product_id(supplier_id)')
      .in('status', ['approved', 'rejected']) as unknown as Promise<{ data: QuoteRow[] | null }>,
  ])

  const products = (productsData ?? [])
  const issues   = (issuesData   ?? [])
  const quotes   = (quotesData   ?? [])

  // Group products by supplier
  const bySupplier = new Map<string, { name: string; products: SupplierProductRow[] }>()
  for (const p of products) {
    if (!p.supplier_id) continue
    if (!bySupplier.has(p.supplier_id)) {
      bySupplier.set(p.supplier_id, {
        name: (p.supplier as { full_name: string } | null)?.full_name ?? 'Fournisseur',
        products: [],
      })
    }
    bySupplier.get(p.supplier_id)!.products.push(p)
  }

  const scored: ScoredSupplier[] = []

  for (const [supplierId, { name, products: sProducts }] of bySupplier) {
    const categories  = [...new Set(sProducts.map((p) => p.category).filter(Boolean))].join(', ')
    const countries   = [...new Set(sProducts.map((p) => p.origin_country).filter(Boolean))].join(', ')
    const moqValues   = sProducts.map((p) => p.min_quantity ?? Infinity).filter((v): v is number => isFinite(v))
    const minMoq      = moqValues.length > 0 ? Math.min(...moqValues) : Infinity

    // Category match (0–30)
    const categoryMatch = categories.toLowerCase().includes(req.category.toLowerCase()) ? 30 : 0

    // Country match (0–20)
    const countryMatch = req.target_country
      ? countries.toLowerCase().includes(req.target_country.toLowerCase()) ? 20 : 0
      : 10 // neutral if no preference

    // Reliability score (0–30)
    const supplierIssues  = issues.filter((i) => i.supplier_id === supplierId)
    const issueCount      = supplierIssues.length
    const delayedCount    = supplierIssues.filter((i) => i.issue_type === 'delay').length
    const rawReliability  = Math.max(0, 100 - 5 * issueCount - 3 * delayedCount)
    const reliabilityScore = rawReliability
    const reliability     = Math.round((rawReliability / 100) * 30)

    // MOQ compatibility (0–10)
    const moqCompatibility = isFinite(minMoq) && minMoq <= req.quantity ? 10
      : isFinite(minMoq) && minMoq <= req.quantity * 1.5 ? 5
      : 0

    // Performance / past approvals (0–10)
    const supplierQuotes  = quotes.filter(
      (q) => (q.supplier_product as { supplier_id: string } | null)?.supplier_id === supplierId
    )
    const approved  = supplierQuotes.filter((q) => q.status === 'approved').length
    const rejected  = supplierQuotes.filter((q) => q.status === 'rejected').length
    const total     = approved + rejected
    const perfRatio = total > 0 ? approved / total : 0.5
    const performance = Math.round(perfRatio * 10)

    const matchScore = categoryMatch + countryMatch + reliability + moqCompatibility + performance

    scored.push({
      supplierId,
      supplierName: name,
      supplierType: null,
      countries,
      categories,
      reliabilityScore,
      minMoq: isFinite(minMoq) && minMoq !== Infinity ? minMoq : null,
      matchScore,
      scoreBreakdown: { categoryMatch, countryMatch, reliability, moqCompatibility, performance },
    })
  }

  return scored.sort((a, b) => b.matchScore - a.matchScore)
}
