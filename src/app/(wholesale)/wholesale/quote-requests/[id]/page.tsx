import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { QuoteRequest, QuoteRequestStatus, Product, WholesaleOrder } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  return { title: `Demande #${id.slice(0, 8).toUpperCase()} — Espace Grossiste` }
}

const STATUS_BADGE: Record<QuoteRequestStatus, { label: string; cls: string }> = {
  new:                { label: 'Nouveau',              cls: 'bg-blue-100 text-blue-700' },
  studying:           { label: 'En étude',             cls: 'bg-amber-100 text-amber-700' },
  quoted:             { label: 'Devisé',               cls: 'bg-purple-100 text-purple-700' },
  quote_prepared:     { label: 'Devis prêt',           cls: 'bg-indigo-100 text-indigo-700' },
  negotiating:        { label: 'En négociation',       cls: 'bg-orange-100 text-orange-700' },
  approved:           { label: 'Approuvé',             cls: 'bg-green-100 text-green-700' },
  rejected:           { label: 'Refusé',               cls: 'bg-red-100 text-red-600' },
  converted_to_order: { label: 'Converti en commande', cls: 'bg-gray-100 text-gray-500' },
}

const SHIPPING_LABELS: Record<string, string> = {
  air_door_to_door_kg: 'Aérien door-to-door (kg)',
  sea_textile_kg:      'Maritime textile (kg)',
  sea_volume_cbm:      'Maritime volume (CBM)',
}

type ReqRow = QuoteRequest & { product: Pick<Product, 'id' | 'name' | 'origin_country'> }

export default async function WholesaleQuoteRequestDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const profile = profileRes.data as { full_name: string } | null

  const { data } = await supabase
    .from('quote_requests')
    .select('*, product:products!product_id(id,name,origin_country)')
    .eq('id', id)
    .eq('buyer_id', user.id)
    .single()

  const req = data as unknown as ReqRow | null
  if (!req) notFound()

  // Fetch linked wholesale order (only relevant when converted_to_order)
  let linkedOrder: Pick<WholesaleOrder, 'id'> | null = null
  if (req.status === 'converted_to_order') {
    const { data: orderRow } = await supabase
      .from('wholesale_orders')
      .select('id')
      .eq('quote_request_id', id)
      .eq('buyer_id', user.id)
      .maybeSingle()
    linkedOrder = orderRow as Pick<WholesaleOrder, 'id'> | null
  }

  const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.new

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/wholesale/quote-requests" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Mes devis
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-gray-700">#{id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* Status header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-gray-400">#{id.slice(0, 8).toUpperCase()}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
          </div>
          <h1 className="text-base font-semibold text-gray-900">{req.product?.name}</h1>
          <p className="text-xs text-gray-400 mt-1">
            Soumis le{' '}
            {new Date(req.created_at).toLocaleDateString('fr-MA', {
              day: '2-digit', month: 'long', year: 'numeric',
            })}
          </p>
        </div>

        {/* Devis prêt — shown when admin has prepared the formal quote */}
        {req.status === 'quote_prepared' && (
          <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
            <p className="text-xs font-semibold text-indigo-800 mb-2">Votre devis est prêt</p>
            <p className="text-xs text-indigo-700 mb-3">
              Mozouna Group a préparé votre devis. Consultez le document pour connaître les prix, frais et délais estimés.
            </p>
            <Link
              href={`/wholesale/quote-requests/${id}/quote`}
              className="inline-block text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-2 rounded-lg"
            >
              Consulter le devis →
            </Link>
          </div>
        )}

        {/* Commande disponible — shown when quote was converted */}
        {req.status === 'converted_to_order' && linkedOrder && (
          <div className="bg-green-50 rounded-xl border border-green-200 p-5">
            <p className="text-xs font-semibold text-green-800 mb-2">Commande disponible</p>
            <p className="text-xs text-green-700 mb-3">
              Votre devis a été accepté et une commande grossiste a été créée.
            </p>
            <Link
              href={`/wholesale/orders/${linkedOrder.id}`}
              className="inline-block text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors px-4 py-2 rounded-lg"
            >
              Voir ma commande →
            </Link>
          </div>
        )}

        {/* Request details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Votre demande
          </h2>
          <div className="space-y-2 text-sm">
            <Row label="Produit" value={req.product?.name ?? '—'} />
            {req.product?.origin_country && (
              <Row label="Pays d'origine" value={req.product.origin_country} />
            )}
            <Row
              label="Quantité"
              value={`${req.quantity_requested} unité${req.quantity_requested > 1 ? 's' : ''}`}
            />
            <Row
              label="Destination"
              value={[req.destination_country, req.destination_city].filter(Boolean).join(', ')}
            />
            {req.preferred_shipping_mode && (
              <Row
                label="Mode de transport"
                value={SHIPPING_LABELS[req.preferred_shipping_mode] ?? req.preferred_shipping_mode}
              />
            )}
            {req.colors_or_variants && (
              <Row label="Couleurs / variantes" value={req.colors_or_variants} />
            )}
            {req.sizes && <Row label="Tailles" value={req.sizes} />}
            <Row label="WhatsApp" value={req.whatsapp_number} />
          </div>
          {req.buyer_notes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">Vos notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {req.buyer_notes}
              </p>
            </div>
          )}
        </div>

        {/* Admin quote notes (only when public) */}
        {req.admin_notes_public && req.admin_notes && (
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-5">
            <h2 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">
              Réponse / devis de l&apos;équipe
            </h2>
            <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
              {req.admin_notes}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="text-center pt-2">
          <Link
            href="/wholesale/quote-requests"
            className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour à mes demandes
          </Link>
        </div>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}
