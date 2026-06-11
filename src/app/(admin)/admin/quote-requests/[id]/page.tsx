import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getTranslations, getLocale } from 'next-intl/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { QuoteRequestStatusForm } from '@/components/admin/quote-request-status-form'
import { ConvertQuoteButton } from '@/components/admin/convert-quote-button'
import { PrepareQuoteForm } from '@/components/admin/prepare-quote-form'
import type { QuoteRequestWithDetails, QuoteRequestStatus, WholesaleOrder } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

// CSS only — labels via t()
const STATUS_BADGE_CLS: Record<QuoteRequestStatus, string> = {
  new:                 'bg-surface-2 text-muted border border-line',
  studying:            'bg-warning-subtle text-warning border border-warning-line',
  quoted:              'bg-surface-2 text-foreground border border-line',
  quote_prepared:      'bg-warning-subtle text-warning-dark border border-warning-line',
  accepted_by_client:  'bg-success-subtle text-success border border-success-line',
  rejected_by_client:  'bg-danger-subtle text-danger border border-danger-line',
  negotiating:         'bg-warning-subtle text-warning border border-warning-line',
  approved:            'bg-success-subtle text-success border border-success-line',
  rejected:            'bg-danger-subtle text-danger border border-danger-line',
  converted_to_order:  'bg-surface-2 text-faint border border-line',
}

