import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { requireCapability } from '@/app/actions/_guards'
import { createClient } from '@/lib/supabase/server'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { AdjustStockForm } from '@/components/admin/adjust-stock-form'
import { StockFilters } from '@/components/admin/stock-filters'

export async function generateMetadata() {
  const t = await getTranslations('admin.stock')
  return { title: t('metaTitle') }
}

// ── Helpers pour résoudre les libellés i18n sans erreur TS ───────────────────

type StockT = Awaited<ReturnType<typeof getTranslations<'admin.stock'>>>

function tReason(t: StockT, key: string): string {
  const keys: Record<string, string> = {
    vente_affilie: t('reason.vente_affilie'),
    vente_gros: t('reason.vente_gros'),
    vente_ecom: t('reason.vente_ecom'),
    cadeau: t('reason.cadeau'),
    casse: t('reason.casse'),
    echantillon: t('reason.echantillon'),
    perte: t('reason.perte'),
    retour: t('reason.retour'),
    reappro: t('reason.reappro'),
  }
  return keys[key] ?? key
}

function tChannel(t: StockT, key: string): string {
  const keys: Record<string, string> = {
    affiliate: t('channel.affiliate'),
    wholesale: t('channel.wholesale'),
    ecom_perso: t('channel.ecom_perso'),
    manual_adjust: t('channel.manual_adjust'),
    return: t('channel.return'),
    system: t('channel.system'),
  }
  return keys[key] ?? key
}

