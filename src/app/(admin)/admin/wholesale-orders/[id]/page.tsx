import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { WholesaleOrderStatusForm } from '@/components/admin/wholesale-order-status-form'
import { WholesaleImportStatusForm, IMPORT_STATUS_BADGE } from '@/components/admin/wholesale-import-status-form'
import { WholesalePaymentForm, PAYMENT_STATUS_BADGE } from '@/components/admin/wholesale-payment-form'
import { OrderTimeline, buildWholesaleTimeline, buildImportHistoryTimeline, buildPaymentHistoryTimeline } from '@/components/shared/order-timeline'
import { WholesaleCostForm } from '@/components/admin/wholesale-cost-form'
import type { WholesaleOrder, WholesaleOrderItem, Profile, Product, WholesaleOrderStatus, WholesaleImportStatus, WholesaleOrderImportHistory, WholesaleOrderPaymentHistory, WholesalePaymentStatus, QuoteRequest } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  sourcing:  { label: 'En sourcing', cls: 'bg-purple-100 text-purple-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

type OrderItemWithProduct = WholesaleOrderItem & { product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'stock_count'> }
type OrderDetail = WholesaleOrder & {
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
  agent: Pick<Profile, 'id' | 'full_name'> | null
  items: OrderItemWithProduct[]
}
type LinkedQuote = Pick<QuoteRequest, 'id'>

export default async function AdminWholesaleOrderDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const adminProfileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = adminProfileRes.data as { full_name: string } | null

  const [orderRes, itemsRes, importHistoryRes, paymentHistoryRes] = await Promise.all([
    supabase
      .from('wholesale_orders')
      .select('*, buyer:profiles!buyer_id(id,full_name,phone,city), agent:profiles!agent_id(id,full_name)')
      .eq('id', id)
      .single(),
    supabase
      .from('wholesale_order_items')
      .select('*, product:products(id,name,images,stock_count)')
      .eq('order_id', id),
    supabase
      .from('wholesale_order_import_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('wholesale_order_payment_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false }),
  ])

  const order = orderRes.data as unknown as OrderDetail | null
  const items = (itemsRes.data ?? []) as unknown as OrderItemWithProduct[]
  const importHistory = (importHistoryRes.data ?? []) as unknown as WholesaleOrderImportHistory[]
  const paymentHistory = (paymentHistoryRes.data ?? []) as unknown as WholesaleOrderPaymentHistory[]

  // Fetch linked quote if this order was created from a quote
  let linkedQuote: LinkedQuote | null = null
  if (order?.quote_request_id) {
    const { data } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', order.quote_request_id)
      .maybeSingle()
    linkedQuote = data as LinkedQuote | null
  }

  if (!order) notFound()

  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const importBadge = order.import_status
    ? IMPORT_STATUS_BADGE[order.import_status as WholesaleImportStatus]
    : null
  const paymentBadge = PAYMENT_STATUS_BADGE[order.payment_status as WholesalePaymentStatus] ?? PAYMENT_STATUS_BADGE.no_deposit

  const timeline = buildWholesaleTimeline(order)
  const importTimeline = buildImportHistoryTimeline(importHistory)
  const paymentTimeline = buildPaymentHistoryTimeline(paymentHistory)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/wholesale-orders" className="text-gray-400 hover:text-gray-600 text-sm">← Grossiste</Link>
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
          {/* ── Left ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Status + buyer */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    {importBadge && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importBadge.cls}`}>
                        {importBadge.label}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${paymentBadge.cls}`}>
                      {paymentBadge.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Créée le {new Date(order.created_at).toLocaleString('fr-MA')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatMAD(order.total_amount)}</p>
                  <p className="text-xs text-gray-400">{items.length} article{items.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Buyer info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Acheteur</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Nom</p><p className="font-medium">{order.buyer.full_name}</p></div>
                <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-medium">{order.buyer.phone ?? '—'}</p></div>
                <div><p className="text-xs text-gray-400">Ville</p><p className="font-medium">{order.city ?? order.buyer.city ?? '—'}</p></div>
                <div><p className="text-xs text-gray-400">Adresse</p><p className="font-medium">{order.address ?? '—'}</p></div>
                {order.buyer_notes && <div className="col-span-2"><p className="text-xs text-gray-400">Note acheteur</p><p className="text-gray-700">{order.buyer_notes}</p></div>}
                {order.agent_notes && <div className="col-span-2"><p className="text-xs text-gray-400">Note agent</p><p className="text-gray-700">{order.agent_notes}</p></div>}
              </div>
            </div>

            {/* Order items */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Articles commandés</h2>
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const coverUrl = getProductCoverUrl(item.product)
                  const lowStock = item.product.stock_count < 5
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <ProductThumbnail
                        src={coverUrl}
                        name={item.product.name}
                        className="w-10 h-10 rounded-lg border shrink-0 text-[10px]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.tier_label_snapshot} · {item.quantity} × {formatMAD(item.unit_price_snapshot)}
                        </p>
                        {lowStock && <p className="text-xs text-amber-500">⚠ Stock bas ({item.product.stock_count})</p>}
                      </div>
                      <p className="text-sm font-bold text-gray-900 shrink-0">{formatMAD(item.subtotal)}</p>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-gray-100 mt-3 flex justify-between">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-sm font-bold text-gray-900">{formatMAD(order.total_amount)}</span>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Suivi de la commande</h2>
              <OrderTimeline steps={timeline} />
            </div>

            {/* Import progress history */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Historique import</h2>
              {importTimeline.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Aucun statut import enregistré. Utilisez le panneau de droite pour commencer le suivi.
                </p>
              ) : (
                <OrderTimeline steps={importTimeline} />
              )}
            </div>

            {/* Payment history */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Historique paiement</h2>
              {paymentTimeline.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Aucun événement de paiement enregistré.
                </p>
              ) : (
                <OrderTimeline steps={paymentTimeline} />
              )}
            </div>
          </div>

          {/* ── Right: status update + cost breakdown ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Mettre à jour</h2>
              <WholesaleOrderStatusForm
                orderId={order.id}
                currentStatus={order.status as WholesaleOrderStatus}
              />
            </div>

            {/* Import status form */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Statut import</h2>
              <WholesaleImportStatusForm
                orderId={order.id}
                currentImportStatus={order.import_status as WholesaleImportStatus | null}
              />
            </div>

            {/* Cost breakdown form */}
            <WholesaleCostForm
              orderId={order.id}
              supplierCost={order.supplier_cost_mad ?? 0}
              transportCost={order.transport_customs_cost_mad ?? 0}
              additionalCost={order.additional_cost_mad ?? 0}
              totalAmount={order.total_amount}
            />

            {/* Payment management */}
            <WholesalePaymentForm
              orderId={order.id}
              totalAmount={order.total_amount}
              currentStatus={(order.payment_status as WholesalePaymentStatus) ?? 'no_deposit'}
              depositAmount={order.deposit_amount ?? null}
              depositReceived={order.deposit_received_amount ?? 0}
            />

            {/* Linked quote */}
            {linkedQuote && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">Créée depuis un devis</p>
                <Link
                  href={`/admin/quote-requests/${linkedQuote.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                >
                  Devis #{linkedQuote.id.slice(0, 8).toUpperCase()} →
                </Link>
              </div>
            )}

            {order.agent && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400">Agent assigné</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{order.agent.full_name}</p>
              </div>
            )}

            {/* Invoice request */}
            {order.invoice_requested && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-indigo-800">Demande de facture</p>
                  {order.invoice_requested_at && (
                    <p className="text-xs text-indigo-500">
                      {new Date(order.invoice_requested_at).toLocaleDateString('fr-MA')}
                    </p>
                  )}
                </div>
                <dl className="space-y-1.5 text-sm">
                  {order.invoice_company_name && (
                    <div><dt className="text-xs text-indigo-500">Raison sociale</dt><dd className="font-medium text-indigo-900">{order.invoice_company_name}</dd></div>
                  )}
                  {order.invoice_ice && (
                    <div><dt className="text-xs text-indigo-500">ICE</dt><dd className="font-medium text-indigo-900">{order.invoice_ice}</dd></div>
                  )}
                  {order.invoice_registre_commerce && (
                    <div><dt className="text-xs text-indigo-500">RC</dt><dd className="font-medium text-indigo-900">{order.invoice_registre_commerce}</dd></div>
                  )}
                  {order.invoice_billing_address && (
                    <div><dt className="text-xs text-indigo-500">Adresse de facturation</dt><dd className="font-medium text-indigo-900">{order.invoice_billing_address}</dd></div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
