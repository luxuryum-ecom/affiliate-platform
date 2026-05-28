import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildCodTimeline } from '@/components/shared/order-timeline'
import type { Order, Commission, Product } from '@/types/database'

export const metadata = {
  title: 'Mes commandes — Espace Affilié',
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'À confirmer', cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée ✓',   cls: 'bg-green-100 text-green-700' },
  returned:  { label: 'Retournée',   cls: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

const PAYOUT_LABELS: Record<string, string> = {
  pending_confirmation: 'En attente de confirmation client',
  confirmed: 'En cours de traitement',
  shipped: 'En cours de livraison',
  delivered: 'Commission en attente d\'approbation',
  returned: 'Aucune commission (retour)',
  cancelled: 'Aucune commission (annulée)',
}

type OrderRow = Order & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> }

export default async function AffiliateOrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes, commissionsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).single(),
    supabase
      .from('orders')
      .select('*, product:products(id, name, images, media)')
      .eq('affiliate_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id),
  ])

  const profile = profileRes.data as { full_name: string } | null
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const commissions = (commissionsRes.data ?? []) as Commission[]

  const commMap = new Map(commissions.map((c) => [c.order_id, c]))

  const inProgress = orders.filter((o) =>
    ['pending_confirmation', 'confirmed', 'shipped'].includes(o.status)
  ).length
  const delivered = orders.filter((o) => o.status === 'delivered').length
  const returned = orders.filter((o) => o.status === 'returned').length
  // pending + approved = owed but not yet paid (matches dashboard pendingBalance)
  const totalPending = commissions
    .filter((c) => c.status === 'pending' || c.status === 'approved')
    .reduce((s, c) => s + Number(c.amount), 0)
  const totalEarned = commissions
    .filter((c) => c.status === 'paid')
    .reduce((s, c) => s + Number(c.amount), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/affiliate/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'En cours', value: String(inProgress) },
            { label: 'Livrées', value: String(delivered) },
            { label: 'Retournées', value: String(returned) },
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
            Total commissions payées&nbsp;: <strong>{formatMAD(totalEarned)}</strong>
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
          <div className="space-y-4">
            {orders.map((order) => {
              const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending_confirmation
              const comm = commMap.get(order.id)
              const coverUrl = getProductCoverUrl(order.product)
              const commissionAmount =
                order.affiliate_commission_mad_snapshot ?? order.commission_amount
              const timeline = buildCodTimeline(order)

              return (
                <article
                  key={order.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-4">
                    <ProductThumbnail
                      src={coverUrl}
                      name={order.product.name}
                      className="w-12 h-12 rounded-lg border text-[10px] shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-gray-900">
                        {order.product.name} × {order.quantity}
                      </p>

                      <p className="text-xs text-gray-500 mt-0.5">
                        {order.customer_city} · {formatMAD(order.total_amount)} ·{' '}
                        {new Date(order.created_at).toLocaleDateString('fr-MA', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>

                      <p className="text-xs mt-1.5">
                        {comm ? (
                          <span
                            className={`font-medium ${
                              comm.status === 'paid'
                                ? 'text-green-600'
                                : comm.status === 'approved'
                                ? 'text-blue-600'
                                : 'text-amber-600'
                            }`}
                          >
                            Commission&nbsp;: {formatMAD(Number(comm.amount))} —{' '}
                            {comm.status === 'paid'
                              ? 'Payée'
                              : comm.status === 'approved'
                              ? 'Approuvée'
                              : 'En attente'}
                          </span>
                        ) : commissionAmount > 0 ? (
                          <span className="text-gray-400">
                            Commission prévue&nbsp;: {formatMAD(commissionAmount)} —{' '}
                            {PAYOUT_LABELS[order.status]}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                    <p className="text-xs font-medium text-gray-500 mb-2">Suivi</p>
                    <OrderTimeline steps={timeline} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
