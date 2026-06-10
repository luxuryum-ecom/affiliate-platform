import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderTimeline, buildWholesaleTimeline, buildImportHistoryTimeline, buildPaymentHistoryTimeline } from '@/components/shared/order-timeline'
import { InvoiceRequestForm } from '@/components/wholesale/invoice-request-form'
import { WholesaleProofForm } from '@/components/wholesale/wholesale-proof-form'
import { WholesalePendingActions } from '@/components/wholesale/wholesale-pending-actions'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import type {
  WholesaleOrder,
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
  product: Pick<Product, 'id' | 'name' | 'images' | 'media'>
}

type BillingProfile = Pick<
  Profile,
  'full_name' | 'company_name' | 'ice' | 'registre_commerce' | 'billing_address'
>

// ── Status maps (DB enum value → i18n key suffix) ────────────────────────────

const STATUS_KEY: Record<string, { key: string; cls: string }> = {
  pending:   { key: 'statusPending',   cls: 'bg-amber-100 text-amber-700' },
  confirmed: { key: 'statusConfirmed', cls: 'bg-blue-100 text-blue-700' },
  sourcing:  { key: 'statusSourcing',  cls: 'bg-purple-100 text-purple-700' },
  shipped:   { key: 'statusShipped',   cls: 'bg-indigo-100 text-indigo-700' },
  delivered: { key: 'statusDelivered', cls: 'bg-green-100 text-green-700' },
  cancelled: { key: 'statusCancelled', cls: 'bg-gray-100 text-gray-400' },
}

const IMPORT_STATUS_KEY: Record<WholesaleImportStatus, { key: string; cls: string }> = {
  awaiting_supplier: { key: 'importAwaitingSupplier', cls: 'bg-gray-100 text-gray-600' },
  purchased:         { key: 'importPurchased',        cls: 'bg-amber-100 text-amber-700' },
  in_production:     { key: 'importInProduction',     cls: 'bg-orange-100 text-orange-700' },
  ready_to_ship:     { key: 'importReadyToShip',      cls: 'bg-yellow-100 text-yellow-700' },
  shipped:           { key: 'importShipped',          cls: 'bg-blue-100 text-blue-700' },
  customs_clearance: { key: 'importCustomsClearance', cls: 'bg-purple-100 text-purple-700' },
  delivered:         { key: 'importDelivered',        cls: 'bg-green-100 text-green-700' },
}

