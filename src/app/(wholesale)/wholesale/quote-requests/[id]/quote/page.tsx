import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QuoteDocument } from '@/components/shared/quote-document'
import { PrintButton } from '@/components/shared/print-button'
import { QuoteDecisionButtons } from '@/components/wholesale/quote-decision-buttons'
import type { QuoteRequest, Product, Profile } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  return { title: `Devis #${id.slice(0, 8).toUpperCase()} — Espace Grossiste` }
}

type QuoteRow = QuoteRequest & {
  buyer: Pick<Profile, 'id' | 'full_name' | 'company_name'>
  product: Pick<Product, 'id' | 'name' | 'origin_country'>
}

const VISIBLE_STATUSES = new Set([
  'quote_prepared',
  'accepted_by_client',
  'rejected_by_client',
])

export default async function WholesaleQuotePage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('quote_requests')
    .select('*, buyer:profiles!buyer_id(id,full_name,company_name), product:products!product_id(id,name,origin_country)')
    .eq('id', id)
    .eq('buyer_id', user.id)
    .single()

  const req = data as unknown as QuoteRow | null

  if (!req || !VISIBLE_STATUSES.has(req.status)) notFound()

  const isAccepted = req.status === 'accepted_by_client'
  const isRejected = req.status === 'rejected_by_client'
  const isPending  = req.status === 'quote_prepared'

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* ── Toolbar (hidden on print) ── */}
      <div className="print:hidden bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/wholesale/quote-requests/${id}`}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ← Ma demande
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-700 font-medium">Mon devis</span>
          </div>
          <PrintButton />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 print:px-0 print:py-0">

        {/* ── Acceptance banner ── */}
        {isAccepted && (
          <div className="print:hidden mb-6 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <span className="text-green-500 text-lg leading-none mt-0.5">✓</span>
            <div>
              <p className="text-sm font-semibold text-green-800">
                Devis accepté — en attente de confirmation de commande
              </p>
              {req.client_decision_at && (
                <p className="text-xs text-green-600 mt-0.5">
                  Accepté le{' '}
                  {new Date(req.client_decision_at).toLocaleDateString('fr-MA', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Rejection notice ── */}
        {isRejected && (
          <div className="print:hidden mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <span className="text-red-400 text-lg leading-none mt-0.5">✕</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Devis refusé</p>
              {req.client_decision_at && (
                <p className="text-xs text-red-600 mt-0.5">
                  Refusé le{' '}
                  {new Date(req.client_decision_at).toLocaleDateString('fr-MA', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        <QuoteDocument
          data={{
            id:                         req.id,
            quoted_unit_price_mad:      req.quoted_unit_price_mad,
            quoted_quantity:            req.quoted_quantity,
            quoted_transport_total_mad: req.quoted_transport_total_mad,
            quoted_shipping_mode:       req.quoted_shipping_mode,
            quoted_delivery_delay:      req.quoted_delivery_delay,
            quote_validity_date:        req.quote_validity_date,
            quote_public_note:          req.quote_public_note,
            quote_prepared_at:          req.quote_prepared_at,
            destination_country:        req.destination_country,
            destination_city:           req.destination_city,
            buyer:                      req.buyer,
            product:                    req.product,
          }}
        />

        {/* ── Accept / Reject buttons — only when pending decision ── */}
        {isPending && (
          <div className="print:hidden mt-8 bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              Votre décision
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Acceptez ou refusez ce devis. Votre réponse sera transmise à notre équipe.
            </p>
            <QuoteDecisionButtons requestId={id} />
          </div>
        )}

        <div className="print:hidden mt-8 text-center">
          <Link
            href="/wholesale/quote-requests"
            className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour à mes demandes
          </Link>
        </div>
      </div>
    </div>
  )
}
