import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QuoteDocument } from '@/components/shared/quote-document'
import { PrintButton } from '@/components/shared/print-button'
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

  // Only show if quote has been formally prepared by admin
  if (!req || req.status !== 'quote_prepared') notFound()

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
