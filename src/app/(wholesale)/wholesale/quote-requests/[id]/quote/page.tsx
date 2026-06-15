import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { QuoteDocument } from '@/components/shared/quote-document'
import { PrintButton } from '@/components/shared/print-button'
import { QuoteDecisionButtons } from '@/components/wholesale/quote-decision-buttons'
import type { QuoteRequest, Product, Profile } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('wholesale.quoteSubmit')
  return { title: t('metaTitle', { ref: id.slice(0, 8).toUpperCase() }) }
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

  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.quoteSubmit'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Liste blanche stricte (IMP-A) : NE JAMAIS renvoyer au grossiste les champs
  // internes (source_currency, quoted_unit_price_source, fx_rate_source_to_mad,
  // admin_notes…) qui révéleraient le coût d'achat et la marge.
  const { data } = await supabase
    .from('quote_requests')
    .select(
      'id, status, client_decision_at, ' +
      'quoted_unit_price_mad, quoted_quantity, quoted_transport_total_mad, ' +
      'quoted_shipping_mode, quoted_delivery_delay, quote_validity_date, ' +
      'quote_public_note, quote_prepared_at, destination_country, destination_city, ' +
      'display_currency, fx_rate_display_vs_mad, ' +
      'buyer:profiles!buyer_id(id,full_name,company_name), ' +
      'product:products!product_id(id,name,origin_country)',
    )
    .eq('id', id)
    .eq('buyer_id', user.id)
    .single()

  const req = data as unknown as QuoteRow | null

  if (!req || !VISIBLE_STATUSES.has(req.status)) notFound()

  const isAccepted = req.status === 'accepted_by_client'
  const isRejected = req.status === 'rejected_by_client'
  const isPending  = req.status === 'quote_prepared'

  const dateLocale =
    locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      day: '2-digit', month: 'long', year: 'numeric',
    })

  const isRtl = locale === 'ar'

  return (
    <div className="min-h-screen bg-bg print:bg-white" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="print:hidden bg-surface border-b border-line">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/wholesale/quote-requests/${id}`}
              className="text-faint hover:text-muted text-sm transition-colors"
            >
              {t('breadcrumbParent')}
            </Link>
            <span className="text-line">/</span>
            <span className="text-sm text-foreground font-medium">{t('breadcrumbCurrent')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="light" />
            <PrintButton label={t('printBtn')} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 print:px-0 print:py-0">

        {/* ── Acceptance banner ── */}
        {isAccepted && (
          <div className="print:hidden mb-6 flex items-start gap-3 bg-success-soft border border-success rounded-xl p-4">
            <span className="text-success-fg text-lg leading-none mt-0.5">✓</span>
            <div>
              <p className="text-sm font-semibold text-success-fg">
                {t('bannerAcceptedTitle')}
              </p>
              {req.client_decision_at && (
                <p className="text-xs text-success-fg mt-0.5">
                  {t('bannerAcceptedOn', { date: formatDate(req.client_decision_at) })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Rejection notice ── */}
        {isRejected && (
          <div className="print:hidden mb-6 flex items-start gap-3 bg-danger-soft border border-danger rounded-xl p-4">
            <span className="text-danger-fg text-lg leading-none mt-0.5">✕</span>
            <div>
              <p className="text-sm font-semibold text-danger-fg">{t('bannerRejectedTitle')}</p>
              {req.client_decision_at && (
                <p className="text-xs text-danger-fg mt-0.5">
                  {t('bannerRejectedOn', { date: formatDate(req.client_decision_at) })}
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
            docOriginPrefix: locale === 'ar' ? 'المنشأ: ' : locale === 'en' ? 'Origin: ' : 'Origine : ',
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

        {/* ── Accept / Reject buttons — only when pending decision ── */}
        {isPending && (
          <div className="print:hidden mt-8 bg-surface rounded-xl border border-line p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">
              {t('decisionTitle')}
            </h2>
            <p className="text-xs text-muted mb-4">
              {t('decisionSubtitle')}
            </p>
            <QuoteDecisionButtons
              requestId={id}
              labels={{
                acceptBtn:          t('acceptBtn'),
                rejectBtn:          t('rejectBtn'),
                confirmAcceptTitle: t('confirmAcceptTitle'),
                confirmAcceptBody:  t('confirmAcceptBody'),
                confirmRejectTitle: t('confirmRejectTitle'),
                confirmRejectBody:  t('confirmRejectBody'),
                cancelBtn:          t('cancelBtn'),
                confirmBtn:         t('confirmBtn'),
                pendingBtn:         t('pendingBtn'),
                decisionSaved:      t('decisionSaved'),
              }}
            />
          </div>
        )}

        <div className="print:hidden mt-8 text-center">
          <Link
            href="/wholesale/quote-requests"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {t('backToList')}
          </Link>
        </div>
      </div>
    </div>
  )
}
