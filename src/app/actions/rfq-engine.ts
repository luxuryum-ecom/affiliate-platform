'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type {
  SupplierMatchingProfile,
  SupplierMatchingType,
  RfqMatchStatus,
  RfqOfferResponseType,
} from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const ok: ActionResult = { error: null, success: true }
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

// ── Supplier: upsert matching profile ────────────────────────────────────────

export async function upsertMatchingProfile(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const categoriesRaw   = (formData.get('categories') as string | null)?.trim() ?? ''
  const countriesRaw    = (formData.get('countries_served') as string | null)?.trim() ?? ''
  const moqMin          = Number(formData.get('moq_min')) || null
  const moqMax          = Number(formData.get('moq_max')) || null
  const capacity        = Number(formData.get('production_capacity')) || null
  const leadMin         = Number(formData.get('lead_time_days_min')) || null
  const leadMax         = Number(formData.get('lead_time_days_max')) || null
  const exportCapable   = formData.get('export_capable') === 'true'
  const supplierType    = (formData.get('supplier_type') as string | null)?.trim() as SupplierMatchingType ?? 'international'

  const categories     = categoriesRaw.split(',').map((s) => s.trim()).filter(Boolean)
  const countriesServed = countriesRaw.split(',').map((s) => s.trim()).filter(Boolean)

  const { error } = await supabase
    .from('supplier_matching_profiles')
    .upsert({
      supplier_id:         user.id,
      categories,
      countries_served:    countriesServed,
      moq_min:             moqMin,
      moq_max:             moqMax,
      production_capacity: capacity,
      lead_time_days_min:  leadMin,
      lead_time_days_max:  leadMax,
      export_capable:      exportCapable,
      supplier_type:       supplierType,
    }, { onConflict: 'supplier_id' })

  if (error) return fail('Erreur lors de la sauvegarde.')

  revalidatePath('/supplier/opportunities')
  revalidatePath('/supplier/dashboard')
  return ok
}

// ── Core scoring engine ───────────────────────────────────────────────────────

interface RfqParams {
  category: string
  targetCountry: string | null
  quantity: number
  leadTimeDays?: number | null
}

interface ScoredMatch {
  supplierId: string
  supplierName: string
  totalScore: number
  scoreCategory: number
  scoreCountry: number
  scoreMoq: number
  scoreLeadTime: number
  scoreReliability: number
  scoreResponseRate: number
}

async function scoreSuppliers(
  params: RfqParams,
): Promise<ScoredMatch[]> {
  const supabase = await createClient()

  const [profilesRes, premiumSubsRes] = await Promise.all([
    supabase
      .from('supplier_matching_profiles')
      .select('*, supplier:profiles!supplier_id(id, full_name)')
      .eq('active', true),
    // Fetch premium boost values for all active subscriptions
    supabase
      .from('supplier_subscriptions')
      .select('supplier_id, plan:premium_plans(rfq_priority_boost)')
      .eq('status', 'active'),
  ])

  const profiles = profilesRes.data
  if (!profiles?.length) return []

  // Build boost lookup: supplier_id → rfq_priority_boost
  type BoostRow = { supplier_id: string; plan: { rfq_priority_boost: number } | { rfq_priority_boost: number }[] | null }
  const boostMap = new Map<string, number>()
  for (const sub of (premiumSubsRes.data ?? []) as BoostRow[]) {
    const planData = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan
    if (planData?.rfq_priority_boost) boostMap.set(sub.supplier_id, planData.rfq_priority_boost)
  }

  const results: ScoredMatch[] = []

  for (const p of profiles) {
    const sup = p as SupplierMatchingProfile & { supplier: { id: string; full_name: string } | null }

    // Category match (0–30)
    const catMatch = sup.categories.some(
      (c) => c.toLowerCase().includes(params.category.toLowerCase()) ||
             params.category.toLowerCase().includes(c.toLowerCase())
    ) ? 30 : 0

    // Country match (0–20)
    const countryMatch = params.targetCountry
      ? sup.countries_served.some(
          (c) => c.toLowerCase() === params.targetCountry!.toLowerCase() ||
                 c.toLowerCase() === 'global' || c.toLowerCase() === 'worldwide'
        ) ? 20 : 0
      : 10

    // MOQ compatibility (0–20)
    let moqScore = 0
    if (sup.moq_min != null && sup.moq_min <= params.quantity) {
      if (sup.moq_max == null || sup.moq_max >= params.quantity) {
        moqScore = 20
      } else {
        moqScore = 10
      }
    } else if (sup.moq_min == null) {
      moqScore = 15
    }

    // Lead time compatibility (0–10)
    let leadScore = 10
    if (params.leadTimeDays && sup.lead_time_days_max != null) {
      leadScore = sup.lead_time_days_max <= params.leadTimeDays ? 10
        : sup.lead_time_days_max <= params.leadTimeDays * 1.5 ? 5 : 0
    }

    // Reliability score (0–12)
    const reliability = Math.round((sup.reliability_score / 100) * 12)

    // Response rate (0–8)
    const responseRate = Math.round((sup.response_rate / 100) * 8)

    // Premium boost (0–40 per plan tier)
    const premiumBoost = boostMap.get(sup.supplier_id) ?? 0

    const total = catMatch + countryMatch + moqScore + leadScore + reliability + responseRate + premiumBoost

    results.push({
      supplierId:        sup.supplier_id,
      supplierName:      sup.supplier?.full_name ?? 'Fournisseur',
      totalScore:        total,
      scoreCategory:     catMatch,
      scoreCountry:      countryMatch,
      scoreMoq:          moqScore,
      scoreLeadTime:     leadScore,
      scoreReliability:  reliability,
      scoreResponseRate: responseRate,
    })
  }

  return results.filter((r) => r.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore)
}

