import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { OrderStatusForm } from '@/components/admin/order-status-form'
import { OrderTimeline, buildCodTimeline } from '@/components/shared/order-timeline'
import type { Order, Product, Profile, Commission } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée ✓',   cls: 'bg-green-100 text-green-700' },
  returned:  { label: 'Retournée',   cls: 'bg-red-100 text-red-500' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

type OrderDetail = Order & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sell_price' | 'commission_amount'>
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
}

export default async function AdminOrderDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const [orderRes, commissionRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, product:products(id,name,images,media,sell_price,commission_amount), affiliate:profiles!affiliate_id(id,full_name,phone,city)')
      .eq('id', id)
      .single(),
    supabase.from('commissions').select('*').eq('order_id', id).maybeSingle(),
  ])

  const order = orderRes.data as unknown as OrderDetail | null
  const commission = commissionRes.data as Commission | null

  if (!order) notFound()

  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const thumb = order.product?.media?.[0]?.url ?? order.product?.images?.[0]

  const timeline = buildCodTimeline(order)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/orders" className="text-gray-400 hover:text-gray-600 text-sm">← Commandes</Link>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-gray-700">#{id.slice(0,8).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{adminProfile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: order details ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Status header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  <p className="mt-2 text-xs text-gray-400">
                    Créée le {new Date(order.created_at).toLocaleString('fr-MA')}
                  </p>
                </div>
                {thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={order.product.name} className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0" />
                )}
              </div>
            </div>

            {/* Customer info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Client</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Nom</p><p className="font-medium text-gray-900">{order.customer_name}</p></div>
                <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-medium text-gray-900">{order.customer_phone}</p></div>
                <div><p className="text-xs text-gray-400">Ville</p><p className="font-medium text-gray-900">{order.customer_city}</p></div>
                <div className="col-span-2"><p className="text-xs text-gray-400">Adresse</p><p className="font-medium text-gray-900">{order.customer_address}</p></div>
                {order.notes && <div className="col-span-2"><p className="text-xs text-gray-400">Note</p><p className="text-gray-700">{order.notes}</p></div>}
              </div>
            </div>

            {/* Product + financials */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Produit & finances</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><p className="text-xs text-gray-400">Produit</p><p className="font-medium text-gray-900">{order.product.name}</p></div>
                <div><p className="text-xs text-gray-400">Quantité</p><p className="font-medium">{order.quantity}</p></div>
                <div><p className="text-xs text-gray-400">Total commande</p><p className="font-bold text-gray-900">{formatMAD(order.total_amount)}</p></div>
                <div><p className="text-xs text-gray-400">COD attendu</p><p className="font-medium">{order.cod_expected ? formatMAD(order.cod_expected) : '—'}</p></div>
                <div><p className="text-xs text-gray-400">COD reçu</p>
                  <p className={`font-medium ${order.cod_received != null && order.cod_received < (order.cod_expected ?? 0) ? 'text-red-500' : 'text-gray-900'}`}>
                    {order.cod_received != null ? formatMAD(order.cod_received) : '—'}
                    {order.cod_received != null && order.cod_expected != null && order.cod_received < order.cod_expected && (
                      <span className="ml-1 text-xs text-red-500">⚠ Écart</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* COD logistics */}
            {(order.delivery_company || order.tracking_number) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Livraison</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {order.delivery_company && <div><p className="text-xs text-gray-400">Transporteur</p><p className="font-medium">{order.delivery_company}</p></div>}
                  {order.tracking_number && <div><p className="text-xs text-gray-400">N° suivi</p><p className="font-mono text-sm">{order.tracking_number}</p></div>}
                  {order.return_reason && <div className="col-span-2"><p className="text-xs text-gray-400">Motif retour</p><p className="text-red-600">{order.return_reason}</p></div>}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Suivi de la commande</h2>
              <OrderTimeline steps={timeline} />
              {order.cod_transfer_received_at && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-green-600">
                  ✓ Transfert COD reçu le{' '}
                  {new Date(order.cod_transfer_received_at).toLocaleDateString('fr-MA')}
                </div>
              )}
            </div>

            {/* Affiliate */}
            {order.affiliate && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Affilié(e) source</h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-gray-400">Nom</p><p className="font-medium">{order.affiliate.full_name}</p></div>
                  <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-medium">{order.affiliate.phone ?? '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Commission prévue</p><p className="font-medium text-green-600">{formatMAD(order.commission_amount)}</p></div>
                  <div><p className="text-xs text-gray-400">Statut commission</p>
                    {commission ? (
                      <p className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${
                        commission.status === 'paid' ? 'bg-green-100 text-green-700' :
                        commission.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{commission.status}</p>
                    ) : (
                      <p className="text-xs text-gray-400">À confirmer à la livraison</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: status update ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Mettre à jour le statut</h2>
              <OrderStatusForm orderId={order.id} currentStatus={order.status} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
