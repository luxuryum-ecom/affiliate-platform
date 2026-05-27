import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Order, Product, Profile } from '@/types/database'

export const metadata = { title: 'Commandes COD — Administration' }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-gray-100 text-gray-500' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700' },
  returned:  { label: 'Retournée',   cls: 'bg-red-100 text-red-500' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

type OrderRow = Order & {
  product: Pick<Product, 'id' | 'name' | 'images'>
  affiliate: Pick<Profile, 'id' | 'full_name'> | null
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status: filterStatus } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const profile = profileRes.data as { full_name: string } | null

  let query = supabase
    .from('orders')
    .select('*, product:products(id, name, images), affiliate:profiles!affiliate_id(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filterStatus) query = query.eq('status', filterStatus)

  const { data: orders } = (await query) as { data: OrderRow[] | null; error: unknown }
  const list = orders ?? []

  // Summary counts
  const { data: allCounts } = (await supabase
    .from('orders')
    .select('status')) as { data: { status: string }[] | null; error: unknown }

  const countsByStatus = (allCounts ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled'] as const

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Commandes COD</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/admin/orders"
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterStatus ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tous ({(allCounts ?? []).length})
          </Link>
          {statuses.map((s) => {
            const cnt = countsByStatus[s] ?? 0
            if (cnt === 0 && !filterStatus) return null
            return (
              <Link
                key={s}
                href={`/admin/orders?status=${s}`}
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

        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune commande{filterStatus ? ' pour ce statut' : ''} pour le moment.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {list.map((order) => {
              const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
              const thumb = order.product?.images?.[0]
              return (
                <div key={order.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                    {thumb
                      ? <img src={thumb} alt={order.product?.name} className="w-full h-full object-cover" />  // eslint-disable-line @next/next/no-img-element
                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-300">{order.product?.name?.slice(0,2).toUpperCase()}</div>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">#{order.id.slice(0,8).toUpperCase()}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      {!order.affiliate_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Direct</span>
                      )}
                    </div>

                    <p className="text-sm font-medium text-gray-900 truncate">
                      {order.customer_name} — {order.customer_city}
                    </p>

                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.product?.name} × {order.quantity}
                      {' · '}
                      <strong className="text-gray-700">{formatMAD(order.total_amount)}</strong>
                      {order.affiliate && (
                        <> · Affilié&nbsp;: {order.affiliate.full_name}</>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-400 tabular-nums">
                      {new Date(order.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}
                    </span>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Détails →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
