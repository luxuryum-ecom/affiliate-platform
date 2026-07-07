import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { resolveUnitLabel, priceWithUnit } from '@/lib/units'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildWholesaleTimeline, buildImportHistoryTimeline, buildPaymentHistoryTimeline } from '@/components/shared/order-timeline'
import { InvoiceRequestForm } from '@/components/wholesale/invoice-request-form'
import { WholesaleProofForm } from '@/components/wholesale/wholesale-proof-form'
import { WholesalePendingActions } from '@/components/wholesale/wholesale-pending-actions'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import type {
  WholesaleOrderBuyerView,
  WholesaleOrderItem,
  WholesaleOrderImportHistory,
  WholesaleOrderPaymentHistory,
  WholesaleImportStatus,
  WholesalePaymentStatus,
  OrderProof,
  Product,
  Profile,
} from '@/types/database'

interface Params {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}

type OrderItemWithProduct = WholesaleOrderItem & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sale_unit'> | null
}

type BillingProfile = Pick<
  Profile,
  'full_name' | 'company_name' | 'ice' | 'registre_commerce' | 'billing_address'
>

// ── Status maps (DB enum value → i18n key suffix) ────────────────────────────

const STATUS_KEY: Record<string, { key: string; cls: string }> = {
  pending:   { key: 'statusPending',   cls: 'bg-warning-soft text-warning-fg' },
  confirmed: { key: 'statusConfirmed', cls: 'bg-surface-2 text-muted border border-line' },
  sourcing:  { key: 'statusSourcing',  cls: 'bg-warning-soft text-warning-fg' },
  shipped:   { key: 'statusShipped',   cls: 'bg-surface-2 text-muted border border-line' },
  delivered: { key: 'statusDelivered', cls: 'bg-success-soft text-success-fg' },
  cancelled: { key: 'statusCancelled', cls: 'bg-surface-2 text-faint' },
}

const IMPORT_STATUS_KEY: Record<WholesaleImportStatus, { key: string; cls: string }> = {
  awaiting_supplier: { key: 'importAwaitingSupplier', cls: 'bg-surface-2 text-muted' },
  purchased:         { key: 'importPurchased',        cls: 'bg-warning-soft text-warning-fg' },
  in_production:     { key: 'importInProduction',     cls: 'bg-warning-soft text-warning-fg' },
  ready_to_ship:     { key: 'importReadyToShip',      cls: 'bg-warning-soft text-warning-fg' },
  shipped:           { key: 'importShipped',          cls: 'bg-surface-2 text-muted border border-line' },
  customs_clearance: { key: 'importCustomsClearance', cls: 'bg-warning-soft text-warning-fg' },
  delivered:         { key: 'importDelivered',        cls: 'bg-success-soft text-success-fg' },
}

const PAYMENT_STATUS_KEY: Record<WholesalePaymentStatus, { key: string; cls: string }> = {
  no_deposit:        { key: 'paymentNoDeposit',        cls: 'bg-surface-2 text-muted' },
  deposit_requested: { key: 'paymentDepositRequested', cls: 'bg-warning-soft text-warning-fg' },
  deposit_received:  { key: 'paymentDepositReceived',  cls: 'bg-surface-2 text-muted border border-line' },
  fully_paid:        { key: 'paymentFullyPaid',        cls: 'bg-success-soft text-success-fg' },
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const t = await getTranslations('wholesale.orderDetail')
  return { title: t('metaTitle', { ref: id.slice(0, 8).toUpperCase() }) }
}

