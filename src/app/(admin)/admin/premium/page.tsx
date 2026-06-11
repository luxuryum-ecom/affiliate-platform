import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import {
  getPremiumPlans,
  getAllSuppliersForAdmin,
} from '@/app/actions/premium'
import { AssignPlanForm, CancelSubscriptionButton } from './PremiumAssignClient'
import { DashboardHeader } from '@/components/shared/dashboard-header'
import { getTranslations, getLocale } from 'next-intl/server'
import type { PremiumPlan } from '@/types/database'

export async function generateMetadata() {
  const t = await getTranslations('admin.premium')
  return { title: t('metaTitle') }
}

// CSS-only — plan accent OR, pas d'indigo/violet
const PLAN_CLS: Record<string, string> = {
  free:         'bg-surface-2 text-muted border border-line',
  professional: 'bg-gold-50 text-gold-700 border border-gold-200',
  enterprise:   'bg-warning-soft text-warning-fg border border-warning',
}

// Plan card borders
const PLAN_CARD_CLS: Record<string, string> = {
  free:         'border-line',
  professional: 'border-gold-300 ring-1 ring-gold-200',
  enterprise:   'border-warning ring-1 ring-warning/40',
}

// CSS-only — subscription status
const STATUS_CLS: Record<string, string> = {
  active:    'bg-success-soft text-success-fg border border-success',
  trial:     'bg-surface-2 text-muted border border-line',
  expired:   'bg-danger-soft text-danger-fg border border-danger',
  cancelled: 'bg-surface-2 text-faint border border-line',
}

