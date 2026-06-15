import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { WholesaleOrderStatusForm } from '@/components/admin/wholesale-order-status-form'
import { WholesaleOrderAssignForm } from '@/components/admin/wholesale-order-assign-form'
import { WholesaleSupplierAssignForm } from '@/components/admin/wholesale-supplier-assign-form'
import { WholesaleImportStatusForm } from '@/components/admin/wholesale-import-status-form'
import { WholesalePaymentForm } from '@/components/admin/wholesale-payment-form'
import { OrderTimeline, buildWholesaleTimeline, buildImportHistoryTimeline, buildPaymentHistoryTimeline } from '@/components/shared/order-timeline'
import { WholesaleCostForm } from '@/components/admin/wholesale-cost-form'
import { WholesaleDeliveryConfigForm } from '@/components/admin/wholesale-delivery-config-form'
import type { WholesaleOrder, WholesaleOrderItem, Profile, Product, WholesaleOrderStatus, WholesaleImportStatus, WholesaleOrderImportHistory, WholesaleOrderPaymentHistory, WholesalePaymentStatus, QuoteRequest, OrderProof } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

export async function generateMetadata() {
  const t = await getTranslations('admin.wholesaleOrderDetail')
  return { title: t('metaTitle') }
}

// CSS only — labels via t()
const STATUS_CLS: Record<string, string> = {
  pending:   'bg-warning-soft text-warning-fg border-warning',
  confirmed: 'bg-surface-2 text-muted border-line',
  sourcing:  'bg-accent-soft text-accent-fg border-accent',
  shipped:   'bg-surface-2 text-muted border-line',
  delivered: 'bg-success-soft text-success-fg border-success',
  cancelled: 'bg-surface-2 text-faint border-line',
}

const IMPORT_STATUS_CLS: Record<WholesaleImportStatus, string> = {
  awaiting_supplier: 'bg-surface-2 text-muted border-line',
  purchased:         'bg-warning-soft text-warning-fg border-warning',
  in_production:     'bg-warning-soft text-warning-fg border-warning',
  ready_to_ship:     'bg-warning-soft text-warning-fg border-warning',
  shipped:           'bg-surface-2 text-muted border-line',
  customs_clearance: 'bg-accent-soft text-accent-fg border-accent',
  delivered:         'bg-success-soft text-success-fg border-success',
}

const PAYMENT_STATUS_CLS: Record<WholesalePaymentStatus, string> = {
  no_deposit:        'bg-surface-2 text-faint border-line',
  deposit_requested: 'bg-warning-soft text-warning-fg border-warning',
  deposit_received:  'bg-surface-2 text-muted border-line',
  fully_paid:        'bg-success-soft text-success-fg border-success',
}

type OrderItemWithProduct = WholesaleOrderItem & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'stock_count' | 'availability_type'>
}
type OrderDetail = WholesaleOrder & {
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
  agent: Pick<Profile, 'id' | 'full_name'> | null
  items: OrderItemWithProduct[]
}
type LinkedQuote = Pick<QuoteRequest, 'id'>