export default async function WholesaleOrderDetailPage({ params, searchParams }: Params) {
  const { id } = await params
  const { submitted } = await searchParams
  const showSubmittedBanner = submitted === '1'

  const [t, tc, tUnits, locale] = await Promise.all([
    getTranslations('wholesale.orderDetail'),
    getTranslations('wholesale.common'),
    getTranslations('units'),
    getLocale(),
  ])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, orderRes, itemsRes, importHistoryRes, paymentHistoryRes, proofsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, company_name, ice, registre_commerce, billing_address')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('wholesale_orders_buyer_read')
      .select('*')
      .eq('id', id)
      .eq('buyer_id', user!.id)
      .single(),
    supabase
      // `products` base = staff-only (mig 091) → pas d'embed produit ici (renverrait
      // null). L'affichage produit est résolu via la vue redacted plus bas.
      .from('wholesale_order_items')
      .select('id, order_id, product_id, quantity, unit_price_snapshot, subtotal, tier_label_snapshot')
      .eq('order_id', id),
    supabase
      .from('wholesale_order_import_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('wholesale_order_payment_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('order_proofs')
      .select('*')
      .eq('related_wholesale_order_id', id)
      .order('uploaded_at', { ascending: false }),
  ])

  const profile = profileRes.data as BillingProfile | null
  const order = orderRes.data as WholesaleOrderBuyerView | null
  const rawItems = (itemsRes.data ?? []) as unknown as WholesaleOrderItem[]

  // Affichage produit via la vue redacted `products_catalog_read` (grossiste, zéro
  // coût/marge) — jamais la table `products` base (staff-only, mig 091).
  const itemProductIds = [...new Set(rawItems.map((i) => i.product_id).filter(Boolean))]
  const itemProductDisplay = new Map<string, Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sale_unit'>>()
  if (itemProductIds.length) {
    const { data: prows } = (await supabase
      .from('products_catalog_read')
      .select('id, name, images, media, sale_unit')
      .in('id', itemProductIds)) as { data: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sale_unit'>[] | null }
    for (const p of prows ?? []) itemProductDisplay.set(p.id, p)
  }
  const items: OrderItemWithProduct[] = rawItems.map((i) => ({
    ...i,
    product: itemProductDisplay.get(i.product_id) ?? null,
  }))
  const importHistory = (importHistoryRes.data ?? []) as unknown as WholesaleOrderImportHistory[]
  const paymentHistory = (paymentHistoryRes.data ?? []) as unknown as WholesaleOrderPaymentHistory[]
  const proofs = (proofsRes.data ?? []) as unknown as OrderProof[]

  if (!order) notFound()

  const statusEntry = STATUS_KEY[order.status] ?? STATUS_KEY.pending
  const importEntry = order.import_status
    ? IMPORT_STATUS_KEY[order.import_status as WholesaleImportStatus]
    : null
  const paymentEntry = PAYMENT_STATUS_KEY[order.payment_status as WholesalePaymentStatus] ?? PAYMENT_STATUS_KEY.no_deposit

  const timeline = buildWholesaleTimeline(order)
  const importTimeline = buildImportHistoryTimeline(importHistory)
  const paymentTimeline = buildPaymentHistoryTimeline(paymentHistory)
  const isDelivered = order.status === 'delivered'
  const remainingBalance = order.total_amount - (order.deposit_received_amount ?? 0)

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })

  type TKey = Parameters<typeof t>[0]

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={`#${id.slice(0, 8).toUpperCase()}`}
        backHref="/wholesale/orders"
        backLabel={tc('backToOrders')}
        userName={profile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {showSubmittedBanner && (
          <div className="bg-success-soft border border-success rounded-xl px-4 py-3 text-sm text-success-fg">
            {t('submittedBanner')}
          </div>
        )}

        {/* Status header */}
        <div className="bg-surface rounded-xl border border-line p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusEntry.cls}`}>
                  {t(statusEntry.key as TKey)}
                </span>
                {importEntry && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importEntry.cls}`}>
                    {t(importEntry.key as TKey)}
                  </span>
                )}
                {isDelivered && order.invoice_requested && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-fg border border-gold-300">
                    {t('badgeInvoiceRequested')}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${paymentEntry.cls}`}>
                  {t(paymentEntry.key as TKey)}
                </span>
              </div>
              <p className="text-xs text-faint mt-1.5">
                {t('orderedOn', { date: fmt(order.created_at) })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-foreground">{formatMAD(order.total_amount)}</p>
              <p className="text-xs text-faint">
                {t('itemCount', { count: items.length })}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: items + delivery ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Order items */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('sectionItems')}</h2>
              <div className="divide-y divide-line">
                {items.map((item) => {
                  const coverUrl = item.product ? getProductCoverUrl(item.product) : null
                  const itemName = item.product?.name ?? t('genericProduct')
                  // Suffixe d'unité (C1a) — résolu SERVEUR (string). null si sale_unit
                  // non posé → priceWithUnit renvoie le prix INCHANGÉ (zéro régression).
                  const unitLabel = item.product?.sale_unit
                    ? resolveUnitLabel(item.product.sale_unit, tUnits)
                    : null
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <ProductThumbnail
                        src={coverUrl}
                        name={itemName}
                        className="w-10 h-10 rounded-lg border border-line shrink-0 text-[10px]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {itemName}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {item.tier_label_snapshot} · {item.quantity} × {priceWithUnit(formatMAD(item.unit_price_snapshot), unitLabel)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-foreground shrink-0">
                        {formatMAD(item.subtotal)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-line mt-3 flex justify-between">
                <span className="text-sm font-semibold text-muted">{t('itemTotal')}</span>
                <span className="text-sm font-bold text-foreground">{formatMAD(order.total_amount)}</span>
              </div>
            </div>

            {/* Delivery info */}
            {(order.city || order.address || order.buyer_notes) && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">{t('sectionDelivery')}</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {order.city && (
                    <div>
                      <dt className="text-xs text-faint">{t('deliveryCity')}</dt>
                      <dd className="text-foreground font-medium">{order.city}</dd>
                    </div>
                  )}
                  {order.address && (
                    <div className={order.city ? '' : 'col-span-2'}>
                      <dt className="text-xs text-faint">{t('deliveryAddress')}</dt>
                      <dd className="text-foreground font-medium">{order.address}</dd>
                    </div>
                  )}
                  {order.buyer_notes && (
                    <div className="col-span-2">
                      <dt className="text-xs text-faint">{t('deliveryNote')}</dt>
                      <dd className="text-foreground">{order.buyer_notes}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Invoice request section */}
            {isDelivered && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-1">{t('sectionInvoice')}</h2>
                {order.invoice_requested ? (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm text-success-fg font-medium">
                      {t('invoiceSent')}
                    </p>
                    {order.invoice_requested_at && (
                      <p className="text-xs text-faint">
                        {t('invoiceSentOn', { date: fmt(order.invoice_requested_at) })}
                      </p>
                    )}
                    <a
                      href={`/wholesale/orders/${order.id}/invoice`}
                      className="inline-flex items-center gap-2 rounded-lg bg-foreground text-bg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity mt-1"
                      download
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {t('invoiceDownloadPdf')}
                    </a>
                    {(order.invoice_company_name || order.invoice_ice || order.invoice_registre_commerce || order.invoice_billing_address) && (
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-line pt-3">
                        {order.invoice_company_name && (
                          <div>
                            <dt className="text-xs text-faint">{t('invoiceCompanyName')}</dt>
                            <dd className="font-medium">{order.invoice_company_name}</dd>
                          </div>
                        )}
                        {order.invoice_ice && (
                          <div>
                            <dt className="text-xs text-faint">{t('invoiceIce')}</dt>
                            <dd className="font-medium">{order.invoice_ice}</dd>
                          </div>
                        )}
                        {order.invoice_registre_commerce && (
                          <div>
                            <dt className="text-xs text-faint">{t('invoiceRc')}</dt>
                            <dd className="font-medium">{order.invoice_registre_commerce}</dd>
                          </div>
                        )}
                        {order.invoice_billing_address && (
                          <div className="col-span-2">
                            <dt className="text-xs text-faint">{t('invoiceBillingAddress')}</dt>
                            <dd className="font-medium">{order.invoice_billing_address}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-faint mb-2">
                      {t('invoiceAvailableAfter')}
                    </p>
                    {profile && <InvoiceRequestForm orderId={order.id} profile={profile} />}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: timeline ── */}
          <div className="space-y-4">
            {!['cancelled'].includes(order.status) && (
              <WholesalePendingActions
                orderId={order.id}
                currentNote={order.buyer_notes}
                status={order.status}
              />
            )}

            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('sectionTracking')}</h2>
              <OrderTimeline steps={timeline} />
            </div>

            {/* Import progress history */}
            {importTimeline.length > 0 && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">{t('sectionImportHistory')}</h2>
                <OrderTimeline steps={importTimeline} />
              </div>
            )}

            {/* Link back to source quote */}
            {order.quote_request_id && (
              <div className="bg-surface rounded-xl border border-line p-4">
                <p className="text-xs text-faint mb-1">{t('quoteSource')}</p>
                <Link
                  href={`/wholesale/quote-requests/${order.quote_request_id}`}
                  className="text-sm text-muted hover:text-foreground font-medium underline underline-offset-2 transition-colors"
                >
                  {t('quoteLinkLabel', { ref: order.quote_request_id.slice(0, 8).toUpperCase() })}
                </Link>
              </div>
            )}

            {/* Payment status */}
            {!['cancelled'].includes(order.status) && (
              <div className="bg-surface rounded-xl border border-line p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted">{t('sectionPayment')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentEntry.cls}`}>
                    {t(paymentEntry.key as TKey)}
                  </span>
                </div>
                {(order.deposit_amount != null || order.deposit_received_amount > 0) && (
                  <div className="space-y-1.5 text-sm">
                    {order.deposit_amount != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-faint">{t('paymentDepositAsked')}</span>
                        <span className="text-xs font-medium text-muted">{formatMAD(order.deposit_amount)}</span>
                      </div>
                    )}
                    {order.deposit_received_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs text-faint">{t('paymentDepositReceivedLabel')}</span>
                        <span className="text-xs font-medium text-success-fg">{formatMAD(order.deposit_received_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-line pt-1.5">
                      <span className="text-xs font-semibold text-muted">{t('paymentRemainingBalance')}</span>
                      <span className={`text-xs font-bold ${remainingBalance > 0 ? 'text-danger-fg' : 'text-success-fg'}`}>
                        {formatMAD(remainingBalance)}
                      </span>
                    </div>
                  </div>
                )}
                {order.payment_status === 'no_deposit' && (
                  <p className="text-xs text-faint">
                    {t('paymentContactTeam')}
                  </p>
                )}
              </div>
            )}

            {/* Payment proof upload */}
            {!['cancelled'].includes(order.status) && (
              <div className="bg-surface rounded-xl border border-line p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {t('sectionProof')}
                </h2>
                <WholesaleProofForm orderId={order.id} existingProofs={proofs} />
              </div>
            )}

            {/* Payment timeline */}
            {paymentTimeline.length > 0 && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">{t('sectionPaymentHistory')}</h2>
                <OrderTimeline steps={paymentTimeline} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
