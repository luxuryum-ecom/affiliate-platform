'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'

export async function recordAffiliateClick(
  affiliateId: string,
  productId: string,
  sessionId: string | null
): Promise<{ clickId: string | null }> {
  if (!affiliateId || !productId) return { clickId: null }

  // Validate affiliate via anon client (profiles is readable by anon for this check).
  const supabase = await createClient()

  const { data: affiliate } = (await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', affiliateId)
    .single()) as { data: { id: string; role: string; status: string } | null; error: unknown }

  if (affiliate?.role !== 'affiliate' || affiliate.status !== 'approved') {
    return { clickId: null }
  }

  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent') ?? undefined
  const referrerPath = hdrs.get('referer') ?? undefined

  // INSERT via service_role to bypass "clicks: anon insert" policy (removed in migration 047).
  const adminClient = createAdminClient()

  const { data: click } = (await adminClient
    .from('affiliate_clicks')
    .insert({
      affiliate_id: affiliateId,
      product_id: productId,
      session_id: sessionId,
      referrer_path: referrerPath,
      user_agent: userAgent,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: unknown }

  return { clickId: click?.id ?? null }
}
