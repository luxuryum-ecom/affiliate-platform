import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildWholesaleTimeline, buildImportHistoryTimeline } from '@/components/shared/order-timeline'
import { InvoiceRequestForm } from '@/components/wholesale/invoice-request-form'
import type {
  WholesaleOrder,
  WholesaleOrderItem,
  WholesaleOrderImportHistory,
  WholesaleImportStatus,
  Product,
  Profile,
} from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}

type OrderItemWithProduct = WholesaleOrderItem & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media'>
}

type BillingProfile = Pick<
  Profile,
  'full_name' | 'company_name' | 'ice' | 'registre_commerce' | 'billing_address'
>

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700' },
  sourcing:  { label: 'En sourcing', cls: 'bg-purple-100 text-purple-700' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400' },
}

const IMPORT_STATUS_BADGE: Record<WholesaleImportStatus, { label: string; cls: string }> = {
  awaiting_supplier: { label: 'Attente fournisseur', cls: 'bg-gray-100 text-gray-600' },
  purchased:         { label: 'Acheté',              cls: 'bg-amber-100 text-amber-700' },
  in_production:     { label: 'En production',       cls: 'bg-orange-100 text-orange-700' },
  ready_to_ship:     { label: 'Prêt à expédier',     cls: 'bg-yellow-100 text-yellow-700' },
  shipped:           { label: 'Expédié',             cls: 'bg-blue-100 text-blue-700' },
  customs_clearance: { label: 'Dédouanement',        cls: 'bg-purple-100 text-purple-700' },
  delivered:         { label: 'Livré (import)',      cls: 'bg-green-100 text-green-700' },
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  return { title: `Commande #${id.slice(0, 8).toUpperCase()} — Espace Grossiste` }
}

export default async function WholesaleOrderDetailPage({ params, searchParams }: Params) {
  const { id } = await params
  const { submitted } = await searchParams
  const showSubmittedBanner = submitted === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, orderRes, itemsRes, importHistoryRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, company_name, ice, registre_commerce, billing_address')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('wholesale_orders')
      .select('*')
      .eq('id', id)
      .eq('buyer_id', user!.id)
      .single(),
    supabase
      .from('wholesale_order_items')
      .select('*, product:products(id,name,images,media)')
      .eq('order_id', id),
    supabase
      .from('wholesale_order_import_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false }),
  ])

  const profile = profileRes.data as BillingProfile | null
  const order = orderRes.data as WholesaleOrder | null
  const items = (itemsRes.data ?? []) as unknown as OrderItemWithProduct[]
  const importHistory = (importHistoryRes.data ?? []) as unknown as WholesaleOrderImportHistory[]

  if (!order) notFound()

  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const importBadge = order.import_status
    ? IMPORT_STATUS_BADGE[order.import_status as WholesaleImportStatus]
    : null
  const timeline = buildWholesaleTimeline(order)
  const importTimeline = buildImportHistoryTimeline(importHistory)
  const isDelivered = order.status === 'delivered'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/wholesale/orders" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Mes commandes
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-gray-700">
              #{id.slice(0, 8).toUpperCase()}
            </span>
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {showSubmittedBanner && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            ✓ Votre commande grossiste a été soumise. Notre équipe la traitera sous peu.
          </div>
        )}

        {/* Status header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.label}
                </span>
                {importBadge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importBadge.cls}`}>
                    {importBadge.label}
                  </span>
                )}
                {isDelivered && order.invoice_requested && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    Facture demandée
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Commande du{' '}
                {new Date(order.created_at).toLocaleDateString('fr-MA', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">{formatMAD(order.total_amount)}</p>
              <p className="text-xs text-gray-400">{items.length} article{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: items + delivery ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Order items */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Articles commandés</h2>
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const coverUrl = getProductCoverUrl(item.product)
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <ProductThumbnail
                        src={coverUrl}
                        name={item.product.name}
                        className="w-10 h-10 rounded-lg border shrink-0 text-[10px]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.tier_label_snapshot} · {item.quantity} × {formatMAD(item.unit_price_snapshot)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 shrink-0">
                        {formatMAD(item.subtotal)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-gray-100 mt-3 flex justify-between">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-sm font-bold text-gray-900">{formatMAD(order.total_amount)}</span>
              </div>
            </div>

            {/* Delivery info */}
            {(order.city || order.address || order.buyer_notes) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Informations de livraison</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {order.city && (
                    <div>
                      <dt className="text-xs text-gray-400">Ville</dt>
                      <dd className="text-gray-800 font-medium">{order.city}</dd>
                    </div>
                  )}
                  {order.address && (
                    <div className={order.city ? '' : 'col-span-2'}>
                      <dt className="text-xs text-gray-400">Adresse</dt>
                      <dd className="text-gray-800 font-medium">{order.address}</dd>
                    </div>
                  )}
                  {order.buyer_notes && (
                    <div className="col-span-2">
                      <dt className="text-xs text-gray-400">Note</dt>
                      <dd className="text-gray-800">{order.buyer_notes}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Invoice request section */}
            {isDelivered && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Facture</h2>
                {order.invoice_requested ? (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm text-green-700 font-medium">
                      ✓ Demande de facture envoyée
                    </p>
                    {order.invoice_requested_at && (
                      <p className="text-xs text-gray-400">
                        Le{' '}
                        {new Date(order.invoice_requested_at).toLocaleDateString('fr-MA', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                    {(order.invoice_company_name || order.invoice_ice || order.invoice_registre_commerce || order.invoice_billing_address) && (
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-gray-100 pt-3">
                        {order.invoice_company_name && (
                          <div><dt className="text-xs text-gray-400">Raison sociale</dt><dd className="font-medium">{order.invoice_company_name}</dd></div>
                        )}
                        {order.invoice_ice && (
                          <div><dt className="text-xs text-gray-400">ICE</dt><dd className="font-medium">{order.invoice_ice}</dd></div>
                        )}
                        {order.invoice_registre_commerce && (
                          <div><dt className="text-xs text-gray-400">RC</dt><dd className="font-medium">{order.invoice_registre_commerce}</dd></div>
                        )}
                        {order.invoice_billing_address && (
                          <div className="col-span-2"><dt className="text-xs text-gray-400">Adresse de facturation</dt><dd className="font-medium">{order.invoice_billing_address}</dd></div>
                        )}
                      </dl>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">
                      Disponible après livraison et règlement.
                    </p>
                    {profile && <InvoiceRequestForm orderId={order.id} profile={profile} />}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: timeline ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Suivi de commande</h2>
              <OrderTimeline steps={timeline} />
            </div>

            {/* Import progress history */}
            {importTimeline.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Suivi import</h2>
                <OrderTimeline steps={importTimeline} />
              </div>
            )}

            {/* Link back to source quote */}
            {order.quote_request_id && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">Créée depuis un devis</p>
                <Link
                  href={`/wholesale/quote-requests/${order.quote_request_id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                >
                  Devis #{order.quote_request_id.slice(0, 8).toUpperCase()} →
                </Link>
              </div>
            )}

            {/* Payment reminder */}
            {!['delivered', 'cancelled'].includes(order.status) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">Paiement</p>
                <p className="text-xs text-amber-700">
                  Le règlement s&apos;effectue en dehors de la plateforme. Notre équipe vous contactera
                  pour confirmer les modalités.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