export default async function AdminPremiumPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t  = await getTranslations('admin.premium')
  const tc = await getTranslations('admin.common')
  const locale = await getLocale()

  const { data: adminProfile } = (await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()) as { data: { full_name: string } | null; error: unknown }

  const [plans, suppliers] = await Promise.all([
    getPremiumPlans(),
    getAllSuppliersForAdmin(),
  ])

  // Revenue KPIs — ARGENT: calculs inchangés
  const now = new Date()
  const activeSubs = suppliers.filter((s) => {
    const sub = s.subscription
    if (!sub || sub.plan.price_mad_monthly === 0) return false
    if (sub.expires_at && new Date(sub.expires_at) < now) return false
    return true
  })
  const expiredByDate = suppliers.filter((s) => {
    const sub = s.subscription
    return sub && sub.plan.price_mad_monthly > 0 && sub.expires_at && new Date(sub.expires_at) < now
  })
  const mrr = activeSubs.reduce(
    (sum, s) => sum + (s.subscription?.plan.price_mad_monthly ?? 0),
    0,
  )
  const paidCount  = activeSubs.length
  const trialCount = suppliers.filter((s) => s.subscription?.status === 'trial').length
  const freeCount  = suppliers.filter((s) => !s.subscription).length

  function statusLabel(status: string) {
    if (status === 'active')    return t('statusActive')
    if (status === 'trial')     return t('statusTrial')
    if (status === 'expired')   return t('statusExpired')
    if (status === 'cancelled') return t('statusCancelled')
    return status
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('pageTitle')}
        backHref="/admin/dashboard"
        backLabel={t('backLabel')}
        userName={adminProfile?.full_name}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-6xl"
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5">
            {/* ARGENT: formatMAD inchangé */}
            <p className="text-2xl font-bold text-gold-600 tabular-nums">{formatMAD(mrr)}</p>
            <p className="text-xs text-muted mt-1">{t('kpiMrrLabel')}</p>
            <p className="text-xs text-faint mt-0.5">{t('kpiMrrSub', { count: paidCount })}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-2xl font-bold text-success-fg">{paidCount}</p>
            <p className="text-xs text-muted mt-1">{t('kpiPaidLabel')}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-2xl font-bold text-foreground">{trialCount}</p>
            <p className="text-xs text-muted mt-1">{t('kpiTrialLabel')}</p>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <p className="text-2xl font-bold text-faint">{freeCount}</p>
            <p className="text-xs text-muted mt-1">{t('kpiFreeLabel')}</p>
          </div>
        </div>

        {/* MRR breakdown */}
        {(activeSubs.length > 0 || expiredByDate.length > 0) && (
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">{t('mrrDetailTitle')}</h2>
            <div className="bg-surface rounded-xl border border-line overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 border-b border-line">
                  <tr className="text-left text-muted">
                    <th className="px-4 py-2.5 font-medium">{t('mrrColSupplier')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('mrrColPlan')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('mrrColPrice')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('mrrColExpires')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('mrrColMrr')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {activeSubs.map(({ supplier, subscription: sub }) => (
                    <tr key={supplier.id} className="text-foreground">
                      <td className="px-4 py-2.5 font-medium">{supplier.full_name}</td>
                      <td className="px-4 py-2.5">{sub!.plan.name}</td>
                      {/* ARGENT: formatMAD inchangé */}
                      <td className="px-4 py-2.5 tabular-nums">{formatMAD(sub!.plan.price_mad_monthly)}</td>
                      <td className="px-4 py-2.5">
                        {sub!.expires_at
                          ? new Date(sub!.expires_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
                          : <span className="text-faint">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-success-fg font-medium">{t('mrrIncluded')}</span>
                      </td>
                    </tr>
                  ))}
                  {expiredByDate.map(({ supplier, subscription: sub }) => (
                    <tr key={supplier.id} className="text-faint bg-danger-soft/30">
                      <td className="px-4 py-2.5">{supplier.full_name}</td>
                      <td className="px-4 py-2.5">{sub!.plan.name}</td>
                      {/* ARGENT: formatMAD inchangé */}
                      <td className="px-4 py-2.5 tabular-nums line-through">{formatMAD(sub!.plan.price_mad_monthly)}</td>
                      <td className="px-4 py-2.5 text-danger-fg">
                        {new Date(sub!.expires_at!).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-danger-fg font-medium">{t('mrrExpired')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Plans overview */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('plansTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} planCardCls={PLAN_CARD_CLS} t={t} />
            ))}
          </div>
        </section>

        {/* Supplier list */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {t('suppliersTitle', { count: suppliers.length })}
          </h2>

          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {suppliers.length === 0 && (
              <p className="p-6 text-sm text-faint text-center">{t('suppliersEmpty')}</p>
            )}
            {suppliers.map(({ supplier, subscription }) => {
              const planSlug = subscription?.plan.slug ?? 'free'
              const planName = subscription?.plan.name ?? t('planFree')
              const status   = subscription?.status ?? 'active'
              const subStatusCls = STATUS_CLS[status] ?? STATUS_CLS.cancelled

              return (
                <details key={supplier.id} className="group">
                  <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none hover:bg-surface-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{supplier.full_name}</p>
                        <p className="text-xs text-muted">{supplier.phone} · {supplier.city ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${PLAN_CLS[planSlug] ?? PLAN_CLS.free}`}>
                        {planName}
                      </span>
                      {subscription && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${subStatusCls}`}>
                          {statusLabel(status)}
                        </span>
                      )}
                      <span className="text-faint group-open:rotate-180 transition-transform text-xs">▼</span>
                    </div>
                  </summary>

                  <div className="px-5 pb-5 border-t border-line pt-4 space-y-4">
                    {/* Subscription details — visuel seulement, logique inchangée */}
                    {subscription && (
                      <div className="text-xs text-muted space-y-1">
                        <p>{t('subSince', { date: new Date(subscription.started_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) })}</p>
                        {subscription.expires_at && (
                          <p>{t('subExpires', { date: new Date(subscription.expires_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) })}</p>
                        )}
                        {subscription.notes && (
                          <p>{t('subNotes', { notes: subscription.notes })}</p>
                        )}
                      </div>
                    )}

                    {/* Assign form — name= / server action inchangés */}
                    <div className="max-w-sm space-y-3">
                      <AssignPlanForm
                        supplierId={supplier.id}
                        plans={plans}
                        currentPlanSlug={planSlug}
                      />
                      {subscription && planSlug !== 'free' && (
                        <CancelSubscriptionButton supplierId={supplier.id} />
                      )}
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  planCardCls,
  t,
}: {
  plan: PremiumPlan
  planCardCls: Record<string, string>
  t: Awaited<ReturnType<typeof getTranslations<'admin.premium'>>>
}) {
  return (
    <div className={`bg-surface rounded-xl border p-5 space-y-3 ${planCardCls[plan.slug] ?? 'border-line'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-foreground text-sm">{plan.name}</p>
          <p className="text-lg font-bold text-foreground mt-0.5">
            {plan.price_mad_monthly === 0
              ? t('planFree')
              : t('planPricePerMonth', { price: plan.price_mad_monthly.toLocaleString('fr-FR') })}
          </p>
        </div>
        {plan.verified_badge && (
          <span className="text-xs bg-gold-50 text-gold-700 border border-gold-200 px-2 py-0.5 rounded-full">
            {t('planBadgeVerified')}
          </span>
        )}
        {!plan.verified_badge && plan.featured_badge && (
          <span className="text-xs bg-warning-soft text-warning-fg border border-warning px-2 py-0.5 rounded-full">
            {t('planBadgeFeatured')}
          </span>
        )}
      </div>

      <p className="text-xs text-muted">{plan.description}</p>

      <ul className="text-xs text-muted space-y-1">
        <li>
          {plan.max_products === 0
            ? t('planProductsUnlimited')
            : t('planProductsMax', { max: plan.max_products })}
        </li>
        {plan.rfq_priority_boost > 0 && (
          <li>{t('planRfqBoost', { boost: plan.rfq_priority_boost })}</li>
        )}
        {plan.featured_badge && <li>{t('planFeatureFeaturedBadge')}</li>}
        {plan.verified_badge && <li>{t('planFeatureVerifiedBadge')}</li>}
        {plan.full_analytics && <li>{t('planFeatureAnalytics')}</li>}
        {plan.priority_support && <li>{t('planFeatureSupport')}</li>}
      </ul>
    </div>
  )
}
