import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QuoteDocument } from '@/components/shared/quote-document'
import { PrintButton } from '@/components/shared/print-button'
import type { QuoteRequestWithDetails } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  return { title: `Aperçu devis #${id.slice(0, 8).toUpperCase()} — Admin` }
}

export default async function AdminQuotePreviewPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('quote_requests')
    .select('*, buyer:profiles!buyer_id(id,full_name,phone,company_name), product:products!product_id(id,name,origin_country,availability_type)')
    .eq('id', id)
    .single()

  const req = data as unknown as QuoteRequestWithDetails | null
  if (!req || req.status !== 'quote_prepared') notFound()

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* ── Admin toolbar (hidden on print) ── */}
      <div className="print:hidden bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/quote-requests/${id}`}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ← Retour
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-600 font-medium">Aperçu du devis client</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              Vue admin — coûts internes non affichés
            </span>
            <PrintButton />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 print:px-0 print:py-0">
        <div className="print:hidden mb-6 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-800">
          Ceci est l&apos;aperçu exact que le client recevra. Aucun coût fournisseur ni marge interne n&apos;est visible.
        </div>

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

        <div className="print:hidden mt-8 text-center">
          <Link
            href={`/admin/quote-requests/${id}`}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour à la demande
          </Link>
        </div>
      </div>
    </div>
  )
}