function tAnomaly(t: StockT, key: string): string {
  const keys: Record<string, string> = {
    oversell: t('anomaly.oversell'),
    abnormal_loss: t('anomaly.abnormal_loss'),
    repeated_adjust: t('anomaly.repeated_adjust'),
  }
  return keys[key] ?? key
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const locale = await getLocale()
  const t = await getTranslations('admin.stock')
  const tc = await getTranslations('admin.common')

  // Guard
  const guard = await requireCapability('manage_stock')
  if (!guard.userId) redirect('/admin')

  // Fetch
  const supabase = await createClient()

  // Mouvements (100 derniers)
  let movementsQuery = supabase
    .from('stock_movements')
    .select(
      'id, product_id, channel, qty_delta, reason, balance_after, actor_id, note, created_at, product:products(name)',
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (sp.productId) movementsQuery = movementsQuery.eq('product_id', sp.productId)
  if (sp.reason) movementsQuery = movementsQuery.eq('reason', sp.reason)
  const { data: movementsRaw } = await movementsQuery

  // Anomalies (50 dernières)
  const { data: anomaliesRaw } = await supabase
    .from('stock_anomalies')
    .select(
      'id, anomaly_type, product_id, actor_id, channel, qty, stock_before, shortfall, detail, created_at, product:products(name)',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  // Produits (pour les menus)
  const { data: productsRaw } = await supabase
    .from('products')
    .select('id, name')
    .order('name')
    .limit(500)

  // Actor names — collecte les actor_id non-null
  const actorIds = [
    ...new Set([
      ...(movementsRaw ?? []).map((m) => m.actor_id).filter(Boolean),
      ...(anomaliesRaw ?? []).map((a) => a.actor_id).filter(Boolean),
    ]),
  ] as string[]

  const actorMap = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)
    for (const p of profiles ?? []) {
      if (p.full_name) actorMap.set(p.id, p.full_name)
    }
  }

  const systemActor = t('systemActor')

  const movements = (movementsRaw ?? []).map((m) => ({
    id: m.id as string,
    product_id: m.product_id as string,
    channel: m.channel as string,
    qty_delta: m.qty_delta as number,
    reason: m.reason as string,
    balance_after: m.balance_after as number,
    actor_id: m.actor_id as string | null,
    note: m.note as string | null,
    created_at: m.created_at as string,
    actorName:
      m.actor_id
        ? (actorMap.get(m.actor_id as string) ?? (m.actor_id as string))
        : systemActor,
    reasonLabel: tReason(t, m.reason as string),
    channelLabel: tChannel(t, m.channel as string),
    dateStr: new Date(m.created_at as string).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    productName: (m.product as unknown as { name: string } | null)?.name ?? '—',
  }))

  const anomalies = (anomaliesRaw ?? []).map((a) => ({
    id: a.id as string,
    anomaly_type: a.anomaly_type as string,
    product_id: a.product_id as string | null,
    actor_id: a.actor_id as string | null,
    qty: a.qty as number | null,
    stock_before: a.stock_before as number | null,
    shortfall: a.shortfall as number | null,
    actorName:
      a.actor_id
        ? (actorMap.get(a.actor_id as string) ?? (a.actor_id as string))
        : systemActor,
    anomalyLabel: tAnomaly(t, a.anomaly_type as string),
    dateStr: new Date(a.created_at as string).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    productName: (a.product as unknown as { name: string } | null)?.name ?? null,
  }))

  const products = (productsRaw ?? []) as { id: string; name: string }[]
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

        {/* Section ajustement */}
        <section className="space-y-3">
          <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
            {t('adjustTitle')}
          </h2>
          <AdjustStockForm products={products} />
        </section>

        {/* Section anomalies */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
              {t('anomaliesTitle')}
            </h2>
            <p className="mt-1 text-xs text-muted">{t('anomaliesSubtitle')}</p>
          </div>
          {anomalies.length === 0 ? (
            <p className="text-sm text-faint italic">{t('anomaliesEmpty')}</p>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {anomalies.map((a) => (
                <div key={a.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex items-center text-xs px-2 py-0.5 rounded font-medium ${
                      a.anomaly_type === 'repeated_adjust'
                        ? 'bg-warning-soft text-warning-fg'
                        : 'bg-danger-soft text-danger-fg'
                    }`}
                  >
                    {a.anomalyLabel}
                  </span>
                  <span className="text-sm text-foreground font-medium">
                    {a.productName ?? t('globalAnomaly')}
                  </span>
                  <span className="text-xs text-muted">
                    {t('anomalyQty')} {a.qty ?? '—'}
                    {a.stock_before != null && ` · ${t('anomalyStockBefore')} ${a.stock_before}`}
                    {a.shortfall != null && ` · ${t('anomalyShortfall')} ${a.shortfall}`}
                  </span>
                  <span className="text-xs text-muted ms-auto">
                    {t('by')} {a.actorName} · {a.dateStr}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section journal */}
        <section className="space-y-3">
          <h2 className="text-base font-medium text-foreground border-b border-line pb-2">
            {t('journalTitle')}
          </h2>
          <StockFilters products={products} />
          {movements.length === 0 ? (
            <p className="text-sm text-faint italic">{t('journalEmpty')}</p>
          ) : (
            <div className="bg-surface rounded-xl border border-line divide-y divide-line">
              {movements.map((m) => (
                <div
                  key={m.id}
                  className="px-4 py-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.productName}</span>
                    <span
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded ${
                        m.reason.startsWith('vente_')
                          ? 'bg-accent-soft text-accent-fg'
                          : 'bg-surface border border-line text-muted'
                      }`}
                    >
                      {m.reasonLabel}
                    </span>
                    <span className="text-xs text-muted">{m.channelLabel}</span>
                  </div>
                  <div className="text-end">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        m.qty_delta > 0 ? 'text-success-fg' : 'text-danger-fg'
                      }`}
                    >
                      {m.qty_delta > 0 ? '+' : ''}
                      {m.qty_delta}
                    </span>
                    <span className="ms-2 text-xs text-muted">
                      {t('colBalance')} {m.balance_after}
                    </span>
                  </div>
                  <div className="text-xs text-muted col-span-2">
                    {t('by')} {m.actorName} · {m.dateStr}
                    {m.note && <span className="ms-2 italic">— {m.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
