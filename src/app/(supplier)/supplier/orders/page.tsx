import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { MozounaLogo } from '@/components/shared/branding'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { WholesaleOrderRespondForm } from '@/components/supplier/wholesale-order-respond-form'
import type { Profile, SupplierResponse } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('supplierOrders')
  return { title: t('metaTitle') }
}

// Colonnes exposées par wholesale_orders_supplier_read (vue redacted 059)
type SupplierOrderRow = {
  id: string
  status: string
  city: string | null
  due_at: string | null
  supplier_response: SupplierResponse | null
  supplier_lead_time_days: number | null
  supplier_responded_at: string | null
  supplier_assigned_at: string | null
  created_at: string
  updated_at: string
}

// Colonnes exposées par wholesale_order_items_supplier_read (vue redacted 059)
type SupplierOrderItemRow = {
  id: string
  order_id: string
  product_id: string
  quantity: number
  tier_label_snapshot: string | null
}

type ProductNameRow = {
  id: string
  name: string
}

export default async function SupplierOrdersPage() {
  const supabase = await createClient()
  const t = await getTranslations('supplierOrders')
  const tc = await getTranslations('common')
  const locale = await getLocale()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()) as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  // Lecture via la VUE redacted UNIQUEMENT — jamais wholesale_orders en direct
  const { data: orders } = (await supabase
    .from('wholesale_orders_supplier_read')
    .select(
      'id, status, city, due_at, supplier_response, supplier_lead_time_days, supplier_responded_at, supplier_assigned_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })) as {
    data: SupplierOrderRow[] | null
    error: unknown
  }

  const safeOrders = orders ?? []

  // Lecture des articles via la VUE redacted UNIQUEMENT
  let items: SupplierOrderItemRow[] = []
  if (safeOrders.length > 0) {
    const orderIds = safeOrders.map((o) => o.id)
    const { data: itemsData } = (await supabase
      .from('wholesale_order_items_supplier_read')
      .select('id, order_id, product_id, quantity, tier_label_snapshot')
      .in('order_id', orderIds)) as { data: SupplierOrderItemRow[] | null; error: unknown }
    items = itemsData ?? []
  }

  // Récupération des noms de produits (products est lisible par authenticated)
  const productIds = [...new Set(items.map((i) => i.product_id))]
  const productNames: Map<string, string> = new Map()
  if (productIds.length > 0) {
    const { data: productsData } = (await supabase
      .from('products_catalog_read') // dette 073 — vue redacted (id/nom seuls)
      .select('id, name')
      .in('id', productIds)) as { data: ProductNameRow[] | null; error: unknown }
    for (const p of productsData ?? []) {
      productNames.set(p.id, p.name)
    }
  }

  // Groupe les articles par commande
  const itemsByOrder = new Map<string, SupplierOrderItemRow[]>()
  for (const item of items) {
    const existing = itemsByOrder.get(item.order_id) ?? []
    existing.push(item)
    itemsByOrder.set(item.order_id, existing)
  }

  // Résoudre les libellés de statut côté serveur (strings pré-résolues — RÈGLE ABSOLUE 2)
  const statusLabel = (status: string): string => {
    const key = `status.${status}` as Parameters<typeof t>[0]
    try {
      return t(key)
    } catch {
      return status
    }
  }

  // Labels du formulaire pré-résolus côté serveur (strings sérialisables uniquement)
  const formLabels = {
    available: t('responseAvailable'),
    preparing: t('responsePreparing'),
    onOrder: t('responseOnOrder'),
    responseLabel: t('responseLabel'),
    leadTimeLabel: t('leadTimeLabel'),
    submit: t('submit'),
    submitting: t('submitting'),
    success: t('submitSuccess'),
  }

  const isRtl = locale === 'ar'

  return (
    <div className="min-h-screen bg-bg" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="bg-surface border-b border-line">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-line">|</span>
            <span className="hidden sm:block text-sm font-medium text-muted">
              {t('spaceLabel')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <span className="text-sm text-muted hidden sm:block">{profile?.full_name}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('pageSubtitle')}</p>
        </div>

        {safeOrders.length === 0 ? (
          <div className="bg-surface rounded-xl border border-line p-10 text-center">
            <p className="text-sm text-muted">{t('emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {safeOrders.map((order) => {
              const orderItems = itemsByOrder.get(order.id) ?? []
              const resolvedStatus = statusLabel(order.status)

              return (
                <div
                  key={order.id}
                  className="bg-surface rounded-xl border border-line overflow-hidden"
                >
                  {/* En-tête commande */}
                  <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted">
                        {t('colOrderId')}
                      </p>
                      <p className="font-mono text-sm text-foreground select-all">
                        {order.id}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                      {/* Statut */}
                      <div className="bg-surface-2 rounded-lg px-3 py-1.5 text-center">
                        <p className="text-xs text-muted mb-0.5">{t('colStatus')}</p>
                        <p className="font-medium text-foreground text-xs">{resolvedStatus}</p>
                      </div>

                      {/* Ville */}
                      {order.city && (
                        <div className="bg-surface-2 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-xs text-muted mb-0.5">{t('colCity')}</p>
                          <p className="font-medium text-foreground text-xs">{order.city}</p>
                        </div>
                      )}

                      {/* Délai actuel */}
                      {order.supplier_lead_time_days != null && (
                        <div className="bg-surface-2 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-xs text-muted mb-0.5">{t('colLeadTime')}</p>
                          <p className="font-medium text-foreground text-xs">
                            {t('leadTimeDays', { count: order.supplier_lead_time_days })}
                          </p>
                        </div>
                      )}

                      {/* Date création */}
                      <div className="bg-surface-2 rounded-lg px-3 py-1.5 text-center">
                        <p className="text-xs text-muted mb-0.5">{t('colCreatedAt')}</p>
                        <p className="font-medium text-foreground text-xs tabular-nums">
                          {new Date(order.created_at).toLocaleDateString(locale)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Articles */}
                  {orderItems.length > 0 && (
                    <div className="px-5 py-3 border-b border-line">
                      <p className="text-xs font-medium text-muted mb-2">{t('colItems')}</p>
                      <div className="space-y-1.5">
                        {orderItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs bg-surface-2 rounded-lg px-3 py-2"
                          >
                            <span className="text-foreground font-medium">
                              {productNames.get(item.product_id) ?? item.product_id}
                            </span>
                            <div className="flex items-center gap-2 text-muted shrink-0">
                              {item.tier_label_snapshot && (
                                <>
                                  <span>{item.tier_label_snapshot}</span>
                                  <span className="text-line">·</span>
                                </>
                              )}
                              <span className="tabular-nums">
                                {t('itemQty', { count: item.quantity })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Formulaire de réponse fournisseur */}
                  <div className="px-5 py-4">
                    <WholesaleOrderRespondForm
                      orderId={order.id}
                      currentResponse={order.supplier_response}
                      currentLeadTime={order.supplier_lead_time_days}
                      labels={formLabels}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
