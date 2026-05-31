import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { OrderStatus } from '@/types/database'

export const metadata: Metadata = {
  title: 'Suivi de commande — Mozouna Group',
  description: 'Suivez le statut de votre commande COD en entrant votre numéro de téléphone.',
}

interface TrackRow {
  id: string
  status: OrderStatus
  customer_name: string
  customer_city: string
  quantity: number
  total_amount: number
  product_name: string
  tracking_number: string | null
  delivery_company: string | null
  created_at: string
  confirmed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  returned_at: string | null
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  pending_confirmation: { label: 'En attente de confirmation', color: 'text-amber-600 bg-amber-50 border-amber-200',  icon: '⏳' },
  confirmed:           { label: 'Confirmée',                   color: 'text-blue-600   bg-blue-50   border-blue-200',  icon: '✓'  },
  shipped:             { label: 'Expédiée',                    color: 'text-purple-600 bg-purple-50 border-purple-200', icon: '🚚' },
  delivered:           { label: 'Livrée',                      color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: '✅' },
  returned:            { label: 'Retournée',                   color: 'text-orange-600 bg-orange-50 border-orange-200', icon: '↩️' },
  cancelled:           { label: 'Annulée',                     color: 'text-red-600    bg-red-50    border-red-200',   icon: '✕'  },
}

const PIPELINE: OrderStatus[] = ['pending_confirmation', 'confirmed', 'shipped', 'delivered']

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function OrderTimeline({ order }: { order: TrackRow }) {
  const steps: { status: OrderStatus; date: string | null; label: string }[] = [
    { status: 'pending_confirmation', date: order.created_at,   label: 'Commande passée'     },
    { status: 'confirmed',            date: order.confirmed_at,  label: 'Confirmée'            },
    { status: 'shipped',              date: order.shipped_at,    label: 'En livraison'         },
    { status: 'delivered',            date: order.delivered_at,  label: 'Livrée'               },
  ]

  const currentIdx = PIPELINE.indexOf(order.status)
  const isCancelledOrReturned = order.status === 'cancelled' || order.status === 'returned'

  return (
    <ol className="relative ml-3">
      {steps.map((step, idx) => {
        const reached = isCancelledOrReturned ? false : idx <= currentIdx
        const isActive = !isCancelledOrReturned && idx === currentIdx
        return (
          <li key={step.status} className={`flex gap-4 pb-6 last:pb-0 ${idx < steps.length - 1 ? 'border-l-2 ml-3 pl-6 ' + (reached ? 'border-emerald-400' : 'border-gray-200') : 'ml-3 pl-6'}`}>
            <span className={`-ml-[calc(1.25rem+1px)] flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold
              ${reached && !isActive ? 'bg-emerald-500 border-emerald-500 text-white' : ''}
              ${isActive ? 'bg-white border-emerald-500 ring-2 ring-emerald-200 text-emerald-600' : ''}
              ${!reached ? 'bg-white border-gray-300 text-gray-300' : ''}
            `}>
              {reached && !isActive ? '✓' : idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${reached ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
              {step.date && reached && (
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(step.date)}</p>
              )}
            </div>
          </li>
        )
      })}
      {isCancelledOrReturned && (
        <li className="flex gap-4 ml-3 pl-6">
          <span className={`-ml-[calc(1.25rem+1px)] flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold
            ${order.status === 'cancelled' ? 'bg-red-500 border-red-500 text-white' : 'bg-orange-500 border-orange-500 text-white'}
          `}>✕</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {order.status === 'cancelled' ? 'Annulée' : 'Retournée'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(order.cancelled_at ?? order.returned_at)}
            </p>
          </div>
        </li>
      )}
    </ol>
  )
}

function OrderCard({ order }: { order: TrackRow }) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending_confirmation
  const shortId = order.id.slice(0, 8).toUpperCase()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 font-mono"># {shortId}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 line-clamp-1">{order.product_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {order.quantity} unité{order.quantity > 1 ? 's' : ''} · {order.customer_city} · {formatMAD(order.total_amount)}
          </p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.color}`}>
          <span>{cfg.icon}</span>
          <span className="hidden sm:inline">{cfg.label}</span>
        </span>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        <OrderTimeline order={order} />
      </div>

      {/* Tracking info */}
      {(order.tracking_number || order.delivery_company) && (
        <div className="px-5 py-3 bg-blue-50 border-t border-blue-100 flex items-center gap-2 text-xs text-blue-700">
          <span>🚚</span>
          <span>
            {order.delivery_company && <span className="font-medium">{order.delivery_company}</span>}
            {order.delivery_company && order.tracking_number && ' — '}
            {order.tracking_number && <span className="font-mono">{order.tracking_number}</span>}
          </span>
        </div>
      )}
    </div>
  )
}

interface PageProps {
  searchParams: Promise<{ phone?: string }>
}

export default async function OrderTrackPage({ searchParams }: PageProps) {
  const { phone } = await searchParams
  const cleanPhone = phone?.trim() ?? ''

  let orders: TrackRow[] = []
  let lookupError: string | null = null

  if (cleanPhone) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .rpc('get_orders_by_phone', { p_phone: cleanPhone }) as {
        data: TrackRow[] | null
        error: { message: string } | null
      }

    if (error) {
      lookupError = 'Une erreur est survenue. Veuillez réessayer.'
    } else {
      orders = data ?? []
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <MozounaLogo size="sm" />
          </Link>
          <span className="text-xs text-gray-500">Suivi de commande</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-bold text-gray-900">Suivre ma commande</h1>
          <p className="text-sm text-gray-500">
            Entrez le numéro de téléphone utilisé lors de votre commande.
          </p>
        </div>

        {/* Search form */}
        <form method="GET" action="/orders/track" className="bg-white rounded-xl border border-gray-200 p-4">
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Numéro de téléphone
          </label>
          <div className="flex gap-2">
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={cleanPhone}
              placeholder="06 00 00 00 00"
              required
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Rechercher
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Vos commandes passées avec ce numéro apparaîtront ci-dessous.
          </p>
        </form>

        {/* Error */}
        {lookupError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {lookupError}
          </div>
        )}

        {/* Results */}
        {cleanPhone && !lookupError && (
          <>
            {orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center space-y-2">
                <p className="text-2xl">📦</p>
                <p className="text-sm font-medium text-gray-700">Aucune commande trouvée</p>
                <p className="text-xs text-gray-400">
                  Vérifiez que le numéro de téléphone correspond exactement à celui utilisé lors de la commande.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  {orders.length} commande{orders.length > 1 ? 's' : ''} trouvée{orders.length > 1 ? 's' : ''}
                </p>
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          Un problème avec votre commande ?{' '}
          <a
            href="https://wa.me/212600000000"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 underline underline-offset-2"
          >
            Contactez-nous sur WhatsApp
          </a>
        </p>
      </main>
    </div>
  )
}