// ── Admin: run RFQ engine for a sourcing request ───────────────────────────────

export async function runRfqMatchingForSourcing(
  sourcingRequestId: string,
): Promise<ActionResult> {
  const { supabase, error: authErr, userId } = await requireAdmin()
  if (authErr || !userId) return fail(authErr ?? 'Erreur.')

  const { data: req } = await supabase
    .from('sourcing_requests')
    .select('category, target_country, quantity, delivery_deadline')
    .eq('id', sourcingRequestId)
    .single()

  if (!req) return fail('Demande introuvable.')

  // Compute lead time days from deadline
  let leadTimeDays: number | null = null
  if (req.delivery_deadline) {
    const days = Math.ceil((new Date(req.delivery_deadline).getTime() - Date.now()) / 86400000)
    leadTimeDays = days > 0 ? days : null
  }

  const matches = await scoreSuppliers({
    category:     req.category,
    targetCountry: req.target_country ?? null,
    quantity:     req.quantity,
    leadTimeDays,
  })

  if (matches.length === 0) return fail('Aucun fournisseur correspondant trouvé.')

  // Delete old matches for this request (re-run idempotent)
  await supabase
    .from('rfq_matches')
    .delete()
    .eq('sourcing_request_id', sourcingRequestId)

  // Insert top 10 matches
  const top = matches.slice(0, 10)
  const { error: insertErr } = await supabase.from('rfq_matches').insert(
    top.map((m) => ({
      sourcing_request_id: sourcingRequestId,
      supplier_id:         m.supplierId,
      total_score:         m.totalScore,
      score_category:      m.scoreCategory,
      score_country:       m.scoreCountry,
      score_moq:           m.scoreMoq,
      score_lead_time:     m.scoreLeadTime,
      score_reliability:   m.scoreReliability,
      score_response_rate: m.scoreResponseRate,
      status:              'new' as RfqMatchStatus,
    }))
  )

  if (insertErr) return fail('Erreur lors de l\'enregistrement des matches.')

  // Update sourcing request status to 'matching'
  await supabase
    .from('sourcing_requests')
    .update({ status: 'matching' })
    .eq('id', sourcingRequestId)

  revalidatePath('/admin/rfq')
  revalidatePath('/admin/sourcing')
  return ok
}

// ── Admin: notify matched suppliers ───────────────────────────────────────────

export async function notifyMatchedSuppliers(
  rfqMatchIds: string[],
): Promise<ActionResult> {
  const { supabase, error: authErr, userId } = await requireAdmin()
  if (authErr || !userId) return fail(authErr ?? 'Erreur.')

  const { error } = await supabase
    .from('rfq_matches')
    .update({ status: 'notified' as RfqMatchStatus, notified_at: new Date().toISOString() })
    .in('id', rfqMatchIds)
    .eq('status', 'new')

  if (error) return fail('Erreur lors de la notification.')

  revalidatePath('/admin/rfq')
  revalidatePath('/supplier/opportunities')
  return ok
}

// ── Admin: update match status ────────────────────────────────────────────────

export async function updateMatchStatus(
  matchId: string,
  status: RfqMatchStatus,
): Promise<ActionResult> {
  const { supabase, error: authErr, userId } = await requireAdmin()
  if (authErr || !userId) return fail(authErr ?? 'Erreur.')

  const { error } = await supabase
    .from('rfq_matches')
    .update({ status })
    .eq('id', matchId)

  if (error) return fail('Erreur.')
  revalidatePath('/admin/rfq')
  return ok
}

