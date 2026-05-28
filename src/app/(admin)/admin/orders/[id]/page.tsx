import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderStatusForm } from '@/components/admin/order-status-form'
import { CommissionStatusForm } from '@/components/admin/commission-status-form'
import { OrderProofForm } from '@/components/admin/order-proof-form'
import { OrderTimeline, buildCodTimeline } from '@/components/shared/order-timeline'
import type { Order, Product, Profile, Commission, OrderProof } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'À confirmer', cls: 'bg-amber-100 text-amber-700' },
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

  const [orderRes, commissionRes, proofsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, product:products(id,name,images,media,sell_price,commission_amount), affiliate:profiles!affiliate_id(id,full_name,phone,city)')
      .eq('id', id)
      .single(),
    supabase.from('commissions').select('*').eq('order_id', id).maybeSingle(),
    supabase.from('order_proofs').select('*').eq('related_order_id', id).order('uploaded_at', { ascending: false }),
  ])

  const order = orderRes.data as unknown as OrderDetail | null
  const commission = commissionRes.data as Commission | null
  const proofs = (proofsRes.data ?? []) as OrderProof[]

  if (!order) notFound()

  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending_confirmation
  const coverUrl = getProductCoverUrl(order.product)
  const timeline = buildCodTimeline(order)

  const unitPrice = order.product_price_snapshot ?? order.product.sell_price
  const commissionSnap =
    order.affiliate_commission_mad_snapshot ?? order.commission_amount

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

          <div className="lg:col-span-2 space-y-5">

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  <p className="mt-2 text-xs text-gray-400">
                    Créée le {new Date(order.created_at).toLocaleString('fr-MA')}
                  </p>
                </div>
                <ProductThumbnail
                  src={coverUrl}
                  name={order.product.name}
                  className="w-12 h-12 rounded-lg border border-gray-100 shrink-0"
                />
              </div>
            </div>

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

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Produit & snapshots (figés)</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><p className="text-xs text-gray-400">Produit</p><p className="font-medium text-gray-900">{order.product.name}</p></div>
                <div><p className="text-xs text-gray-400">Quantité</p><p className="font-medium">{order.quantity}</p></div>
                <div><p className="text-xs text-gray-400">Prix unitaire (snapshot)</p><p className="font-medium">{formatMAD(unitPrice)}</p></div>
                <div><p className="text-xs text-gray-400">Total commande</p><p className="font-bold text-gray-900">{formatMAD(order.total_amount)}</p></div>
                <div><p className="text-xs text-gray-400">Commission affilié (snapshot)</p><p className="font-medium text-green-600">{formatMAD(commissionSnap)}</p></div>
                <div><p className="text-xs text-gray-400">Frais confirmation</p><p className="font-medium">{formatMAD(order.confirmation_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-gray-400">Frais emballage</p><p className="font-medium">{formatMAD(order.packaging_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-gray-400">Frais livraison (est.)</p><p className="font-medium">{formatMAD(order.delivery_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-gray-400">Prix catalogue actuel</p><p className="text-gray-500 line-through">{formatMAD(order.product.sell_price)}</p></div>
              </div>
            </div>

            {(order.fraud_score != null || order.duplicate_risk_score != null) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">Scores risque (AI-ready)</h2>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-xs text-gray-400">Fraude</p><p className="font-medium">{order.fraud_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-gray-400">Doublon</p><p className="font-medium">{order.duplicate_risk_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-gray-400">Spam</p><p className="font-medium">{order.spam_score ?? '—'}/100</p></div>
                </div>
              </div>
            )}

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

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Suivi de la commande</h2>
              <OrderTimeline steps={timeline} />
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-gray-400">COD attendu</p><p className="font-medium">{order.cod_expected ? formatMAD(order.cod_expected) : '—'}</p></div>
                <div><p className="text-gray-400">COD reçu</p>
                  <p className={`font-medium ${order.cod_received != null && order.cod_expected != null && order.cod_received < order.cod_expected ? 'text-red-500' : ''}`}>
                    {order.cod_received != null ? formatMAD(order.cod_received) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {order.affiliate && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Affilié(e) source</h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-gray-400">Nom</p><p className="font-medium">{order.affiliate.full_name}</p></div>
                  <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-medium">{order.affiliate.phone ?? '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Commission snapshot</p><p className="font-medium text-green-600">{formatMAD(commissionSnap)}</p></div>
                  <div><p className="text-xs text-gray-400">Clic attribué</p><p className="font-mono text-xs">{order.attribution_click_id?.slice(0, 8) ?? '—'}</p></div>
                </div>
                {commission && (
                  <div className="pt-3 border-t border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 mb-2">Validation commission</h3>
                    <CommissionStatusForm commission={commission} />
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Preuves & justificatifs</h2>
              <OrderProofForm orderId={order.id} existingProofs={proofs} />
            </div>
          </div>

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
