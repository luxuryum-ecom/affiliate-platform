import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderFilters } from '@/components/admin/order-filters'
import { QuickStatusButton } from '@/components/admin/quick-status-button'
import type { Order, Product, Profile, OrderStatus } from '@/types/database'

export const metadata = { title: 'Commandes COD — Administration' }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'À confirmer', cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700' },
  returned:  { label: 'Retournée',   cls: 'bg-red-100 text-red-500' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

type OrderRow = Order & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media'>
  affiliate: Pick<Profile, 'id' | 'full_name'> | null
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    search?: string
    affiliate_id?: string
  }>
}

const STATUSES: OrderStatus[] = ['pending_confirmation', 'confirmed', 'shipped', 'delivered', 'returned']

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status: filterStatus, search, affiliate_id } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const profile = profileRes.data as { full_name: string } | null

  // ── Fetch affiliates for filter dropdown ──────────────────────────────────
  const { data: affiliateRows } = (await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'affiliate')
    .eq('status', 'approved')
    .order('full_name')) as {
    data: { id: string; full_name: string }[] | null
    error: unknown
  }
  const affiliates = affiliateRows ?? []

  // ── Build orders query ────────────────────────────────────────────────────
  let query = supabase
    .from('orders')
    .select('*, product:products(id, name, images, media), affiliate:profiles!affiliate_id(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (filterStatus)  query = query.eq('status', filterStatus)
  if (affiliate_id)  query = query.eq('affiliate_id', affiliate_id)
  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`customer_name.ilike.${term},customer_phone.ilike.${term}`)
  }

  const { data: orders } = (await query) as { data: OrderRow[] | null; error: unknown }
  const list = orders ?? []

  // ── Status counts (always over full dataset) ──────────────────────────────
  const { data: allStatuses } = (await supabase
    .from('orders')
    .select('status')) as { data: { status: string }[] | null; error: unknown }
  const countMap = (allStatuses ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const isFiltered = !!(filterStatus || search || affiliate_id)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm shrink-0">
              ← Dashboard
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">Commandes COD</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* Search + affiliate filter */}
        <Suspense fallback={null}>
          <OrderFilters affiliates={affiliates} />
        </Suspense>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href="/admin/orders"
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterStatus && !isFiltered
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tous ({(allStatuses ?? []).length})
          </Link>
          {STATUSES.map((s) => {
            const cnt = countMap[s] ?? 0
            return (
              <Link
                key={s}
                href={`/admin/orders?status=${s}${search ? `&search=${encodeURIComponent(search)}` : ''}${affiliate_id ? `&affiliate_id=${affiliate_id}` : ''}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterStatus === s
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {STATUS_BADGE[s].label} ({cnt})
              </Link>
            )
          })}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">
            {list.length} commande{list.length !== 1 ? 's' : ''}
            {isFiltered ? ' (filtré)' : ''}
          </p>
        </div>

        {/* Order list */}
        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune commande{isFiltered ? ' pour ce filtre' : ''}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {list.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Single order row / card ──────────────────────────────────────────────────

function OrderRow({ order }: { order: OrderRow }) {
  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending_confirmation
  const coverUrl = order.product ? getProductCoverUrl(order.product) : null
  const ref   = order.id.slice(0, 8).toUpperCase()

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      {/* Row: thumbnail + content + actions */}
      <div className="flex items-start gap-3">
        <ProductThumbnail
          src={coverUrl}
          name={order.product?.name ?? 'Produit'}
          className="w-10 h-10 rounded-lg border border-gray-200 text-[10px]"
        />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Header line: ref + status + date */}
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="text-xs font-mono text-gray-400">#{ref}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            {!order.affiliate_id && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Direct</span>
            )}
            <span className="text-xs text-gray-300 ml-auto hidden sm:block tabular-nums">
              {new Date(order.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}
            </span>
          </div>

          {/* Customer line */}
          <p className="text-sm font-medium text-gray-900 truncate">
            {order.customer_name}
            <span className="font-normal text-gray-500"> — {order.customer_city}</span>
          </p>

          {/* Product + total line */}
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {order.product?.name} × {order.quantity}
            {' · '}
            <strong className="text-gray-700">{formatMAD(order.total_amount)}</strong>
            {order.affiliate && <> · <span className="text-blue-600">{order.affiliate.full_name}</span></>}
          </p>

          {/* COD anomaly flag */}
          {order.cod_received != null &&
           order.cod_expected != null &&
           order.cod_received < order.cod_expected && (
            <p className="text-xs text-red-500 mt-0.5">
              ⚠ Écart COD: attendu {formatMAD(order.cod_expected)} · reçu {formatMAD(order.cod_received)}
            </p>
          )}
        </div>

        {/* Detail link (desktop) */}
        <Link
          href={`/admin/orders/${order.id}`}
          className="shrink-0 text-xs text-blue-600 hover:underline hidden sm:block"
        >
          Détails →
        </Link>
      </div>

      {/* Quick actions + mobile link */}
      <div className="flex flex-wrap items-center gap-2 mt-2 pl-10 sm:pl-[52px]">
        <QuickActions order={order} />
        <Link
          href={`/admin/orders/${order.id}`}
          className="text-xs text-blue-600 hover:underline sm:hidden"
        >
          Voir →
        </Link>
      </div>
    </div>
  )
}

// Quick action buttons based on current status
function QuickActions({ order }: { order: OrderRow }) {
  if (order.status === 'pending_confirmation') {
    return (
      <QuickStatusButton orderId={order.id} newStatus="confirmed" label="✓ Confirmer" variant="confirm" />
    )
  }
  if (order.status === 'confirmed') {
    return (
      <QuickStatusButton orderId={order.id} newStatus="shipped" label="→ Expédier" variant="ship" />
    )
  }
  if (order.status === 'shipped') {
    return (
      <>
        <QuickStatusButton orderId={order.id} newStatus="delivered" label="✓ Livré" variant="deliver" />
        <QuickStatusButton orderId={order.id} newStatus="returned" label="↩ Retour" variant="cancel" />
      </>
    )
  }
  return null
}
