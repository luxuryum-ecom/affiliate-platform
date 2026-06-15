import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { getProductCoverUrl } from '@/lib/product-media'
import { OrderStatusForm } from '@/components/admin/order-status-form'
import { CommissionStatusForm } from '@/components/admin/commission-status-form'
import { OrderProofForm } from '@/components/admin/order-proof-form'
import { OrderTimeline, buildCodTimeline } from '@/components/shared/order-timeline'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Order, Product, Profile, Commission, OrderProof } from '@/types/database'

interface Params { params: Promise<{ id: string }> }

const STATUS_CLS: Record<string, string> = {
  pending_confirmation: 'bg-warning-soft text-warning-fg border-warning',
  confirmed: 'bg-surface-2 text-muted border-line',
  shipped:   'bg-surface-2 text-muted border-line',
  delivered: 'bg-success-soft text-success-fg border-success',
  returned:  'bg-danger-soft text-danger-fg border-danger',
  cancelled: 'bg-surface-2 text-faint border-line',
}

type OrderDetail = Order & {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sell_price' | 'commission_amount'>
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
}

export default async function AdminOrderDetailPage({ params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations('admin.orderDetail')
  const tc = await getTranslations('admin.common')
  const to = await getTranslations('admin.orders')
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  const profileRes = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  const adminProfile = profileRes.data as { full_name: string } | null

  const [orderRes, commissionRes, proofsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*, product:products(id,name,images,media,sell_price,commission_amount), affiliate:profiles!affiliate_id(id,full_name,phone,city)')
      .eq('id', id)
      .single(),
    supabase.from('commissions').select('*').eq('order_id', id).maybeSingle(),
    supabase.from('order_proofs').select('*').eq('related_order_id', id).order('uploaded_at', { ascending: false }),
  ])

  const order = orderRes.data as unknown as OrderDetail | null
  const commission = commissionRes.data as Commission | null
  const proofs = (proofsRes.data ?? []) as OrderProof[]

  if (!order) notFound()

  const badgeCls = STATUS_CLS[order.status] ?? STATUS_CLS.pending_confirmation
  const coverUrl = getProductCoverUrl(order.product)
  const timeline = buildCodTimeline(order)
  const ref = id.slice(0, 8).toUpperCase()

  const unitPrice = order.product_price_snapshot ?? order.product.sell_price
  const commissionSnap =
    order.affiliate_commission_mad_snapshot ?? order.commission_amount

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={`#${ref}`}
        backHref="/admin/orders"
        backLabel={to('backOrders')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 space-y-5">

            <div className="bg-surface rounded-xl border border-line p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>{tc(`cod.${order.status}`)}</span>
                  <p className="mt-2 text-xs text-faint">
                    {t('createdAt', { date: new Date(order.created_at).toLocaleString(locale) })}
                  </p>
                </div>
                <ProductThumbnail
                  src={coverUrl}
                  name={order.product.name}
                  className="w-12 h-12 rounded-lg border border-line shrink-0"
                />
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-line p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{t('customer')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-faint">{tc('name')}</p><p className="font-medium text-foreground">{order.customer_name}</p></div>
                <div><p className="text-xs text-faint">{tc('phone')}</p><p className="font-medium text-foreground">{order.customer_phone}</p></div>
                <div><p className="text-xs text-faint">{tc('city')}</p><p className="font-medium text-foreground">{order.customer_city}</p></div>
                <div className="col-span-2"><p className="text-xs text-faint">{tc('address')}</p><p className="font-medium text-foreground">{order.customer_address}</p></div>
                {order.notes && <div className="col-span-2"><p className="text-xs text-faint">{tc('note')}</p><p className="text-foreground">{order.notes}</p></div>}
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-line p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{t('productSnapshots')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><p className="text-xs text-faint">{tc('product')}</p><p className="font-medium text-foreground">{order.product.name}</p></div>
                <div><p className="text-xs text-faint">{t('quantity')}</p><p className="font-medium">{order.quantity}</p></div>
                <div><p className="text-xs text-faint">{t('unitPrice')}</p><p className="font-medium">{formatMAD(unitPrice)}</p></div>
                <div><p className="text-xs text-faint">{t('orderTotal')}</p><p className="font-bold text-foreground">{formatMAD(order.total_amount)}</p></div>
                <div><p className="text-xs text-faint">{t('affiliateCommission')}</p><p className="font-medium text-success-fg">{formatMAD(commissionSnap)}</p></div>
                <div><p className="text-xs text-faint">{t('confirmationFee')}</p><p className="font-medium">{formatMAD(order.confirmation_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-faint">{t('packagingFee')}</p><p className="font-medium">{formatMAD(order.packaging_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-faint">{t('deliveryFee')}</p><p className="font-medium">{formatMAD(order.delivery_fee_snapshot ?? 0)}</p></div>
                <div><p className="text-xs text-faint">{t('currentCatalogPrice')}</p><p className="text-muted line-through">{formatMAD(order.product.sell_price)}</p></div>
              </div>
            </div>

            {(order.fraud_score != null || order.duplicate_risk_score != null) && (
              <div className="bg-surface rounded-xl border border-line p-5 space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t('riskScores')}</h2>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-xs text-faint">{t('fraud')}</p><p className="font-medium">{order.fraud_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-faint">{t('duplicate')}</p><p className="font-medium">{order.duplicate_risk_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-faint">{t('spam')}</p><p className="font-medium">{order.spam_score ?? '—'}/100</p></div>
                </div>
              </div>
            )}

            {(order.delivery_company || order.tracking_number) && (
              <div className="bg-surface rounded-xl border border-line p-5 space-y-2">
                <h2 className="text-sm font-semibold text-foreground">{t('delivery')}</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {order.delivery_company && <div><p className="text-xs text-faint">{to('carrier')}</p><p className="font-medium">{order.delivery_company}</p></div>}
                  {order.tracking_number && <div><p className="text-xs text-faint">{t('trackingNumberShort')}</p><p className="font-mono text-sm">{order.tracking_number}</p></div>}
                  {order.return_reason && <div className="col-span-2"><p className="text-xs text-faint">{t('returnReason')}</p><p className="text-danger-fg">{order.return_reason}</p></div>}
                </div>
              </div>
            )}

            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('tracking')}</h2>
              <OrderTimeline steps={timeline} />
              <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 text-xs">
                <div><p className="text-faint">{t('codExpected')}</p><p className="font-medium">{order.cod_expected ? formatMAD(order.cod_expected) : '—'}</p></div>
                <div><p className="text-faint">{t('codReceived')}</p>
                  <p className={`font-medium ${order.cod_received != null && order.cod_expected != null && order.cod_received < order.cod_expected ? 'text-danger-fg' : ''}`}>
                    {order.cod_received != null ? formatMAD(order.cod_received) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {order.affiliate && (
              <div className="bg-surface rounded-xl border border-line p-5 space-y-3">
                <h2 className="text-sm font-semibold text-foreground">{t('affiliateSource')}</h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-faint">{tc('name')}</p><p className="font-medium">{order.affiliate.full_name}</p></div>
                  <div><p className="text-xs text-faint">{tc('phone')}</p><p className="font-medium">{order.affiliate.phone ?? '—'}</p></div>
                  <div><p className="text-xs text-faint">{t('commissionSnapshot')}</p><p className="font-medium text-success-fg">{formatMAD(commissionSnap)}</p></div>
                  <div><p className="text-xs text-faint">{t('attributedClick')}</p><p className="font-mono text-xs">{order.attribution_click_id?.slice(0, 8) ?? '—'}</p></div>
                </div>
                {commission && (
                  <div className="pt-3 border-t border-line">
                    <h3 className="text-xs font-semibold text-muted mb-2">{t('commissionValidation')}</h3>
                    <CommissionStatusForm commission={commission} />
                  </div>
                )}
              </div>
            )}

            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t('proofs')}</h2>
              <OrderProofForm orderId={order.id} existingProofs={proofs} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">{t('updateStatus')}</h2>
              <OrderStatusForm orderId={order.id} currentStatus={order.status} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