export default async function AdminQuoteRequestDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const adminProfileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = adminProfileRes.data as { full_name: string } | null

  const t  = await getTranslations('admin.quoteRequestDetail')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()
  const isRtl = locale === 'ar'

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
  const badgeCls = STATUS_BADGE_CLS[req.status] ?? STATUS_BADGE_CLS.new

  // ── Taux centraux courants + devise d'affichage client (multi-devise devis) ──
  const [ratesRes, clientCurrencyRes] = await Promise.all([
    supabase.from('current_exchange_rates').select('quote_code, rate_vs_mad'),
    supabase.rpc('client_currency_for', { p_label: req.destination_country }),
  ])
  const rates: Record<string, number> = { MAD: 1 }
  for (const r of (ratesRes.data ?? []) as { quote_code: string; rate_vs_mad: number | string }[]) {
    rates[r.quote_code] = typeof r.rate_vs_mad === 'string' ? parseFloat(r.rate_vs_mad) : r.rate_vs_mad
  }
  const displayCurrency = (clientCurrencyRes.data as string | null) ?? 'MAD'

  function statusLabel(status: QuoteRequestStatus): string {
    const map: Record<QuoteRequestStatus, string> = {
      new:                t('statusNew'),
      studying:           t('statusStudying'),
      quoted:             t('statusQuoted'),
      quote_prepared:     t('statusQuotePrepared'),
      accepted_by_client: t('statusAcceptedByClient'),
      rejected_by_client: t('statusRejectedByClient'),
      negotiating:        t('statusNegotiating'),
      approved:           t('statusApproved'),
      rejected:           t('statusRejected'),
      converted_to_order: t('statusConvertedToOrder'),
    }
    return map[status] ?? status
  }

  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={`#${id.slice(0, 8).toUpperCase()}`}
        backHref="/admin/quote-requests"
        backLabel={isRtl ? `${t('backLabel')} →` : `← ${t('backLabel')}`}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: request info ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Header card */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono text-faint">#{id.slice(0, 8).toUpperCase()}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>
                  {statusLabel(req.status)}
                </span>
                {linkedOrder && (
                  <Link
                    href={`/admin/wholesale-orders/${linkedOrder.id}`}
                    className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-gold-500 border border-line hover:bg-surface transition-colors"
                  >
                    {isRtl
                      ? t('linkLinkedOrder', { id: linkedOrder.id.slice(0, 8).toUpperCase() }).replace('→', '←')
                      : t('linkLinkedOrder', { id: linkedOrder.id.slice(0, 8).toUpperCase() })}
                  </Link>
                )}
                {req.status === 'quote_prepared' && (
                  <Link
                    href={`/admin/quote-requests/${id}/quote-preview`}
                    className="text-xs px-2 py-0.5 rounded-full bg-warning-subtle text-warning-dark border border-warning-line hover:opacity-80 transition-opacity"
                  >
                    {isRtl
                      ? t('linkPreviewQuote').replace('→', '←')
                      : t('linkPreviewQuote')}
                  </Link>
                )}
              </div>
              <h1 className="text-base font-semibold text-foreground mb-1">
                {req.buyer?.company_name ?? req.buyer?.full_name}
              </h1>
              <p className="text-xs text-faint">
                {t('submittedOn', {
                  date: new Date(req.created_at).toLocaleDateString(dateLocale, {
                    day: '2-digit', month: 'long', year: 'numeric',
                  }),
                })}
              </p>
            </div>

            {/* Product */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {t('sectionProduct')}
              </h2>
              <div className="space-y-2 text-sm">
                <Row label={tc('product')} value={req.product?.name ?? '—'} />
                <Row label={t('fieldOrigin')} value={req.product?.origin_country ?? '—'} />
              </div>
            </div>

            {/* Request details */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {t('sectionRequestDetails')}
              </h2>
              <div className="space-y-2 text-sm">
                <Row label={t('fieldQuantity')} value={`${req.quantity_requested}`} />
                <Row label={t('fieldDestination')} value={[req.destination_country, req.destination_city].filter(Boolean).join(', ')} />
                {req.preferred_shipping_mode && (
                  <Row label={t('fieldShippingMode')} value={req.preferred_shipping_mode} />
                )}
                {req.colors_or_variants && (
                  <Row label={t('fieldColors')} value={req.colors_or_variants} />
                )}
                {req.sizes && <Row label={t('fieldSizes')} value={req.sizes} />}
                {req.whatsapp_number && <Row label={t('fieldWhatsapp')} value={req.whatsapp_number} />}
              </div>
              {req.buyer_notes && (
                <div className="mt-4 pt-4 border-t border-line">
                  <p className="text-xs font-medium text-muted mb-1">{t('fieldBuyerNotes')}</p>
                  <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{req.buyer_notes}</p>
                </div>
              )}
            </div>

            {/* Buyer contact */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {t('sectionContact')}
              </h2>
              <div className="space-y-2 text-sm">
                <Row label={t('fieldBuyerName')} value={req.buyer?.full_name ?? '—'} />
                {req.buyer?.company_name && <Row label={t('fieldCompany')} value={req.buyer.company_name} />}
                {req.buyer?.phone && <Row label={t('fieldPhone')} value={req.buyer.phone} />}
                <Row label={t('fieldWhatsapp')} value={req.whatsapp_number} />
              </div>
            </div>
          </div>

          {/* ── Right: admin actions ── */}
          <div className="space-y-5">

            {/* Status management */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
                {t('sectionStatusMgmt')}
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
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  {t('sectionPrepareQuote')}
                </h2>
                <p className="text-xs text-faint mb-4">
                  {t('sectionPrepareQuoteHint')}
                </p>
                <PrepareQuoteForm
                  requestId={id}
                  quantityRequested={req.quantity_requested}
                  rates={rates}
                  displayCurrency={displayCurrency}
                  currentQuote={{
                    quoted_unit_price_mad:     req.quoted_unit_price_mad,
                    quoted_unit_price_source:  req.quoted_unit_price_source,
                    source_currency:           req.source_currency,
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
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2 border border-line text-foreground text-sm font-medium rounded-lg hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-400"
                  >
                    {t('linkPreviewDoc')}
                  </Link>
                )}
              </div>
            )}

            {/* Client decision — shown when client has responded */}
            {(req.status === 'accepted_by_client' || req.status === 'rejected_by_client') && (
              <div className={`rounded-xl border p-4 ${
                req.status === 'accepted_by_client'
                  ? 'bg-success-subtle border-success-line'
                  : 'bg-danger-subtle border-danger-line'
              }`}>
                <p className={`text-xs font-semibold mb-1 ${
                  req.status === 'accepted_by_client' ? 'text-success-dark' : 'text-danger-dark'
                }`}>
                  {t('clientDecision', {
                    label: req.status === 'accepted_by_client'
                      ? t('clientDecisionAccepted')
                      : t('clientDecisionRejected'),
                  })}
                </p>
                {req.client_decision_at && (
                  <p className={`text-xs ${
                    req.status === 'accepted_by_client' ? 'text-success' : 'text-danger'
                  }`}>
                    {t('clientDecisionAt', {
                      date: new Date(req.client_decision_at).toLocaleDateString(dateLocale, {
                        day: '2-digit', month: 'long', year: 'numeric',
                      }),
                      time: new Date(req.client_decision_at).toLocaleTimeString(dateLocale, {
                        hour: '2-digit', minute: '2-digit',
                      }),
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Convert to order — only when approved and not yet converted */}
            {req.status === 'approved' && !linkedOrder && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  {t('sectionWholesaleOrder')}
                </h2>
                <p className="text-xs text-faint mb-4">
                  {t('sectionWholesaleOrderHint')}
                </p>
                <ConvertQuoteButton requestId={id} />
              </div>
            )}

            {/* Converted — show link to order */}
            {req.status === 'converted_to_order' && linkedOrder && (
              <div className="bg-success-subtle rounded-xl border border-success-line p-5">
                <p className="text-xs font-semibold text-success-dark mb-2">
                  {t('sectionOrderCreated')}
                </p>
                <Link
                  href={`/admin/wholesale-orders/${linkedOrder.id}`}
                  className="text-sm text-success hover:text-success-dark font-medium underline underline-offset-2 transition-colors"
                >
                  {isRtl
                    ? t('linkOrder', { id: linkedOrder.id.slice(0, 8).toUpperCase() }).replace('→', '←')
                    : t('linkOrder', { id: linkedOrder.id.slice(0, 8).toUpperCase() })}
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
      <span className="text-muted shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  )
}
