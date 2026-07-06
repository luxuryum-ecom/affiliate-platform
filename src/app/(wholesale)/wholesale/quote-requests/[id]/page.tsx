import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type { QuoteRequest, QuoteRequestStatus, Product, WholesaleOrder } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('wholesale.quoteRequestDetail')
  return { title: t('metaTitle', { ref: id.slice(0, 8).toUpperCase() }) }
}

type ReqRow = QuoteRequest & { product: Pick<Product, 'id' | 'name' | 'origin_country'> }

const SHIPPING_KEYS: Record<string, keyof ReturnType<typeof buildShippingLabels>> = {
  air_door_to_door_kg: 'shippingAirDoorToDoor',
  sea_textile_kg:      'shippingSeaTextile',
  sea_volume_cbm:      'shippingSeaVolume',
}

function buildShippingLabels(t: (k: string) => string) {
  return {
    shippingAirDoorToDoor: t('shippingAirDoorToDoor'),
    shippingSeaTextile:    t('shippingSeaTextile'),
    shippingSeaVolume:     t('shippingSeaVolume'),
  }
}

export default async function WholesaleQuoteRequestDetailPage({ params }: Params) {
  const { id } = await params

  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.quoteRequestDetail'),
    getTranslations('wholesale.common'),
    getLocale(),
  ])

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
    // Fuite E1 (mig 116) : lecture via la vue redacted acheteur (plus de SELECT base).
    const { data: orderRow } = await supabase
      .from('wholesale_orders_buyer_read')
      .select('id')
      .eq('quote_request_id', id)
      .eq('buyer_id', user.id)
      .maybeSingle()
    linkedOrder = orderRow as Pick<WholesaleOrder, 'id'> | null
  }

  const STATUS_BADGE: Record<QuoteRequestStatus, { label: string; cls: string }> = {
    new:                { label: t('statusNew'),              cls: 'bg-surface-2 text-muted border border-line' },
    studying:           { label: t('statusStudying'),         cls: 'bg-warning-soft text-warning-fg' },
    quoted:             { label: t('statusQuoted'),           cls: 'bg-surface-2 text-muted border border-line' },
    quote_prepared:     { label: t('statusQuotePrepared'),    cls: 'bg-warning-soft text-warning-fg' },
    accepted_by_client: { label: t('statusAcceptedByClient'), cls: 'bg-success-soft text-success-fg' },
    rejected_by_client: { label: t('statusRejectedByClient'), cls: 'bg-danger-soft text-danger-fg' },
    negotiating:        { label: t('statusNegotiating'),      cls: 'bg-warning-soft text-warning-fg' },
    approved:           { label: t('statusApproved'),         cls: 'bg-success-soft text-success-fg' },
    rejected:           { label: t('statusRejected'),         cls: 'bg-danger-soft text-danger-fg' },
    converted_to_order: { label: t('statusConvertedToOrder'), cls: 'bg-surface-2 text-faint' },
  }

  const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE.new
  const shippingLabels = buildShippingLabels((k) => t(k as Parameters<typeof t>[0]))
  const isRtl = locale === 'ar'

  const dateLocale =
    locale === 'ar' ? 'ar-MA-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      day: '2-digit', month: 'long', year: 'numeric',
    })

  return (
    <div className="min-h-screen bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <DashboardHeader
        breadcrumb={`#${id.slice(0, 8).toUpperCase()}`}
        backHref="/wholesale/quote-requests"
        backLabel={t('breadcrumbParent')}
        userName={profile?.full_name}
        signOutLabel={t('signOut')}
        maxWidth="max-w-3xl"
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* Status header */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-faint">#{id.slice(0, 8).toUpperCase()}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
          </div>
          <h1 className="text-base font-semibold text-foreground">{req.product?.name}</h1>
          <p className="text-xs text-faint mt-1">
            {t('submittedOn', { date: formatDate(req.created_at) })}
          </p>
        </div>

        {/* Devis prêt */}
        {req.status === 'quote_prepared' && (
          <div className="bg-warning-soft rounded-xl border border-warning p-5">
            <p className="text-xs font-semibold text-warning-fg mb-2">{t('bannerQuoteReadyTitle')}</p>
            <p className="text-xs text-warning-fg mb-3">{t('bannerQuoteReadyBody')}</p>
            <Link
              href={`/wholesale/quote-requests/${id}/quote`}
              className="inline-block text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity px-4 py-2 rounded-lg"
            >
              {t('bannerQuoteReadyCta')}
            </Link>
          </div>
        )}

        {/* Accepted */}
        {req.status === 'accepted_by_client' && (
          <div className="bg-success-soft rounded-xl border border-success p-5">
            <p className="text-xs font-semibold text-success-fg mb-1">{t('bannerAcceptedTitle')}</p>
            {req.client_decision_at && (
              <p className="text-xs text-success-fg mb-3">
                {t('bannerAcceptedOn', { date: formatDate(req.client_decision_at) })}
              </p>
            )}
            <Link
              href={`/wholesale/quote-requests/${id}/quote`}
              className="inline-block text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity px-4 py-2 rounded-lg"
            >
              {t('bannerAcceptedCta')}
            </Link>
          </div>
        )}

        {/* Rejected by client */}
        {req.status === 'rejected_by_client' && (
          <div className="bg-danger-soft rounded-xl border border-danger p-5">
            <p className="text-xs font-semibold text-danger-fg mb-1">{t('bannerRejectedTitle')}</p>
            {req.client_decision_at && (
              <p className="text-xs text-danger-fg mb-3">
                {t('bannerRejectedOn', { date: formatDate(req.client_decision_at) })}
              </p>
            )}
            <Link
              href={`/wholesale/quote-requests/${id}/quote`}
              className="inline-block text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity px-4 py-2 rounded-lg"
            >
              {t('bannerRejectedCta')}
            </Link>
          </div>
        )}

        {/* Commande disponible */}
        {req.status === 'converted_to_order' && linkedOrder && (
          <div className="bg-success-soft rounded-xl border border-success p-5">
            <p className="text-xs font-semibold text-success-fg mb-2">{t('bannerOrderTitle')}</p>
            <p className="text-xs text-success-fg mb-3">{t('bannerOrderBody')}</p>
            <Link
              href={`/wholesale/orders/${linkedOrder.id}`}
              className="inline-block text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity px-4 py-2 rounded-lg"
            >
              {t('bannerOrderCta')}
            </Link>
          </div>
        )}

        {/* Admin quote notes (only when public) */}
        {req.admin_notes_public && req.admin_notes && (
          <div className="bg-accent-soft rounded-xl border border-gold-300 p-5">
            <h2 className="text-xs font-semibold text-accent-fg uppercase tracking-wide mb-3">
              {t('sectionAdminResponse')}
            </h2>
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
              {req.admin_notes}
            </p>
          </div>
        )}

        {/* Request details */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            {t('sectionRequest')}
          </h2>
          <div className="space-y-2 text-sm">
            <Row label={t('rowProduct')} value={req.product?.name ?? '—'} />
            {req.product?.origin_country && (
              <Row label={t('rowOrigin')} value={req.product.origin_country} />
            )}
            <Row
              label={t('rowQuantity')}
              value={t('units', { count: req.quantity_requested })}
            />
            <Row
              label={t('rowDestination')}
              value={[req.destination_country, req.destination_city].filter(Boolean).join(', ')}
            />
            {req.preferred_shipping_mode && (
              <Row
                label={t('rowShipping')}
                value={
                  req.preferred_shipping_mode in SHIPPING_KEYS
                    ? shippingLabels[SHIPPING_KEYS[req.preferred_shipping_mode]]
                    : req.preferred_shipping_mode
                }
              />
            )}
            {req.colors_or_variants && (
              <Row label={t('rowColors')} value={req.colors_or_variants} />
            )}
            {req.sizes && <Row label={t('rowSizes')} value={req.sizes} />}
            <Row label={t('rowWhatsapp')} value={req.whatsapp_number} />
          </div>
          {req.buyer_notes && (
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-xs font-medium text-muted mb-1">{t('rowNotes')}</p>
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {req.buyer_notes}
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="text-center pt-2">
          <Link
            href="/wholesale/quote-requests"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            {t('backToList')}
          </Link>
        </div>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className="font-medium text-foreground text-end">{value}</span>
    </div>
  )
}