const PAYMENT_STATUS_KEY: Record<WholesalePaymentStatus, { key: string; cls: string }> = {
  no_deposit:        { key: 'paymentNoDeposit',        cls: 'bg-gray-100 text-gray-500' },
  deposit_requested: { key: 'paymentDepositRequested', cls: 'bg-amber-100 text-amber-700' },
  deposit_received:  { key: 'paymentDepositReceived',  cls: 'bg-blue-100 text-blue-700' },
  fully_paid:        { key: 'paymentFullyPaid',        cls: 'bg-green-100 text-green-700' },
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

  const [t, tc, locale] = await Promise.all([
    getTranslations('wholesale.orderDetail'),
    getTranslations('wholesale.common'),
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
      .from('wholesale_orders')
      .select('*')
      .eq('id', id)
      .eq('buyer_id', user!.id)
      .single(),
    supabase
      .from('wholesale_order_items')
      .select('*, product:products(id,name,images,media)')
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
  const order = orderRes.data as WholesaleOrder | null
  const items = (itemsRes.data ?? []) as unknown as OrderItemWithProduct[]
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/wholesale/orders" className="text-gray-400 hover:text-gray-600 text-sm">
              {tc('backToOrders')}
            </Link>
            <span className="text-gray-300">{tc('breadcrumbSep')}</span>
            <span className="font-mono text-sm text-gray-700">
              #{id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                {tc('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">

        {showSubmittedBanner && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            {t('submittedBanner')}
          </div>
        )}

        {/* Status header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    {t('badgeInvoiceRequested')}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${paymentEntry.cls}`}>
                  {t(paymentEntry.key as TKey)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {t('orderedOn', { date: fmt(order.created_at) })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">{formatMAD(order.total_amount)}</p>
              <p className="text-xs text-gray-400">
                {t('itemCount', { count: items.length })}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: items + delivery ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Order items */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('sectionItems')}</h2>
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const coverUrl = getProductCoverUrl(item.product)
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <ProductThumbnail
                        src={coverUrl}
                        name={item.product.name}
                        className="w-10 h-10 rounded-lg border shrink-0 text-[10px]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.tier_label_snapshot} · {item.quantity} × {formatMAD(item.unit_price_snapshot)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 shrink-0">
                        {formatMAD(item.subtotal)}
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-gray-100 mt-3 flex justify-between">
                <span className="text-sm font-semibold text-gray-700">{t('itemTotal')}</span>
                <span className="text-sm font-bold text-gray-900">{formatMAD(order.total_amount)}</span>
              </div>
            </div>

            {/* Delivery info */}
            {(order.city || order.address || order.buyer_notes) && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('sectionDelivery')}</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {order.city && (
                    <div>
                      <dt className="text-xs text-gray-400">{t('deliveryCity')}</dt>
                      <dd className="text-gray-800 font-medium">{order.city}</dd>
                    </div>
                  )}
                  {order.address && (
                    <div className={order.city ? '' : 'col-span-2'}>
                      <dt className="text-xs text-gray-400">{t('deliveryAddress')}</dt>
                      <dd className="text-gray-800 font-medium">{order.address}</dd>
                    </div>
                  )}
                  {order.buyer_notes && (
                    <div className="col-span-2">
                      <dt className="text-xs text-gray-400">{t('deliveryNote')}</dt>
                      <dd className="text-gray-800">{order.buyer_notes}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Invoice request section */}
            {isDelivered && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">{t('sectionInvoice')}</h2>
                {order.invoice_requested ? (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm text-green-700 font-medium">
                      {t('invoiceSent')}
                    </p>
                    {order.invoice_requested_at && (
                      <p className="text-xs text-gray-400">
                        {t('invoiceSentOn', { date: fmt(order.invoice_requested_at) })}
                      </p>
                    )}
                    {(order.invoice_company_name || order.invoice_ice || order.invoice_registre_commerce || order.invoice_billing_address) && (
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-gray-100 pt-3">
                        {order.invoice_company_name && (
                          <div>
                            <dt className="text-xs text-gray-400">{t('invoiceCompanyName')}</dt>
                            <dd className="font-medium">{order.invoice_company_name}</dd>
                          </div>
                        )}
                        {order.invoice_ice && (
                          <div>
                            <dt className="text-xs text-gray-400">{t('invoiceIce')}</dt>
                            <dd className="font-medium">{order.invoice_ice}</dd>
                          </div>
                        )}
                        {order.invoice_registre_commerce && (
                          <div>
                            <dt className="text-xs text-gray-400">{t('invoiceRc')}</dt>
                            <dd className="font-medium">{order.invoice_registre_commerce}</dd>
                          </div>
                        )}
                        {order.invoice_billing_address && (
                          <div className="col-span-2">
                            <dt className="text-xs text-gray-400">{t('invoiceBillingAddress')}</dt>
                            <dd className="font-medium">{order.invoice_billing_address}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">
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

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('sectionTracking')}</h2>
              <OrderTimeline steps={timeline} />
            </div>

            {/* Import progress history */}
            {importTimeline.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('sectionImportHistory')}</h2>
                <OrderTimeline steps={importTimeline} />
              </div>
            )}

            {/* Link back to source quote */}
            {order.quote_request_id && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">{t('quoteSource')}</p>
                <Link
                  href={`/wholesale/quote-requests/${order.quote_request_id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                >
                  {t('quoteLinkLabel', { ref: order.quote_request_id.slice(0, 8).toUpperCase() })}
                </Link>
              </div>
            )}

            {/* Payment status */}
            {!['cancelled'].includes(order.status) && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">{t('sectionPayment')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentEntry.cls}`}>
                    {t(paymentEntry.key as TKey)}
                  </span>
                </div>
                {(order.deposit_amount != null || order.deposit_received_amount > 0) && (
                  <div className="space-y-1.5 text-sm">
                    {order.deposit_amount != null && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-400">{t('paymentDepositAsked')}</span>
                        <span className="text-xs font-medium text-gray-700">{formatMAD(order.deposit_amount)}</span>
                      </div>
                    )}
                    {order.deposit_received_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-400">{t('paymentDepositReceivedLabel')}</span>
                        <span className="text-xs font-medium text-blue-700">{formatMAD(order.deposit_received_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-100 pt-1.5">
                      <span className="text-xs font-semibold text-gray-600">{t('paymentRemainingBalance')}</span>
                      <span className={`text-xs font-bold ${remainingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatMAD(remainingBalance)}
                      </span>
                    </div>
                  </div>
                )}
                {order.payment_status === 'no_deposit' && (
                  <p className="text-xs text-gray-400">
                    {t('paymentContactTeam')}
                  </p>
                )}
              </div>
            )}

            {/* Payment proof upload */}
            {!['cancelled'].includes(order.status) && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  {t('sectionProof')}
                </h2>
                <WholesaleProofForm orderId={order.id} existingProofs={proofs} />
              </div>
            )}

            {/* Payment timeline */}
            {paymentTimeline.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('sectionPaymentHistory')}</h2>
                <OrderTimeline steps={paymentTimeline} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
