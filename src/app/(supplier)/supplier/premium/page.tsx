import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getPremiumPlans, getMySubscription, getProductLimitStatus } from '@/app/actions/premium'
import { DashboardHeader } from '@/components/shared/dashboard-header'

export async function generateMetadata() {
  const t = await getTranslations('supplier.premium')
  return { title: t('metaTitle') }
}

const PLAN_STYLE: Record<string, { ring: string; badge: string; badgeTxt: string }> = {
  free:         { ring: 'border-line',                              badge: 'bg-surface-2',    badgeTxt: 'text-muted' },
  professional: { ring: 'border-gold-300 ring-1 ring-gold-200',    badge: 'bg-accent-soft',  badgeTxt: 'text-accent-fg' },
  enterprise:   { ring: 'border-gold-300 ring-1 ring-gold-200',    badge: 'bg-accent-soft',  badgeTxt: 'text-accent-fg' },
}

export default async function SupplierPremiumPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [plans, subscription, limitStatus] = await Promise.all([
    getPremiumPlans(),
    getMySubscription(),
    getProductLimitStatus(user.id),
  ])

  const t = await getTranslations('supplier.premium')
  const tc = await getTranslations('supplier.common')
  const locale = await getLocale()

  const currentPlanSlug = subscription?.plan.slug ?? 'free'
  const currentPlan     = plans.find((p) => p.slug === currentPlanSlug)

  // WhatsApp contact number for upgrade requests
  const waNumber = '212600000000'
  const waMsg    = (planName: string) =>
    encodeURIComponent(t('waMessage', { plan: planName }))

  return (
    <div className="min-h-screen bg-bg">
      <DashboardHeader
        breadcrumb={t('breadcrumb')}
        backHref="/supplier/dashboard"
        backLabel={tc('dashboard')}
        signOutLabel={tc('signOut')}
        maxWidth="max-w-4xl"
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Current plan card */}
        <section className="bg-surface rounded-2xl border border-line p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted uppercase tracking-wide">{t('currentPlanLabel')}</p>
              <p className="text-xl font-bold text-foreground mt-1">{currentPlan?.name ?? t('currentPlanDefault')}</p>
              {subscription?.expires_at && (
                <p className="text-xs text-warning-fg mt-0.5">
                  {t('expiresOn', { date: new Date(subscription.expires_at).toLocaleDateString(locale) })}
                </p>
              )}
            </div>
            {currentPlan?.verified_badge && (
              <span className="text-xs bg-accent-soft text-accent-fg border border-gold-300 px-2.5 py-1 rounded-full font-medium">{t('badgeVerified')}</span>
            )}
            {!currentPlan?.verified_badge && currentPlan?.featured_badge && (
              <span className="text-xs bg-accent-soft text-accent-fg border border-gold-300 px-2.5 py-1 rounded-full font-medium">{t('badgeFeatured')}</span>
            )}
          </div>

          {/* Product limit bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{t('productsSubmitted')}</span>
              <span className="font-medium">
                {limitStatus.isUnlimited
                  ? t('productsUnlimited', { current: limitStatus.currentCount })
                  : t('productsCount', { current: limitStatus.currentCount, max: limitStatus.maxAllowed })}
              </span>
            </div>
            {!limitStatus.isUnlimited && (
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    limitStatus.isAtLimit ? 'bg-danger' : 'bg-primary'
                  }`}
                  style={{
                    width: `${Math.min(100, (limitStatus.currentCount / limitStatus.maxAllowed) * 100)}%`,
                  }}
                />
              </div>
            )}
            {limitStatus.isAtLimit && (
              <p className="text-xs text-danger-fg">{t('limitReachedNotice')}</p>
            )}
          </div>

          {/* Features list */}
          {currentPlan && (
            <ul className="text-sm text-muted space-y-1.5 pt-2 border-t border-line">
              <FeatureRow
                enabled
                label={limitStatus.isUnlimited
                  ? t('featureUnlimitedProducts')
                  : t('featureMaxProducts', { max: limitStatus.maxAllowed })}
              />
              <FeatureRow enabled={currentPlan.rfq_priority_boost > 0} label={t('featureRfqBoost', { pts: currentPlan.rfq_priority_boost })} />
              <FeatureRow enabled={currentPlan.featured_badge} label={t('featureFeaturedBadge')} />
              <FeatureRow enabled={currentPlan.verified_badge} label={t('featureVerifiedBadge')} />
              <FeatureRow enabled={currentPlan.full_analytics} label={t('featureFullAnalytics')} />
              <FeatureRow enabled={currentPlan.priority_support} label={t('featurePrioritySupport')} />
            </ul>
          )}
        </section>

        {/* Plans comparison */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4">{t('comparePlansTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.slug === currentPlanSlug
              const style     = PLAN_STYLE[plan.slug] ?? PLAN_STYLE.free
              const isUpgrade = plan.display_order > (currentPlan?.display_order ?? 0)

              return (
                <div
                  key={plan.id}
                  className={`bg-surface rounded-xl border p-5 space-y-4 ${style.ring} ${isCurrent ? 'opacity-75' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{plan.name}</p>
                      <p className="text-lg font-bold text-foreground mt-0.5">
                        {plan.price_mad_monthly === 0
                          ? t('planFree')
                          : t('planPrice', { price: plan.price_mad_monthly.toLocaleString(locale) })}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge} ${style.badgeTxt}`}>
                        {t('planCurrentBadge')}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted">{plan.description}</p>

                  <ul className="text-xs text-muted space-y-1.5">
                    <li className="flex items-center gap-1.5">
                      <span className="text-success-fg">✓</span>
                      {plan.max_products === 0
                        ? t('featureUnlimitedProducts')
                        : t('featureMaxProducts', { max: plan.max_products })}
                    </li>
                    <FeatureItem enabled={plan.rfq_priority_boost > 0} label={t('featureRfqBoost', { pts: plan.rfq_priority_boost })} />
                    <FeatureItem enabled={plan.featured_badge} label={t('badgeFeatured')} />
                    <FeatureItem enabled={plan.verified_badge} label={t('badgeVerified')} />
                    <FeatureItem enabled={plan.full_analytics} label={t('featureFullAnalytics')} />
                    <FeatureItem enabled={plan.priority_support} label={t('featurePrioritySupport')} />
                  </ul>

                  {isUpgrade && (
                    <a
                      href={`https://wa.me/${waNumber}?text=${waMsg(plan.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center text-sm font-medium py-2 rounded-lg transition-opacity bg-primary text-primary-foreground hover:opacity-90"
                    >
                      {t('ctaUpgrade', { name: plan.name })}
                    </a>
                  )}

                  {isCurrent && plan.slug !== 'free' && (
                    <p className="text-xs text-faint text-center">{t('ctaModifySub')}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-surface rounded-xl border border-line p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">{t('faqTitle')}</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">{t('faq1Q')}</dt>
              <dd className="text-muted mt-1">{t('faq1A')}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{t('faq2Q')}</dt>
              <dd className="text-muted mt-1">{t('faq2A')}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{t('faq3Q')}</dt>
              <dd className="text-muted mt-1">{t('faq3A')}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">{t('faq4Q')}</dt>
              <dd className="text-muted mt-1">{t('faq4A')}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  )
}

function FeatureRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${enabled ? 'text-muted' : 'text-faint line-through'}`}>
      <span className={enabled ? 'text-success-fg' : 'text-faint'}>
        {enabled ? '✓' : '✗'}
      </span>
      {label}
    </li>
  )
}

function FeatureItem({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${enabled ? 'text-muted' : 'text-faint'}`}>
      <span className={enabled ? 'text-success-fg' : 'text-faint'}>{enabled ? '✓' : '✗'}</span>
      {label}
    </li>
  )
}
