/**
 * Vue Superviseur — Confirmation des commandes.
 *
 * ACCÈS : requireCapability sur au moins une des capacités confirm_*.
 *   Admin : passe inconditionnellement, voit tous les volets.
 *   Non-admin : voit uniquement les volets pour lesquels la capacité est accordée.
 *
 * SÉCURITÉ :
 *   - Seules les commandes en `pending_confirmation` (COD/affilié) ou `pending`
 *     (gros) sont listées — pas de statut terminal, pas d'argent visible.
 *   - Aucun bouton `delivered`, `cod_received`, `shipped` dans cette vue.
 *   - Les actions appelées (confirmOrderAsSupervisor / confirmWholesaleAsSupervisor)
 *     ont leur propre whitelist côté serveur.
 *   - Pas de PII inutile : seuls nom client, ville, produit, réf, date affichés.
 */

import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireCapability } from '@/app/actions/_guards'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { SupervisorConfirmButton } from '@/components/admin/supervisor-confirm-button'
import type { OrderStatus, WholesaleOrderStatus } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.ordersConfirm')
  return { title: t('metaTitle') }
}

// ── Types locaux ──────────────────────────────────────────────────────────────

interface PendingCodOrder {
  id: string
  customer_name: string
  customer_city: string
  created_at: string
  status: OrderStatus
  affiliate_id: string | null
  product: { name: string } | null
}

interface PendingWholesaleOrder {
  id: string
  created_at: string
  status: WholesaleOrderStatus
  buyer: { full_name: string } | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrdersConfirmPage() {
  const locale = await getLocale()
  const [t, tc] = await Promise.all([
    getTranslations('admin.ordersConfirm'),
    getTranslations('admin.common'),
  ])

  // ── Vérifier au moins une capacité de confirmation ────────────────────────
  // On tente les trois capacités ; l'utilisateur doit en avoir au moins une.
  const [guardCod, guardAff, guardWs] = await Promise.all([
    requireCapability('confirm_cod_orders'),
    requireCapability('confirm_affiliate_orders'),
    requireCapability('confirm_wholesale_orders'),
  ])

  const hasCod       = guardCod.userId !== null
  const hasAffiliate = guardAff.userId !== null
  const hasWholesale = guardWs.userId !== null

  if (!hasCod && !hasAffiliate && !hasWholesale) {
    redirect('/admin')
  }

  // Supabase client (utilise guardCod ou guardAff ou guardWs selon disponibilité)
  const supabase = await createClient()

  // ── Fetch commandes COD (affiliate_id IS NULL) ────────────────────────────
  let codOrders: PendingCodOrder[] = []
  if (hasCod) {
    const { data } = (await supabase
      .from('orders')
      .select('id, customer_name, customer_city, created_at, status, affiliate_id, product:products(name)')
      .eq('status', 'pending_confirmation')
      .is('affiliate_id', null)
      .order('created_at', { ascending: true })
      .limit(100)) as { data: PendingCodOrder[] | null; error: unknown }
    codOrders = data ?? []
  }

  // ── Fetch commandes affiliées (affiliate_id IS NOT NULL) ──────────────────
  let affiliateOrders: PendingCodOrder[] = []
  if (hasAffiliate) {
    const { data } = (await supabase
      .from('orders')
      .select('id, customer_name, customer_city, created_at, status, affiliate_id, product:products(name)')
      .eq('status', 'pending_confirmation')
      .not('affiliate_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(100)) as { data: PendingCodOrder[] | null; error: unknown }
    affiliateOrders = data ?? []
  }

  // ── Fetch commandes grossistes en attente ─────────────────────────────────
  let wholesaleOrders: PendingWholesaleOrder[] = []
  if (hasWholesale) {
    const { data } = (await supabase
      .from('wholesale_orders')
      .select('id, created_at, status, buyer:profiles!buyer_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100)) as { data: PendingWholesaleOrder[] | null; error: unknown }
    wholesaleOrders = data ?? []
  }

  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={tc('dashboard')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-5xl"
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* En-tête */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>

        {/* Section COD */}
        {hasCod && (
          <section className="space-y-3">
            <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
              {t('sectionCod')}
            </h2>
            {codOrders.length === 0 ? (
              <p className="text-sm text-faint italic">{t('emptyCod')}</p>
            ) : (
              <OrderTable orders={codOrders} channel="cod" t={t} />
            )}
          </section>
        )}

        {/* Section Affiliés */}
        {hasAffiliate && (
          <section className="space-y-3">
            <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
              {t('sectionAffiliate')}
            </h2>
            {affiliateOrders.length === 0 ? (
              <p className="text-sm text-faint italic">{t('emptyAffiliate')}</p>
            ) : (
              <OrderTable orders={affiliateOrders} channel="affiliate" t={t} />
            )}
          </section>
        )}

        {/* Section Grossiste */}
        {hasWholesale && (
          <section className="space-y-3">
            <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
              {t('sectionWholesale')}
            </h2>
            {wholesaleOrders.length === 0 ? (
              <p className="text-sm text-faint italic">{t('emptyWholesale')}</p>
            ) : (
              <WholesaleTable orders={wholesaleOrders} t={t} />
            )}
          </section>
        )}
      </div>
    </div>
  )
}

// ── Sous-composant — tableau commandes COD/affilié ───────────────────────────
// Serveur uniquement : résout toutes les strings avant de descendre au bouton.

type TFn = Awaited<ReturnType<typeof getTranslations>>

function OrderTable({
  orders,
  channel,
  t,
}: {
  orders: PendingCodOrder[]
  channel: 'cod' | 'affiliate'
  t: TFn
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-muted text-xs">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('colRef')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colCustomer')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colProduct')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colCity')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colDate')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colStatus')}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-surface-2 transition-colors">
              <td className="px-3 py-2 font-mono text-xs text-faint">
                #{order.id.slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-foreground font-medium">
                {order.customer_name}
              </td>
              <td className="px-3 py-2 text-muted">
                {order.product?.name ?? '—'}
              </td>
              <td className="px-3 py-2 text-muted">{order.customer_city}</td>
              <td className="px-3 py-2 text-muted whitespace-nowrap">
                {new Date(order.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <span className="inline-block text-xs px-2 py-0.5 rounded border bg-warning-soft text-warning-fg border-warning">
                  {order.status}
                </span>
              </td>
              <td className="px-3 py-2">
                {/* Bouton CLIENT — ne connaît que l'id et le canal */}
                <SupervisorConfirmButton orderId={order.id} channel={channel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sous-composant — tableau commandes grossiste ─────────────────────────────

function WholesaleTable({
  orders,
  t,
}: {
  orders: PendingWholesaleOrder[]
  t: TFn
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-muted text-xs">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('colRef')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colCustomer')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colDate')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('colStatus')}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-surface-2 transition-colors">
              <td className="px-3 py-2 font-mono text-xs text-faint">
                #{order.id.slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-foreground font-medium">
                {order.buyer?.full_name ?? '—'}
              </td>
              <td className="px-3 py-2 text-muted whitespace-nowrap">
                {new Date(order.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <span className="inline-block text-xs px-2 py-0.5 rounded border bg-warning-soft text-warning-fg border-warning">
                  {order.status}
                </span>
              </td>
              <td className="px-3 py-2">
                <SupervisorConfirmButton orderId={order.id} channel="wholesale" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
