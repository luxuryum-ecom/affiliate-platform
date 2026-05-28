import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Order, Commission, Product } from '@/types/database'

export const metadata = {
  title: 'Mes commandes — Espace Affilié',
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-gray-100 text-gray-500' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée ✓',   cls: 'bg-green-100 text-green-700' },
  returned:  { label: 'Retournée',   cls: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

const COMMISSION_STATUS: Record<string, string> = {
  pending:   'Pending delivery',
  confirmed: 'Shipping…',
  shipped:   'Shipping…',
  delivered: 'Commission confirmée',
  returned:  'Aucune commission',
  cancelled: 'Aucune commission',
}

type OrderRow = Order & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> }

export default async function AffiliateOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes, commissionsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('orders')
      .select('*, product:products(id, name, images)')
      .eq('affiliate_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id),
  ])

  const profile    = profileRes.data as { full_name: string } | null
  const orders     = (ordersRes.data  ?? []) as unknown as OrderRow[]
  const commissions = (commissionsRes.data ?? []) as Commission[]

  const commMap = new Map(commissions.map((c) => [c.order_id, c]))

  // Summary stats
  const pending   = orders.filter((o) => ['pending', 'confirmed', 'shipped'].includes(o.status)).length
  const delivered = orders.filter((o) => o.status === 'delivered').length
  const returned  = orders.filter((o) => o.status === 'returned').length
  const totalEarned = commissions
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + Number(c.amount), 0)
  const totalPending = commissions
    .filter((c) => c.status === 'pending')
    .reduce((s, c) => s + Number(c.amount), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mes commandes</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'En cours',         value: String(pending) },
            { label: 'Livrées',          value: String(delivered) },
            { label: 'Retournées',       value: String(returned) },
            { label: 'Commissions dues', value: formatMAD(totalPending) },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {totalEarned > 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            🎉 Total commissions payées&nbsp;: <strong>{formatMAD(totalEarned)}</strong>
          </div>
        )}

        <h2 className="text-sm font-semibold text-gray-900 mb-3">Historique ({orders.length})</h2>

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune commande pour l&apos;instant.</p>
            <Link
              href="/affiliate/products"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              Parcourir le catalogue →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {orders.map((order) => {
              const badge    = STATUS_BADGE[order.status]  ?? STATUS_BADGE.pending
              const commNote = COMMISSION_STATUS[order.status] ?? ''
              const comm     = commMap.get(order.id)
              const thumb    = order.product.images?.[0]

              return (
                <div key={order.id} className="flex items-start gap-3 p-4">
                  {/* Thumbnail */}
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={order.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-300">
                        {order.product.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-gray-900 truncate">
                      {order.product.name} × {order.quantity}
                    </p>

                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.customer_city} ·{' '}
                      <span className="font-medium text-gray-700">
                        {formatMAD(order.total_amount)}
                      </span>
                    </p>

                    {/* Commission preview */}
                    <p className="text-xs mt-1">
                      {comm ? (
                        <span className={`font-medium ${
                          comm.status === 'paid'    ? 'text-green-600' :
                          comm.status === 'approved' ? 'text-blue-600' :
                          'text-amber-600'
                        }`}>
                          Commission&nbsp;: {formatMAD(Number(comm.amount))} ({comm.status})
                        </span>
                      ) : order.commission_amount > 0 ? (
                        <span className="text-gray-400">
                          Commission prévue&nbsp;: {formatMAD(order.commission_amount)} — {commNote}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                    {new Date(order.created_at).toLocaleDateString('fr-MA', {
                      day: '2-digit', month: 'short'
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
