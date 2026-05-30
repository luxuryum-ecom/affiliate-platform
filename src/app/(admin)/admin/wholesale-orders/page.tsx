import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD, getWholesaleTier } from '@/lib/utils'
import { createWholesaleOrderAction } from '@/app/actions/orders'
import type { WholesaleOrder, Profile, WholesaleCartItemWithProduct, WholesaleImportStatus } from '@/types/database'

export const metadata = { title: 'Commandes grossiste — Administration' }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  sourcing:  { label: 'En sourcing', cls: 'bg-purple-100 text-purple-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

const IMPORT_STATUS_BADGE: Record<WholesaleImportStatus, { label: string; cls: string }> = {
  awaiting_supplier: { label: 'Attente fournisseur', cls: 'bg-gray-100 text-gray-500' },
  purchased:         { label: 'Acheté',              cls: 'bg-amber-100 text-amber-700' },
  in_production:     { label: 'En production',       cls: 'bg-orange-100 text-orange-700' },
  ready_to_ship:     { label: 'Prêt à expédier',     cls: 'bg-yellow-100 text-yellow-700' },
  shipped:           { label: 'Expédié',             cls: 'bg-blue-100 text-blue-700' },
  customs_clearance: { label: 'Dédouanement',        cls: 'bg-purple-100 text-purple-700' },
  delivered:         { label: 'Livré (import)',      cls: 'bg-green-100 text-green-700' },
}

type OrderWithBuyer = WholesaleOrder & { buyer: Pick<Profile, 'id' | 'full_name' | 'phone'> }
type CartBuyer = { buyer: Pick<Profile, 'id' | 'full_name'>; items: WholesaleCartItemWithProduct[]; total: number }

export default async function AdminWholesaleOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const [ordersRes, cartsRes] = await Promise.all([
    supabase
      .from('wholesale_orders')
      .select('*, buyer:profiles!buyer_id(id, full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('wholesale_cart_items')
      .select('*, product:products(*)')
      .order('added_at'),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderWithBuyer[]
  const allCartItems = (cartsRes.data ?? []) as unknown as WholesaleCartItemWithProduct[]

  // Group cart items by buyer
  const buyerMap = new Map<string, CartBuyer>()
  for (const item of allCartItems) {
    if (!buyerMap.has(item.buyer_id)) {
      // Fetch buyer profile (we need their name)
      buyerMap.set(item.buyer_id, { buyer: { id: item.buyer_id, full_name: '…' }, items: [], total: 0 })
    }
    buyerMap.get(item.buyer_id)!.items.push(item)
  }
  // Fetch buyer profiles for pending carts
  if (buyerMap.size > 0) {
    const buyerIds = [...buyerMap.keys()]
    const { data: buyers } = (await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', buyerIds)) as { data: { id: string; full_name: string }[] | null; error: unknown }
    for (const b of buyers ?? []) {
      const entry = buyerMap.get(b.id)
      if (entry) entry.buyer = b
    }
  }
  // Calculate totals
  for (const entry of buyerMap.values()) {
    entry.total = entry.items.reduce((sum, item) => {
      const tier = getWholesaleTier(item.product.wholesale_tiers, item.quantity)
      const price = tier ? tier.price_per_unit : item.product.sell_price
      return sum + price * item.quantity
    }, 0)
  }
  const pendingCarts = [...buyerMap.values()]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Commandes grossiste</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{adminProfile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* ── Pending carts section ── */}
        {pendingCarts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Paniers en attente de conversion</h2>
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">
                {pendingCarts.length}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 divide-y divide-gray-100">
              {pendingCarts.map(({ buyer, items, total }) => (
                <div key={buyer.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{buyer.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {items.length} article{items.length !== 1 ? 's' : ''} ·{' '}
                      Total estimé&nbsp;: <strong>{formatMAD(total)}</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {items.map((i) => `${i.product.name} ×${i.quantity}`).join(', ')}
                    </p>
                  </div>
                  <form action={createWholesaleOrderAction} className="shrink-0">
                    <input type="hidden" name="buyerId" value={buyer.id} />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Créer la commande →
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Orders list ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Commandes ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-sm text-gray-400">Aucune commande grossiste pour le moment.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {orders.map((order) => {
                const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
                const importBadge = order.import_status
                  ? IMPORT_STATUS_BADGE[order.import_status]
                  : null
                return (
                  <div key={order.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">#{order.id.slice(0,8).toUpperCase()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                        {importBadge && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importBadge.cls}`}>
                            {importBadge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{order.buyer?.full_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Vente&nbsp;: <strong>{formatMAD(order.total_amount)}</strong>
                        {order.gross_profit_mad != null && (
                          <>
                            {' · '}
                            Profit&nbsp;:{' '}
                            <strong className={order.gross_profit_mad >= 0 ? 'text-green-600' : 'text-red-500'}>
                              {formatMAD(order.gross_profit_mad)}
                            </strong>
                            {order.gross_margin_percent != null && (
                              <span className="text-gray-400"> ({order.gross_margin_percent.toFixed(1)}%)</span>
                            )}
                          </>
                        )}
                        {' · '}
                        {new Date(order.created_at).toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'numeric' })}
                      </p>
                    </div>
                    <Link
                      href={`/admin/wholesale-orders/${order.id}`}
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      Détails →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
