import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { InventoryCountPanel, type InventoryLineItem } from '@/components/admin/guardian/inventory-count-panel'
import type { Profile } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.inventory')
  return { title: t('metaTitle') }
}

interface SnapshotRow {
  id: string
  period_label: string
  status: string
  started_at: string
  closed_at: string | null
}
interface LineRow {
  id: string
  variant_id: string
  product_id: string | null
  expected_qty: number
  counted_qty: number | null
  delta: number
}
interface VariantRow {
  id: string
  attributes: Record<string, string> | null
  sku: string | null
}
interface ProductRow {
  id: string
  name: string
}

/**
 * Inventaire mensuel guidé (module Livreurs, Lot G). Compte physique vs stock
 * système figé à l'ouverture ; écarts chiffrés à la clôture (guardian_alerts
 * `inventory_delta`). Le layout admin garantit déjà role admin/agent ; la VRAIE
 * autorisation (`depot_supervision`) est revérifiée côté action (`_guards.ts`).
 */
export default async function AdminCouriersInventoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()) as { data: Profile | null; error: unknown }

  const t = await getTranslations('admin.inventory')
  const tc = await getTranslations('admin.common')

  const isAdmin = profile?.role === 'admin'
  let hasAccess = isAdmin
  if (!hasAccess) {
    const { data: hasCap } = (await supabase.rpc('has_capability', {
      p_capability: 'depot_supervision',
    })) as { data: boolean | null; error: unknown }
    hasAccess = Boolean(hasCap)
  }

  let snapshot: { id: string; periodLabel: string; status: string } | null = null
  let lines: InventoryLineItem[] = []
  let closedDeltasCount = 0

  if (hasAccess) {
    const { data: snap } = (await supabase
      .from('inventory_snapshots')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: SnapshotRow | null; error: unknown }

    if (snap) {
      snapshot = { id: snap.id, periodLabel: snap.period_label, status: snap.status }

      const { data: lineRows } = (await supabase
        .from('inventory_snapshot_lines')
        .select('*')
        .eq('snapshot_id', snap.id)
        .order('created_at', { ascending: true })) as { data: LineRow[] | null; error: unknown }

      const rows = lineRows ?? []
      const variantIds = rows.map((r) => r.variant_id)
      const productIds = Array.from(
        new Set(rows.map((r) => r.product_id).filter((id): id is string => Boolean(id))),
      )

      const [variantsRes, productsRes] = await Promise.all([
        variantIds.length > 0
          ? supabase.from('product_variants').select('id, attributes, sku').in('id', variantIds)
          : Promise.resolve({ data: [] as VariantRow[] }),
        productIds.length > 0
          ? supabase.from('products').select('id, name').in('id', productIds)
          : Promise.resolve({ data: [] as ProductRow[] }),
      ])

      const variantById = new Map(((variantsRes.data ?? []) as VariantRow[]).map((v) => [v.id, v]))
      const productNameById = new Map(((productsRes.data ?? []) as ProductRow[]).map((p) => [p.id, p.name]))

      lines = rows.map((r) => {
        const variant = variantById.get(r.variant_id)
        const attrLabel = Object.values(variant?.attributes ?? {})
          .filter(Boolean)
          .join(' / ')
        const productName = r.product_id ? productNameById.get(r.product_id) ?? '' : ''
        const label = [productName, attrLabel || variant?.sku || ''].filter(Boolean).join(' — ')
        return {
          variantId: r.variant_id,
          label: label || r.variant_id.slice(0, 8).toUpperCase(),
          expectedQty: r.expected_qty,
          countedQty: r.counted_qty,
        }
      })

      if (snap.status === 'closed') {
        closedDeltasCount = rows.filter((r) => r.counted_qty !== null && r.delta !== 0).length
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg text-foreground">
      {/* Navbar — identique aux autres pages admin/couriers */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted hover:text-foreground transition-colors">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        <div>
          <Link href="/admin/couriers" className="text-xs text-muted hover:text-foreground transition-colors">
            ← {tc('dashboard')}
          </Link>
          <h1 className="text-lg font-semibold text-foreground mt-1">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('subtitle')}</p>
        </div>

        {!hasAccess ? (
          <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
            {t('accessDenied')}
          </p>
        ) : (
          <InventoryCountPanel snapshot={snapshot} lines={lines} closedDeltasCount={closedDeltasCount} canClose={isAdmin} />
        )}
      </main>
    </div>
  )
}
