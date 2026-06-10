'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './_guards'
import type {
  PremiumPlan,
  SupplierSubscription,
  SubscriptionStatus,
  SupplierSubscriptionWithDetails,
  Profile,
} from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const ok: ActionResult = { error: null, success: true }
const fail = (msg: string): ActionResult => ({ error: msg, success: false })

// ── Public read helpers ───────────────────────────────────────────────────────

export async function getPremiumPlans(): Promise<PremiumPlan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('premium_plans')
    .select('*')
    .eq('active', true)
    .order('display_order') as { data: PremiumPlan[] | null; error: unknown }
  return data ?? []
}

export async function getSupplierSubscription(
  supplierId: string,
): Promise<(SupplierSubscription & { plan: PremiumPlan }) | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('supplier_subscriptions')
    .select('*, plan:premium_plans(*)')
    .eq('supplier_id', supplierId)
    .eq('status', 'active')
    .maybeSingle() as {
      data: (SupplierSubscription & { plan: PremiumPlan }) | null
      error: unknown
    }
  return data
}

/** Returns subscription info for the currently logged-in supplier. */
export async function getMySubscription(): Promise<
  (SupplierSubscription & { plan: PremiumPlan }) | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getSupplierSubscription(user.id)
}

/** Fetches all suppliers with their current subscription (admin view). */
export async function getAllSupplierSubscriptions(): Promise<
  SupplierSubscriptionWithDetails[]
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('supplier_subscriptions')
    .select('*, plan:premium_plans(*), supplier:profiles!supplier_subscriptions_supplier_id_fkey(id, full_name, phone, city)')
    .order('created_at', { ascending: false }) as {
      data: SupplierSubscriptionWithDetails[] | null
      error: unknown
    }
  return data ?? []
}

/** Returns all approved suppliers — including those without an active subscription (free tier). */
export async function getAllSuppliersForAdmin(): Promise<{
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
  subscription: (SupplierSubscription & { plan: PremiumPlan }) | null
}[]> {
  const supabase = await createClient()

  const [suppliersRes, subsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, city')
      .eq('role', 'supplier')
      .eq('status', 'approved')
      .order('full_name'),
    supabase
      .from('supplier_subscriptions')
      .select('*, plan:premium_plans(*)')
      .eq('status', 'active'),
  ])

  type SupplierRow = Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
  type SubRow = SupplierSubscription & { plan: PremiumPlan }

  const suppliers = (suppliersRes.data ?? []) as SupplierRow[]
  const subs = (subsRes.data ?? []) as SubRow[]
  const subMap = new Map(subs.map((s) => [s.supplier_id, s]))

  return suppliers.map((supplier) => ({
    supplier,
    subscription: subMap.get(supplier.id) ?? null,
  }))
}

// ── Admin mutations ───────────────────────────────────────────────────────────