export default async function AdminWholesaleOrderDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const t  = await getTranslations('admin.wholesaleOrderDetail')
  const tc = await getTranslations('admin.common')
  const tAssign = await getTranslations('admin.wholesaleAssign')
  const tSupplier = await getTranslations('admin.wholesaleSupplierAssign')
  const locale = await getLocale()
  const isRtl = locale === 'ar'
  const dateLocale = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-MA'

  const { data: { user } } = await supabase.auth.getUser()
  const adminProfileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = adminProfileRes.data as { full_name: string } | null

  const [orderRes, itemsRes, importHistoryRes, paymentHistoryRes, proofsRes, deliveryCollectRes] = await Promise.all([
    supabase
      .from('wholesale_orders')
      .select('*, buyer:profiles!buyer_id(id,full_name,phone,city), agent:profiles!agent_id(id,full_name)')
      .eq('id', id)
      .single(),
    supabase
      .from('wholesale_order_items')
      .select('*, product:products(id,name,images,stock_count,availability_type)')
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
    // État de collecte du rebill livraison (ledger admin-only, lecture serveur).
    // On ne sélectionne QUE amount_mad du seul enregistrement de collecte — aucune
    // colonne de marge/coût fournisseur exposée. Au plus 1 ligne (index partiel).
    supabase
      .from('wholesale_delivery_ledger')
      .select('amount_mad')
      .eq('wholesale_order_id', id)
      .eq('entry_type', 'delivery_rebill_collected')
      .maybeSingle(),
  ])

  const order = orderRes.data as unknown as OrderDetail | null
  const items = (itemsRes.data ?? []) as unknown as OrderItemWithProduct[]
  const importHistory = (importHistoryRes.data ?? []) as unknown as WholesaleOrderImportHistory[]
  const paymentHistory = (paymentHistoryRes.data ?? []) as unknown as WholesaleOrderPaymentHistory[]
  const proofs = (proofsRes.data ?? []) as unknown as OrderProof[]

  // État de collecte du rebill livraison (dérivé serveur, pour affichage lecture seule).
  const deliveryCollect = deliveryCollectRes.data as { amount_mad: number } | null
  const rebillCollected = deliveryCollect != null
  const collectedAmount = deliveryCollect?.amount_mad ?? null

  // Fetch linked quote if this order was created from a quote
  let linkedQuote: LinkedQuote | null = null
  if (order?.quote_request_id) {
    const { data } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', order.quote_request_id)
      .maybeSingle()
    linkedQuote = data as LinkedQuote | null
  }

  if (!order) notFound()

  // Membres assignables : membres actifs de l'équipe de cet owner uniquement.
  let assignMembers: { id: string; name: string }[] = []
  const { data: teamRows } = await supabase
    .from('team_members')
    .select('member:profiles!member_id(id,full_name)')
    .eq('owner_id', user!.id)
    .eq('active', true)
  if (teamRows && teamRows.length > 0) {
    type MemberJoin = { id: string; full_name: string | null }
    assignMembers = teamRows
      .map((r) => {
        const m = (r as unknown as { member: MemberJoin | MemberJoin[] | null }).member
        return Array.isArray(m) ? m[0] ?? null : m
      })
      .filter((m): m is MemberJoin => m != null)
      .map((m) => ({ id: m.id, name: m.full_name ?? m.id.slice(0, 8) }))
  }

  // Fournisseurs approuvés assignables
  let assignSuppliers: { id: string; name: string }[] = []
  const { data: supplierRows } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'supplier')
    .eq('status', 'approved')
  if (supplierRows && supplierRows.length > 0) {
    type SupplierRow = { id: string; full_name: string | null }
    assignSuppliers = (supplierRows as SupplierRow[]).map((s) => ({
      id: s.id,
      name: s.full_name ?? s.id.slice(0, 8),
    }))
  }

  const isLocalStockOrder =
    !linkedQuote &&
    items.length > 0 &&
    items.every((item) => item.product.availability_type === 'local_stock')

  const statusCls = STATUS_CLS[order.status] ?? STATUS_CLS.pending
  const importStatus = order.import_status as WholesaleImportStatus | null
  const importCls = importStatus ? IMPORT_STATUS_CLS[importStatus] ?? null : null
  const paymentStatus = (order.payment_status ?? 'no_deposit') as WholesalePaymentStatus
  const paymentCls = PAYMENT_STATUS_CLS[paymentStatus] ?? PAYMENT_STATUS_CLS.no_deposit

  const timeline = buildWholesaleTimeline(order)
  const importTimeline = buildImportHistoryTimeline(importHistory)
  const paymentTimeline = buildPaymentHistoryTimeline(paymentHistory)

  const proofLabel = (type: string) =>
    type === 'bank_receipt'
      ? t('proofBankReceipt')
      : type === 'transfer_proof'
      ? t('proofTransferProof')
      : t('proofOther')

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={`#${id.slice(0,8).toUpperCase()}`}
        backHref="/admin/wholesale-orders"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Status + buyer */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusCls}`}>
                      {tc(`wholesaleStatus.${order.status}`)}
                    </span>
                    {importCls && importStatus && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border border-dashed ${importCls}`}>
                        {tc(`importStatusBadge.${importStatus}`)}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${paymentCls}`}>
                      {tc(`paymentStatus.${paymentStatus}`)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                      {order.quote_request_id ? t('viaQuote') : t('directOrder')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-faint">
                    {t('createdOn', { date: new Date(order.created_at).toLocaleString(dateLocale) })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{formatMAD(order.total_amount)}</p>
                  <p className="text-xs text-faint">{t('itemsCount', { count: items.length })}</p>
                </div>
              </div>
            </div>

            {/* Buyer info */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t('buyer')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-faint">{tc('name')}</p><p className="font-medium text-foreground">{order.buyer.full_name}</p></div>
                <div><p className="text-xs text-faint">{tc('phone')}</p><p className="font-medium text-foreground">{order.buyer.phone ?? '—'}</p></div>
                <div><p className="text-xs text-faint">{tc('city')}</p><p className="font-medium text-foreground">{order.city ?? order.buyer.city ?? '—'}</p></div>
                <div><p className="text-xs text-faint">{tc('address')}</p><p className="font-medium text-foreground">{order.address ?? '—'}</p></div>
                {order.buyer_notes && (
                  <div className="col-span-2 mt-1 flex gap-2 items-start rounded-lg bg-warning-soft border border-warning px-3 py-2.5">
                    <span className="text-warning-fg mt-0.5 shrink-0">⚠</span>
                    <div>
                      <p className="text-xs font-semibold text-warning-fg">{t('buyerNote')}</p>
                      <p className="text-sm text-foreground mt-0.5">{order.buyer_notes}</p>
                    </div>
                  </div>
                )}
                {order.agent_notes && <div className="col-span-2"><p className="text-xs text-faint">{t('agentNote')}</p><p className="text-muted">{order.agent_notes}</p></div>}
              </div>
            </div>

            {/* Order items */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t('orderedItems')}</h2>
              <div className="divide-y divide-line">
                {items.map((item) => {
                  const coverUrl = getProductCoverUrl(item.product)
                  const lowStock = item.product.stock_count < 5
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <ProductThumbnail
                        src={coverUrl}
                        name={item.product.name}
                        className="w-10 h-10 rounded-lg border border-line shrink-0 text-[10px]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.product.name}</p>
                        <p className="text-xs text-muted">
                          {item.tier_label_snapshot} · {item.quantity} × {formatMAD(item.unit_price_snapshot)}
                        </p>
                        {lowStock && <p className="text-xs text-warning-fg">{t('lowStock', { count: item.product.stock_count })}</p>}
                      </div>
                      <p className="text-sm font-bold text-foreground shrink-0">{formatMAD(item.subtotal)}</p>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-line mt-3 flex justify-between">
                <span className="text-sm font-semibold text-foreground">{t('total')}</span>
                <span className="text-sm font-bold text-foreground">{formatMAD(order.total_amount)}</span>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('orderTracking')}</h2>
              <OrderTimeline steps={timeline} />
            </div>

            {/* Import progress history */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                {isLocalStockOrder ? t('historyLocalHeading') : t('historyImportHeading')}
              </h2>
              {importTimeline.length === 0 ? (
                <p className="text-xs text-faint italic">
                  {isLocalStockOrder ? t('historyLocalEmpty') : t('historyImportEmpty')}
                </p>
              ) : (
                <OrderTimeline steps={importTimeline} />
              )}
            </div>

            {/* Payment history */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('paymentHistory')}</h2>
              {paymentTimeline.length === 0 ? (
                <p className="text-xs text-faint italic">
                  {t('paymentHistoryEmpty')}
                </p>
              ) : (
                <OrderTimeline steps={paymentTimeline} />
              )}
            </div>

            {/* Justificatifs soumis par le grossiste */}
            {proofs.length > 0 && (
              <div className="bg-surface rounded-xl border border-line p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  {t('paymentProofs')}
                </h2>
                <ul className="space-y-2">
                  {proofs.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 text-xs">
                      <a
                        href={p.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold-500 hover:text-gold-600 transition-colors"
                      >
                        {proofLabel(p.proof_type)}
                      </a>
                      <span className="text-faint shrink-0">
                        {new Date(p.uploaded_at).toLocaleDateString(dateLocale)}
                      </span>
                      {p.notes && (
                        <span className="text-muted italic truncate">{p.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Right: status update + cost breakdown ── */}
          <div className="space-y-4">
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('updateHeading')}</h2>
              <WholesaleOrderStatusForm
                orderId={order.id}
                currentStatus={order.status as WholesaleOrderStatus}
              />
            </div>

            {/* Import status form */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                {isLocalStockOrder ? t('importStatusLocalHeading') : t('importStatusHeading')}
              </h2>
              <WholesaleImportStatusForm
                orderId={order.id}
                currentImportStatus={order.import_status as WholesaleImportStatus | null}
                isLocalStock={isLocalStockOrder}
              />
            </div>

            {/* Cost breakdown form */}
            <WholesaleCostForm
              orderId={order.id}
              supplierCost={order.supplier_cost_mad ?? 0}
              transportCost={order.transport_customs_cost_mad ?? 0}
              additionalCost={order.additional_cost_mad ?? 0}
              totalAmount={order.total_amount}
              isLocalStock={isLocalStockOrder}
            />

            {/* Delivery cost configuration (LOT 4.3) */}
            <WholesaleDeliveryConfigForm
              orderId={order.id}
              currentHandling={order.delivery_cost_handling}
              currentLogisticsMode={order.logistics_mode}
              deliveryCost={order.delivery_cost_mad ?? 0}
              deliveryRebill={order.delivery_rebill_mad ?? 0}
              rebillCollected={rebillCollected}
              collectedAmount={collectedAmount}
            />

            {/* Payment management */}
            <WholesalePaymentForm
              orderId={order.id}
              totalAmount={order.total_amount}
              currentStatus={(order.payment_status as WholesalePaymentStatus) ?? 'no_deposit'}
              depositAmount={order.deposit_amount ?? null}
              depositReceived={order.deposit_received_amount ?? 0}
            />

            {/* Linked quote */}
            {linkedQuote && (
              <div className="bg-surface rounded-xl border border-line p-4">
                <p className="text-xs text-faint mb-1">{t('createdFromQuote')}</p>
                <Link
                  href={`/admin/quote-requests/${linkedQuote.id}`}
                  className="text-sm text-gold-500 hover:text-gold-600 font-medium underline underline-offset-2 transition-colors"
                >
                  {t('quoteLink')} #{linkedQuote.id.slice(0, 8).toUpperCase()} {isRtl ? '←' : '→'}
                </Link>
              </div>
            )}

            {/* Assignation à un membre d'équipe */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{tAssign('heading')}</h2>
              {order.agent && (
                <p className="text-xs text-faint mb-3">
                  {tAssign('currentlyAssigned')}{' '}
                  <span className="text-foreground font-medium">{order.agent.full_name}</span>
                </p>
              )}
              <WholesaleOrderAssignForm
                orderId={order.id}
                members={assignMembers}
                currentAgentId={order.agent?.id ?? null}
              />
            </div>

            {/* Assignation fournisseur */}
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{tSupplier('heading')}</h2>
              {order.supplier_id && (
                <p className="text-xs text-faint mb-3">
                  {tSupplier('currentlyAssigned')}{' '}
                  <span className="text-foreground font-medium">
                    {assignSuppliers.find((s) => s.id === order.supplier_id)?.name ?? order.supplier_id.slice(0, 8)}
                  </span>
                </p>
              )}
              <WholesaleSupplierAssignForm
                orderId={order.id}
                suppliers={assignSuppliers}
                currentSupplierId={order.supplier_id ?? null}
              />
              {/* Réponse fournisseur */}
              <div className="mt-4 pt-4 border-t border-line">
                {order.supplier_response ? (
                  <div className="space-y-1.5 text-xs">
                    <p className="text-faint">
                      {tSupplier('responseLabel')}{' '}
                      <span className="text-foreground font-medium">
                        {order.supplier_response === 'available'
                          ? tSupplier('responseAvailable')
                          : order.supplier_response === 'preparing'
                          ? tSupplier('responsePreparing')
                          : tSupplier('responseOnOrder')}
                      </span>
                    </p>
                    {order.supplier_lead_time_days != null && (
                      <p className="text-faint">
                        {tSupplier('leadTimeDays', { count: order.supplier_lead_time_days })}
                      </p>
                    )}
                    {order.supplier_responded_at && (
                      <p className="text-faint">
                        {tSupplier('respondedAt', {
                          date: new Date(order.supplier_responded_at).toLocaleDateString(dateLocale),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-faint italic">{tSupplier('responsePending')}</p>
                )}
              </div>
            </div>

            {/* Invoice request */}
            {order.invoice_requested && (
              <div className="bg-accent-soft border border-accent rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-accent-fg">{t('invoiceRequest')}</p>
                  {order.invoice_requested_at && (
                    <p className="text-xs text-accent-fg">
                      {new Date(order.invoice_requested_at).toLocaleDateString(dateLocale)}
                    </p>
                  )}
                </div>
                <dl className="space-y-1.5 text-sm">
                  {order.invoice_company_name && (
                    <div><dt className="text-xs text-accent-fg">{t('invoiceCompanyName')}</dt><dd className="font-medium text-foreground">{order.invoice_company_name}</dd></div>
                  )}
                  {order.invoice_ice && (
                    <div><dt className="text-xs text-accent-fg">{t('invoiceIce')}</dt><dd className="font-medium text-foreground">{order.invoice_ice}</dd></div>
                  )}
                  {order.invoice_registre_commerce && (
                    <div><dt className="text-xs text-accent-fg">{t('invoiceRc')}</dt><dd className="font-medium text-foreground">{order.invoice_registre_commerce}</dd></div>
                  )}
                  {order.invoice_billing_address && (
                    <div><dt className="text-xs text-accent-fg">{t('invoiceBillingAddress')}</dt><dd className="font-medium text-foreground">{order.invoice_billing_address}</dd></div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
