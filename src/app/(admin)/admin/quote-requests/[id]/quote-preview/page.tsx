import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTranslations, getLocale } from 'next-intl/server'
import { QuoteDocument } from '@/components/shared/quote-document'
import { PrintButton } from '@/components/shared/print-button'
import type { QuoteRequestWithDetails } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('admin.quotePreview')
  return { title: t('metaTitle', { id: id.slice(0, 8).toUpperCase() }) }
}

export default async function AdminQuotePreviewPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const t = await getTranslations('admin.quotePreview')
  const locale = await getLocale()
  const isRtl = locale === 'ar'

  const { data } = await supabase
    .from('quote_requests')
    .select('*, buyer:profiles!buyer_id(id,full_name,phone,company_name), product:products!product_id(id,name,origin_country,availability_type)')
    .eq('id', id)
    .single()

  const req = data as unknown as QuoteRequestWithDetails | null
  if (!req || req.status !== 'quote_prepared') notFound()

  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  return (
    <div className="min-h-screen bg-bg print:bg-white">

      {/* ── Admin toolbar (hidden on print) ── */}
      <div className="print:hidden bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/quote-requests/${id}`}
              className="text-faint hover:text-muted text-sm transition-colors"
            >
              {isRtl ? t('backToRequestAr') : t('backToRequest').replace('← ', isRtl ? '' : '← ')}
            </Link>
            <span className="text-line">/</span>
            <span className="text-sm text-foreground font-medium">{t('breadcrumb')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-warning-dark bg-warning-subtle px-2 py-1 rounded-full border border-warning-line">
              {t('adminWarningBadge')}
            </span>
            <PrintButton label={t('printLabel')} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 print:px-0 print:py-0">
        <div className="print:hidden mb-6 bg-surface-2 border border-line rounded-xl px-4 py-3 text-sm text-foreground">
          {t('infoBanner')}
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
            display_currency:           req.display_currency,
            fx_rate_display_vs_mad:     req.fx_rate_display_vs_mad,
            buyer:                      req.buyer,
            product:                    req.product,
          }}
          labels={{
            docIssueDate:    t('docIssueDate'),
            docValidUntil:   t('docValidUntil'),
            docAddressedTo:  t('docAddressedTo'),
            docProduct:      t('docProduct'),
            docOriginPrefix: t('docOriginPrefix'),
            docDescCol:      t('docDescCol'),
            docQtyCol:       t('docQtyCol'),
            docUnitPriceCol: t('docUnitPriceCol'),
            docSubtotalCol:  t('docSubtotalCol'),
            docTransportRow: t('docTransportRow'),
            docGrandTotal:   t('docGrandTotal'),
            docShippingMode: t('docShippingMode'),
            docDelivery:     t('docDelivery'),
            docNote:         t('docNote'),
            docLegal:        t('docLegal'),
            docLegalText:    t('docLegalText'),
            docLabel:        t('docLabel'),
          }}
          dateLocale={dateLocale}
        />

        <div className="print:hidden mt-8 text-center">
          <Link
            href={`/admin/quote-requests/${id}`}
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            {isRtl ? t('backToRequestAr') : t('backToRequest')}
          </Link>
        </div>
      </div>
    </div>
  )
}
