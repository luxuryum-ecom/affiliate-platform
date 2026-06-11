// ─── Limite de produits par abonnement — vérif serveur réutilisable ──────────
// Utilisable avec le client RLS (web) OU service_role (Telegram/CSV). C'est LA
// barrière unique : les 3 canaux d'ajout (web, Telegram, CSV) DOIVENT l'appeler
// avant insertion. max_products = 0 ⇒ illimité ; défaut (free) = 5.

import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type ProductLimit = {
  currentCount: number
  maxAllowed: number
  isUnlimited: boolean
  isAtLimit: boolean
  remaining: number
  planSlug: string
  planName: string
}

export async function checkProductLimit(
  supabase: ServerClient,
  supplierId: string,
): Promise<ProductLimit> {
  const [subResult, countResult] = await Promise.all([
    supabase
      .from('supplier_subscriptions')
      .select('plan:premium_plans(slug, name, max_products)')
      .eq('supplier_id', supplierId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('supplier_products')
      .select('*', { count: 'exact', head: true })
      .eq('supplier_id', supplierId)
      .is('archived_at', null),
  ])

  const rawPlan = (subResult.data as { plan: unknown } | null)?.plan
  const plan = (Array.isArray(rawPlan) ? rawPlan[0] : rawPlan) as
    | { slug: string; name: string; max_products: number }
    | null

  const planSlug = plan?.slug ?? 'free'
  const planName = plan?.name ?? 'Gratuit'
  const maxAllowed = plan?.max_products ?? 5
  const isUnlimited = maxAllowed === 0
  const currentCount = (countResult as { count: number | null }).count ?? 0
  const isAtLimit = !isUnlimited && currentCount >= maxAllowed
  const remaining = isUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, maxAllowed - currentCount)

  return { currentCount, maxAllowed, isUnlimited, isAtLimit, remaining, planSlug, planName }
}
