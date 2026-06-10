import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildWholesaleTimeline } from '@/components/shared/order-timeline'
import type { WholesaleOrder, WholesaleOrderItem, Product, Profile, WholesaleImportStatus } from '@/types/database'

export const metadata = { title: 'Mes commandes — Espace Grossiste' }

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-amber-100 text-amber-700',   icon: '⏳' },
  confirmed: { label: 'Confirmée',   cls: 'bg-blue-100 text-blue-700',     icon: '✓' },
  sourcing:  { label: 'En sourcing', cls: 'bg-purple-100 text-purple-700', icon: '🔍' },
  shipped:   { label: 'Expédiée',    cls: 'bg-indigo-100 text-indigo-700', icon: '🚚' },
  delivered: { label: 'Livrée',      cls: 'bg-green-100 text-green-700',   icon: '✓✓' },
  cancelled: { label: 'Annulée',     cls: 'bg-gray-100 text-gray-400',     icon: '✗' },
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

type OrderWithItems = WholesaleOrder & {
  items: (WholesaleOrderItem & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> })[]
}

type BillingProfile = Pick<Profile, 'full_name'>

interface PageProps {
  searchParams: Promise<{ submitted?: string }>
}

export default async function WholesaleOrdersPage({ searchParams }: PageProps) {
  const { submitted } = await searchParams
  const showSubmittedBanner = submitted === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, ordersRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('wholesale_orders')
      .select('*, items:wholesale_order_items(*, product:products(id,name,images,media))')
      .eq('buyer_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data as BillingProfile | null
  const orders = (ordersRes.data ?? []) as OrderWithItems[]

  const active   = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const archived = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Mes commandes</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {showSubmittedBanner && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            ✓ Votre commande grossiste a été soumise. Notre équipe la traitera sous peu.
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucune commande pour l&apos;instant.</p>
            <Link
              href="/wholesale/products"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              Parcourir le catalogue →
            </Link>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Commandes en cours ({active.length})
                </h2>
                <div className="space-y-4">
                  {active.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Historique ({archived.length})
                </h2>
                <div className="space-y-3">
                  {archived.map((order) => (
                    <OrderCard key={order.id} order={order} compact={order.status === 'cancelled'} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function OrderCard({
  order,
  compact = false,
}: {
  order: OrderWithItems
  compact?: boolean
}) {
  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const importBadge = order.import_status
    ? IMPORT_STATUS_BADGE[order.import_status as WholesaleImportStatus]
    : null
  const isDelivered = order.status === 'delivered'

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${compact ? 'opacity-75' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/wholesale/orders/${order.id}`}
              className="font-mono text-xs text-gray-400 hover:text-blue-600 hover:underline"
            >
              #{order.id.slice(0, 8).toUpperCase()}
            </Link>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.icon} {badge.label}
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
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(order.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <p className="text-lg font-bold text-gray-900">{formatMAD(order.total_amount)}</p>
      </div>

      {/* Visual timeline for active orders */}
      {!compact && !['delivered', 'cancelled'].includes(order.status) && (
        <div className="mb-4">
          <OrderTimeline steps={buildWholesaleTimeline(order)} />
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {order.items.slice(0, compact ? 2 : 10).map((item) => {
          const coverUrl = getProductCoverUrl(item.product)
          return (
            <div key={item.id} className="flex items-center gap-2">
              <ProductThumbnail
                src={coverUrl}
                name={item.product.name}
                className="w-8 h-8 rounded-md border shrink-0 text-[8px]"
              />
              <p className="text-xs text-gray-700 flex-1 truncate">
                {item.product.name} <span className="text-gray-400">×{item.quantity}</span>
              </p>
              <p className="text-xs font-medium text-gray-900 shrink-0">{formatMAD(item.subtotal)}</p>
            </div>
          )
        })}
        {compact && order.items.length > 2 && (
          <p className="text-xs text-gray-400 pl-10">+{order.items.length - 2} article(s) de plus</p>
        )}
      </div>

      {/* Timestamps */}
      {!compact && (
        <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
          {order.confirmed_at && (
            <p className="text-xs text-gray-400">
              Confirmée le {new Date(order.confirmed_at).toLocaleDateString('fr-MA')}
            </p>
          )}
          {order.shipped_at && (
            <p className="text-xs text-gray-400">
              Expédiée le {new Date(order.shipped_at).toLocaleDateString('fr-MA')}
            </p>
          )}
          {order.delivered_at && (
            <p className="text-xs text-green-600 font-medium">
              ✓ Livrée le {new Date(order.delivered_at).toLocaleDateString('fr-MA')}
            </p>
          )}
          {order.cancelled_at && (
            <p className="text-xs text-red-500">
              Annulée le {new Date(order.cancelled_at).toLocaleDateString('fr-MA')}
            </p>
          )}
        </div>
      )}

      {/* CTA: view detail / request invoice */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <Link
          href={`/wholesale/orders/${order.id}`}
          className="text-xs text-blue-600 hover:underline"
        >
          Voir le détail →
        </Link>
        {isDelivered && !order.invoice_requested && (
          <Link
            href={`/wholesale/orders/${order.id}`}
            className="text-xs font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Demander une facture
          </Link>
        )}
      </div>
    </div>
  )
}
