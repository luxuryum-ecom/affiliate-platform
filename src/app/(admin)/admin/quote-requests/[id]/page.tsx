import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { QuoteRequestStatusForm } from '@/components/admin/quote-request-status-form'
import { ConvertQuoteButton } from '@/components/admin/convert-quote-button'
import { PrepareQuoteForm } from '@/components/admin/prepare-quote-form'
import type { QuoteRequestWithDetails, QuoteRequestStatus, WholesaleOrder } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

const STATUS_BADGE: Record<QuoteRequestStatus, { label: string; cls: string }> = {
  new:                { label: 'Nouveau',              cls: 'bg-blue-100 text-blue-700' },
  studying:           { label: 'En étude',             cls: 'bg-amber-100 text-amber-700' },
  quoted:             { label: 'Devisé',               cls: 'bg-purple-100 text-purple-700' },
  quote_prepared:     { label: 'Devis préparé',        cls: 'bg-indigo-100 text-indigo-700' },
  negotiating:        { label: 'En négociation',       cls: 'bg-orange-100 text-orange-700' },
  approved:           { label: 'Approuvé',             cls: 'bg-green-100 text-green-700' },
  rejected:           { label: 'Refusé',               cls: 'bg-red-100 text-red-600' },
  converted_to_order: { label: 'Converti en commande', cls: 'bg-gray-100 text-gray-500' },
}

export default async function AdminQuoteRequestDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const adminProfileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = adminProfileRes.data as { full_name: string } | null

  const [quoteRes, linkedOrderRes] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('*, buyer:profiles!buyer_id(id,full_name,phone,company_name), product:products!product_id(id,name,origin_country,availability_type)')
      .eq('id', id)
      .single(),
    supabase
      .from('wholesale_orders')
      .select('id')
      .eq('quote_request_id', id)
      .maybeSingle(),
  ])

  const req = quoteRes.data as unknown as QuoteRequestWithDetails | null
  if (!req) notFound()

  const linkedOrder = linkedOrderRes.data as Pick<WholesaleOrder, 'id'> | null
  const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.new

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/quote-requests" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Devis
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-gray-700">#{id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{adminProfile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: request info ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono text-gray-400">#{id.slice(0, 8).toUpperCase()}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                {linkedOrder && (
                  <Link
                    href={`/admin/wholesale-orders/${linkedOrder.id}`}
                    className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    → Commande #{linkedOrder.id.slice(0, 8).toUpperCase()}
                  </Link>
                )}
                {req.status === 'quote_prepared' && (
                  <Link
                    href={`/admin/quote-requests/${id}/quote-preview`}
                    className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    Aperçu du devis →
                  </Link>
                )}
              </div>
              <h1 className="text-base font-semibold text-gray-900 mb-1">
                {req.buyer?.company_name ?? req.buyer?.full_name}
              </h1>
              <p className="text-xs text-gray-400">
                Soumis le{' '}
                {new Date(req.created_at).toLocaleDateString('fr-MA', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </p>
            </div>

            {/* Product */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Produit</h2>
              <div className="space-y-2 text-sm">
                <Row label="Nom" value={req.product?.name ?? '—'} />
                <Row label="Origine" value={req.product?.origin_country ?? '—'} />
              </div>
            </div>

            {/* Request details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Détails de la demande
              </h2>
              <div className="space-y-2 text-sm">
                <Row label="Quantité" value={`${req.quantity_requested} unité${req.quantity_requested > 1 ? 's' : ''}`} />
                <Row label="Destination" value={[req.destination_country, req.destination_city].filter(Boolean).join(', ')} />
                {req.preferred_shipping_mode && (
                  <Row label="Mode de transport" value={req.preferred_shipping_mode} />
                )}
                {req.colors_or_variants && (
                  <Row label="Couleurs / variantes" value={req.colors_or_variants} />
                )}
                {req.sizes && <Row label="Tailles" value={req.sizes} />}
                {req.whatsapp_number && <Row label="WhatsApp" value={req.whatsapp_number} />}
              </div>
              {req.buyer_notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1">Notes du grossiste</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{req.buyer_notes}</p>
                </div>
              )}
            </div>

            {/* Buyer contact */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h2>
              <div className="space-y-2 text-sm">
                <Row label="Nom" value={req.buyer?.full_name ?? '—'} />
                {req.buyer?.company_name && <Row label="Société" value={req.buyer.company_name} />}
                {req.buyer?.phone && <Row label="Téléphone" value={req.buyer.phone} />}
                <Row label="WhatsApp" value={req.whatsapp_number} />
              </div>
            </div>
          </div>

          {/* ── Right: admin actions ── */}
          <div className="space-y-5">

            {/* Status management */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Gestion du statut
              </h2>
              <QuoteRequestStatusForm
                requestId={id}
                currentStatus={req.status}
                currentNotes={req.admin_notes}
                currentNotesPublic={req.admin_notes_public}
              />
            </div>

            {/* Prepare quote — available until converted */}
            {req.status !== 'converted_to_order' && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Préparer le devis
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Remplis les montants pour générer le document client.
                </p>
                <PrepareQuoteForm
                  requestId={id}
                  quantityRequested={req.quantity_requested}
                  currentQuote={{
                    quoted_unit_price_mad:     req.quoted_unit_price_mad,
                    quoted_quantity:           req.quoted_quantity,
                    quoted_transport_total_mad: req.quoted_transport_total_mad,
                    quoted_shipping_mode:      req.quoted_shipping_mode,
                    quoted_delivery_delay:     req.quoted_delivery_delay,
                    quote_validity_date:       req.quote_validity_date,
                    quote_public_note:         req.quote_public_note,
                  }}
                />
                {req.status === 'quote_prepared' && (
                  <Link
                    href={`/admin/quote-requests/${id}/quote-preview`}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2 border border-indigo-300 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Aperçu du document client
                  </Link>
                )}
              </div>
            )}

            {/* Convert to order — only when approved and not yet converted */}
            {req.status === 'approved' && !linkedOrder && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Commande grossiste
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Crée un brouillon de commande à partir de ce devis approuvé.
                </p>
                <ConvertQuoteButton requestId={id} />
              </div>
            )}

            {/* Converted — show link to order */}
            {req.status === 'converted_to_order' && linkedOrder && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-5">
                <p className="text-xs font-semibold text-green-800 mb-2">Commande créée</p>
                <Link
                  href={`/admin/wholesale-orders/${linkedOrder.id}`}
                  className="text-sm text-green-700 hover:text-green-900 font-medium underline underline-offset-2"
                >
                  Commande #{linkedOrder.id.slice(0, 8).toUpperCase()} →
                </Link>
              </div>
            )}
          </div>
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
