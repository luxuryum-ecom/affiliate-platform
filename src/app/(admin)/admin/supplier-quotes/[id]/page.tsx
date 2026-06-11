import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { SupplierFinancialsForm } from '@/components/admin/supplier-financials-form'
import { SupplierPayoutForm, PAYOUT_STATUS_CLS } from '@/components/admin/supplier-payout-form'
import { labelPurchaseProfile, labelVolumeTier } from '@/lib/rfq-buyer-intake'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type {
  SupplierQuoteRequest,
  SupplierProduct,
  SupplierPayoutHistory,
  SupplierPayoutStatus,
  SupplierQuoteRequestStatus,
  Profile,
} from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.supplierQuoteDetail')
  return { title: t('metaTitle') }
}

function getStatusBadgeCls(status: SupplierQuoteRequestStatus): string {
  const map: Record<SupplierQuoteRequestStatus, string> = {
    new:       'bg-surface-2 text-muted border border-line',
    studying:  'bg-warning-soft text-warning-fg border border-warning',
    quoted:    'bg-surface-2 text-foreground border border-line',
    approved:  'bg-success-soft text-success-fg border border-success',
    rejected:  'bg-danger-soft text-danger-fg border border-danger',
  }
  return map[status]
}

type QuoteFull = SupplierQuoteRequest & {
  supplier_product: (SupplierProduct & {
    supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
  }) | null
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city' | 'company_name'> | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSupplierQuoteDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('admin.supplierQuoteDetail')
  const tc = await getTranslations('admin.common')
  const tp = await getTranslations('admin.supplierPayoutForm')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const [quoteResult, historyResult] = await Promise.all([
    supabase
      .from('supplier_quote_requests')
      .select(`
        *,
        supplier_product:supplier_products!supplier_product_id(
          *,
          supplier:profiles!supplier_id(id, full_name, phone, city)
        ),
        buyer:profiles!buyer_id(id, full_name, phone, city, company_name)
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('supplier_payout_history')
      .select('*, changed_by_profile:profiles!changed_by(full_name)')
      .eq('supplier_quote_request_id', id)
      .order('changed_at', { ascending: false }),
  ])

  if (!quoteResult.data) notFound()

  const quote = quoteResult.data as unknown as QuoteFull
  const history = (historyResult.data ?? []) as (SupplierPayoutHistory & {
    changed_by_profile: Pick<Profile, 'full_name'> | null
  })[]

  const statusCls = getStatusBadgeCls(quote.status)
  const payoutCls = PAYOUT_STATUS_CLS[quote.supplier_payout_status]
  // ARGENT: totalClientAmount calcul inchangé
  const totalClientAmount = (quote.quoted_unit_price_mad ?? 0) * quote.quantity_requested

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={quote.supplier_product?.product_name ?? id}
        backHref="/admin/supplier-quotes"
        backLabel={locale === 'ar' ? t('backLabel') : t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: quote details + supplier identity + buyer identity + payout history */}
          <div className="lg:col-span-2 space-y-4">

            {/* Quote info */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h1 className="text-base font-semibold text-foreground">
                  {quote.supplier_product?.product_name ?? tc('productFallback')}
                </h1>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusCls}`}>
                  {t(`status${quote.status.charAt(0).toUpperCase()}${quote.status.slice(1)}` as Parameters<typeof t>[0])}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${payoutCls}`}>
                  {tp(`status.${quote.supplier_payout_status}` as Parameters<typeof tp>[0])}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-faint text-xs">{t('qtyRequested')}</dt>
                  <dd className="text-foreground font-medium">{t('units', { qty: quote.quantity_requested })}</dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('destination')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.destination_country}{quote.destination_city ? ` — ${quote.destination_city}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('unitPrice')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.quoted_unit_price_mad != null ? formatMAD(quote.quoted_unit_price_mad) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('totalClient')}</dt>
                  <dd className="text-foreground font-bold">{formatMAD(totalClientAmount)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-faint text-xs">{t('submittedAt')}</dt>
                  <dd className="text-foreground font-medium">
                    {new Date(quote.created_at).toLocaleDateString(locale, {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </dd>
                </div>
                {quote.buyer_notes && (
                  <div className="col-span-2">
                    <dt className="text-faint text-xs">{t('buyerNotes')}</dt>
                    <dd className="text-foreground text-sm mt-0.5 bg-surface-2 rounded-lg px-3 py-2">
                      {quote.buyer_notes}
                    </dd>
                  </div>
                )}
                {quote.admin_notes && (
                  <div className="col-span-2">
                    <dt className="text-faint text-xs">{t('adminNotes')}</dt>
                    <dd className="text-foreground text-sm mt-0.5 bg-warning-soft rounded-lg px-3 py-2 border border-warning">
                      {quote.admin_notes}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Financial breakdown (admin only) */}
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                {t('financialSection')}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-faint text-xs">{t('supplierCost')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.supplier_cost_mad != null ? formatMAD(quote.supplier_cost_mad) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('commissionLabel')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.platform_commission_amount_mad != null
                      ? `${formatMAD(quote.platform_commission_amount_mad)} (${
                          quote.platform_commission_type === 'percent'
                            ? t('commissionPercent', { value: quote.platform_commission_value ?? 0 })
                            : t('commissionFixed', { amount: formatMAD(quote.platform_commission_value ?? 0) })
                        })`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('transport')}</dt>
                  <dd className="text-foreground font-medium">{formatMAD(quote.transport_customs_cost_mad)}</dd>
                </div>
                <div>
                  <dt className="text-faint text-xs">{t('payoutLabel')}</dt>
                  <dd className={`font-bold ${(quote.supplier_payout_amount_mad ?? 0) >= 0 ? 'text-success-fg' : 'text-danger-fg'}`}>
                    {quote.supplier_payout_amount_mad != null ? formatMAD(quote.supplier_payout_amount_mad) : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Supplier identity (admin only) */}
            <div className="bg-warning-soft border border-warning rounded-xl p-5">
              <p className="text-xs font-semibold text-warning-fg uppercase tracking-wide mb-3">
                {t('supplierSection')}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-warning-fg text-xs">{t('supplierName')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.supplier_product?.supplier?.full_name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-warning-fg text-xs">{tc('phone')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.supplier_product?.supplier?.phone ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-warning-fg text-xs">{tc('city')}</dt>
                  <dd className="text-foreground font-medium">
                    {quote.supplier_product?.supplier?.city ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-warning-fg text-xs">{t('supplierProduct')}</dt>
                  <dd className="text-muted text-xs font-mono">{quote.supplier_product_id}</dd>
                </div>
              </dl>
            </div>

            {/* Buyer identity (admin only) */}
            <div className="bg-danger-soft border border-danger rounded-xl p-5">
              <p className="text-xs font-semibold text-danger-fg uppercase tracking-wide mb-3">
                {t('buyerSection')}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-danger-fg text-xs">{t('buyerName')}</dt>
                  <dd className="text-foreground font-medium">{quote.buyer?.full_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-danger-fg text-xs">{t('buyerPhone')}</dt>
                  <dd className="text-foreground font-medium">{quote.buyer?.phone ?? '—'}</dd>
                </div>
                {quote.buyer?.company_name && (
                  <div className="col-span-2">
                    <dt className="text-danger-fg text-xs">{t('buyerCompany')}</dt>
                    <dd className="text-foreground font-medium">{quote.buyer.company_name}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-danger-fg text-xs">{t('buyerWhatsapp')}</dt>
                  <dd className="text-foreground font-medium">{quote.whatsapp_number}</dd>
                </div>
                {(quote.buyer_purchase_profile || quote.buyer_volume_tier) && (
                  <>
                    <div>
                      <dt className="text-danger-fg text-xs">{t('buyerActivityType')}</dt>
                      <dd className="text-foreground font-medium">
                        {labelPurchaseProfile(quote.buyer_purchase_profile)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-danger-fg text-xs">{t('buyerVolume')}</dt>
                      <dd className="text-foreground font-medium">
                        {labelVolumeTier(quote.buyer_volume_tier)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {/* Payout history timeline */}
            {history.length > 0 && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">{t('historyTitle')}</h2>
                <ol className="relative border-l border-line ml-2 space-y-4">
                  {history.map((h) => {
                    const prevStatus = h.previous_status as SupplierPayoutStatus | null
                    const newStatus = h.new_status as SupplierPayoutStatus
                    const prevCls = prevStatus ? PAYOUT_STATUS_CLS[prevStatus] : null
                    const newCls = PAYOUT_STATUS_CLS[newStatus]
                    return (
                      <li key={h.id} className="ml-4">
                        <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-bg bg-muted" />
                        <p className="text-xs text-faint mb-0.5">
                          {new Date(h.changed_at).toLocaleString(locale)}
                          {h.changed_by_profile?.full_name && (
                            <span className="ml-1 text-muted">{t('historyBy', { name: h.changed_by_profile.full_name })}</span>
                          )}
                        </p>
                        <p className="text-sm text-foreground flex flex-wrap items-center gap-1.5">
                          {prevStatus && prevCls && (
                            <>
                              <span className={`text-xs px-1.5 py-0.5 rounded border ${prevCls}`}>
                                {tp(`status.${prevStatus}` as Parameters<typeof tp>[0])}
                              </span>
                              <span className="text-faint">{locale === 'ar' ? t('historyArrowAr') : t('historyArrow')}</span>
                            </>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${newCls}`}>
                            {tp(`status.${newStatus}` as Parameters<typeof tp>[0])}
                          </span>
                        </p>
                        {h.notes && (
                          <p className="text-xs text-muted mt-0.5 italic">{h.notes}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* Right: admin actions */}
          <div className="space-y-4">
            <SupplierFinancialsForm
              quoteRequestId={quote.id}
              quantityRequested={quote.quantity_requested}
              quotedUnitPriceMad={quote.quoted_unit_price_mad}
              supplierCostMad={quote.supplier_cost_mad}
              commissionType={quote.platform_commission_type}
              commissionValue={quote.platform_commission_value}
              commissionAmountMad={quote.platform_commission_amount_mad}
              transportCostMad={quote.transport_customs_cost_mad}
              payoutAmountMad={quote.supplier_payout_amount_mad}
            />
            <SupplierPayoutForm
              quoteRequestId={quote.id}
              currentStatus={quote.supplier_payout_status}
              payoutAmountMad={quote.supplier_payout_amount_mad}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