// ── Supplier: submit offer / decline / clarification ─────────────────────────

export async function submitRfqOffer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: { role: string } | null; error: unknown }
  if (profile?.role !== 'supplier') return fail('Accès réservé aux fournisseurs.')

  const matchId      = (formData.get('rfq_match_id') as string)?.trim()
  const responseType = (formData.get('response_type') as string)?.trim() as RfqOfferResponseType
  const unitPrice    = Number(formData.get('unit_price_usd')) || null
  const moqOffered   = Number(formData.get('moq_offered')) || null
  const leadTime     = Number(formData.get('lead_time_days')) || null
  const notes        = (formData.get('notes') as string | null)?.trim() || null
  const message      = (formData.get('message') as string | null)?.trim() || null

  if (!matchId || !responseType) return fail('Données manquantes.')

  // Verify supplier owns this match
  const { data: match } = await supabase
    .from('rfq_matches')
    .select('id, status')
    .eq('id', matchId)
    .eq('supplier_id', user.id)
    .single()

  if (!match) return fail('Match introuvable.')
  if (match.status === 'expired' || match.status === 'selected') {
    return fail('Ce match n\'est plus actif.')
  }

  // Remove previous offer from this supplier for this match
  await supabase.from('rfq_offers').delete().eq('rfq_match_id', matchId).eq('supplier_id', user.id)

  const { error: insertErr } = await supabase.from('rfq_offers').insert({
    rfq_match_id:  matchId,
    supplier_id:   user.id,
    response_type: responseType,
    unit_price_usd: responseType === 'offer' ? unitPrice : null,
    moq_offered:   responseType === 'offer' ? moqOffered : null,
    lead_time_days: responseType === 'offer' ? leadTime : null,
    notes,
    message,
  })

  if (insertErr) return fail('Erreur lors de la soumission.')

  // Update match status
  const newStatus: RfqMatchStatus =
    responseType === 'offer'         ? 'offer_received' :
    responseType === 'decline'       ? 'declined' :
    'clarification'

  await supabase
    .from('rfq_matches')
    .update({ status: newStatus })
    .eq('id', matchId)

  // Increment total_offers_sent
  const { data: smp } = await supabase
    .from('supplier_matching_profiles')
    .select('total_offers_sent, total_offers_accepted')
    .eq('supplier_id', user.id)
    .single() as { data: { total_offers_sent: number; total_offers_accepted: number } | null; error: unknown }

  if (smp) {
    await supabase
      .from('supplier_matching_profiles')
      .update({
        total_offers_sent: smp.total_offers_sent + 1,
        total_offers_accepted: responseType === 'offer' ? smp.total_offers_accepted : smp.total_offers_accepted,
      })
      .eq('supplier_id', user.id)
  }

  revalidatePath('/supplier/opportunities')
  revalidatePath('/admin/rfq')
  return ok
}

// ── Auto-run RFQ engine after sourcing request creation ───────────────────────
// Called from sourcing.ts after insert when matching profiles exist.

export async function autoRunRfqForSourcing(
  sourcingRequestId: string,
): Promise<void> {
  try {
    const supabase = await createClient()

    const { data: req } = await supabase
      .from('sourcing_requests')
      .select('category, target_country, quantity, delivery_deadline')
      .eq('id', sourcingRequestId)
      .single()

    if (!req) return

    let leadTimeDays: number | null = null
    if (req.delivery_deadline) {
      const days = Math.ceil((new Date(req.delivery_deadline).getTime() - Date.now()) / 86400000)
      leadTimeDays = days > 0 ? days : null
    }

    const matches = await scoreSuppliers({
      category:      req.category,
      targetCountry: req.target_country ?? null,
      quantity:      req.quantity,
      leadTimeDays,
    })

    if (!matches.length) return

    const top = matches.slice(0, 10)
    await supabase.from('rfq_matches').insert(
      top.map((m) => ({
        sourcing_request_id: sourcingRequestId,
        supplier_id:         m.supplierId,
        total_score:         m.totalScore,
        score_category:      m.scoreCategory,
        score_country:       m.scoreCountry,
        score_moq:           m.scoreMoq,
        score_lead_time:     m.scoreLeadTime,
        score_reliability:   m.scoreReliability,
        score_response_rate: m.scoreResponseRate,
        status:              'notified' as RfqMatchStatus,
        notified_at:         new Date().toISOString(),
      }))
    )

    // Update sourcing request to matching
    await supabase
      .from('sourcing_requests')
      .update({ status: 'matching' })
      .eq('id', sourcingRequestId)
  } catch {
    // silent — non-blocking
  }
}