export async function assignPlan(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { userId, error: authErr } = await requireAdmin()
  if (authErr || !userId) return fail('Accès réservé aux admins.')
  const user = { id: userId }

  const supplierId = (formData.get('supplier_id') as string | null)?.trim()
  const planSlug   = (formData.get('plan_slug')   as string | null)?.trim()
  const expiresAt  = (formData.get('expires_at')  as string | null)?.trim() || null
  const status     = ((formData.get('status')     as string | null)?.trim() ?? 'active') as SubscriptionStatus
  const notes      = (formData.get('notes')       as string | null)?.trim() || null

  if (!supplierId || !planSlug) return fail('Fournisseur et plan requis.')

  const supabase = await createClient()

  const { data: planData } = await supabase
    .from('premium_plans')
    .select('id, slug, name')
    .eq('slug', planSlug)
    .single()
  const plan = planData as Pick<PremiumPlan, 'id' | 'slug' | 'name'> | null
  if (!plan) return fail('Plan introuvable.')

  // Fetch current subscription for audit log
  const { data: existingData } = await supabase
    .from('supplier_subscriptions')
    .select('id, plan:premium_plans(slug), status')
    .eq('supplier_id', supplierId)
    .maybeSingle()
  const existing = existingData as { id: string; plan: { slug: string } | { slug: string }[] | null; status: string } | null
  const existingPlanSlug = Array.isArray(existing?.plan) ? existing?.plan[0]?.slug : (existing?.plan as { slug: string } | null)?.slug

  // Upsert subscription
  const { error: upsertErr } = await supabase
    .from('supplier_subscriptions')
    .upsert(
      {
        supplier_id: supplierId,
        plan_id:     plan.id,
        status,
        started_at:  new Date().toISOString(),
        expires_at:  expiresAt ?? null,
        notes,
        assigned_by: user.id,
      },
      { onConflict: 'supplier_id' },
    )
  if (upsertErr) return fail('Erreur lors de la mise à jour du plan.')

  // Audit log
  await supabase.from('subscription_audit_log').insert({
    supplier_id:   supplierId,
    old_plan_slug: existingPlanSlug ?? null,
    new_plan_slug: plan.slug,
    old_status:    existing?.status ?? null,
    new_status:    status,
    changed_by:    user.id,
    notes,
  })

  revalidatePath('/admin/premium')
  revalidatePath('/supplier/premium')
  return ok
}

export async function cancelSubscription(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { userId, error: authErr } = await requireAdmin()
  if (authErr || !userId) return fail('Accès réservé aux admins.')
  const user = { id: userId }

  const supplierId = (formData.get('supplier_id') as string | null)?.trim()
  const notes      = (formData.get('notes')       as string | null)?.trim() || null
  if (!supplierId) return fail('Fournisseur requis.')

  const supabase = await createClient()

  const { data: existingCancelData } = await supabase
    .from('supplier_subscriptions')
    .select('id, plan:premium_plans(slug), status')
    .eq('supplier_id', supplierId)
    .maybeSingle()
  const existingCancel = existingCancelData as { id: string; plan: { slug: string } | { slug: string }[] | null; status: string } | null
  if (!existingCancel) return fail('Aucun abonnement actif trouvé.')

  const cancelPlanSlug = Array.isArray(existingCancel.plan) ? existingCancel.plan[0]?.slug : (existingCancel.plan as { slug: string } | null)?.slug

  const { error } = await supabase
    .from('supplier_subscriptions')
    .update({ status: 'cancelled', notes })
    .eq('supplier_id', supplierId)
  if (error) return fail('Erreur lors de la résiliation.')

  await supabase.from('subscription_audit_log').insert({
    supplier_id:   supplierId,
    old_plan_slug: cancelPlanSlug ?? null,
    new_plan_slug: cancelPlanSlug ?? 'free',
    old_status:    existingCancel.status,
    new_status:    'cancelled',
    changed_by:    user.id,
    notes,
  })

  revalidatePath('/admin/premium')
  revalidatePath('/supplier/premium')
  return ok
}

/** Check if the supplier has reached their product listing limit. */
export async function getProductLimitStatus(supplierId: string): Promise<{
  currentCount: number
  maxAllowed: number
  isUnlimited: boolean
  isAtLimit: boolean
  planSlug: string
  planName: string
}> {
  const supabase = await createClient()

  const [subResult, countResult] = await Promise.all([
    getSupplierSubscription(supplierId),
    supabase
      .from('supplier_products')
      .select('*', { count: 'exact', head: true })
      .eq('supplier_id', supplierId)
      .is('archived_at', null),
  ])

  const planSlug  = subResult?.plan.slug ?? 'free'
  const planName  = subResult?.plan.name ?? 'Gratuit'
  const maxAllowed = subResult?.plan.max_products ?? 5
  const isUnlimited = maxAllowed === 0
  const currentCount = countResult.count ?? 0

  return {
    currentCount,
    maxAllowed,
    isUnlimited,
    isAtLimit: !isUnlimited && currentCount >= maxAllowed,
    planSlug,
    planName,
  }
}
