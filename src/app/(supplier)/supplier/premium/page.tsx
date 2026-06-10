import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPremiumPlans, getMySubscription, getProductLimitStatus } from '@/app/actions/premium'

export const metadata = { title: 'Mon abonnement — Espace Fournisseur' }

const PLAN_STYLE: Record<string, { ring: string; badge: string; badgeTxt: string }> = {
  free:         { ring: 'border-gray-200',   badge: 'bg-gray-100',   badgeTxt: 'text-gray-500' },
  professional: { ring: 'border-indigo-300 ring-1 ring-indigo-200', badge: 'bg-indigo-100', badgeTxt: 'text-indigo-700' },
  enterprise:   { ring: 'border-amber-300  ring-1 ring-amber-200',  badge: 'bg-amber-100',  badgeTxt: 'text-amber-700' },
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

  const currentPlanSlug = subscription?.plan.slug ?? 'free'
  const currentPlan     = plans.find((p) => p.slug === currentPlanSlug)

  // WhatsApp contact number for upgrade requests
  const waNumber = '212600000000'
  const waMsg    = (planName: string) =>
    encodeURIComponent(`Bonjour, je souhaite passer au plan ${planName} sur Mozouna Marketplace.`)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/supplier/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</a>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-gray-900 text-sm">Mon abonnement</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Current plan card */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Plan actuel</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{currentPlan?.name ?? 'Gratuit'}</p>
              {subscription?.expires_at && (
                <p className="text-xs text-amber-600 mt-0.5">
                  Expire le {new Date(subscription.expires_at).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
            {currentPlan?.verified_badge && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">Vérifié</span>
            )}
            {!currentPlan?.verified_badge && currentPlan?.featured_badge && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium">Vedette</span>
            )}
          </div>

          {/* Product limit bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>Produits soumis</span>
              <span className="font-medium">
                {limitStatus.currentCount} / {limitStatus.isUnlimited ? '∞' : limitStatus.maxAllowed}
              </span>
            </div>
            {!limitStatus.isUnlimited && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    limitStatus.isAtLimit ? 'bg-red-500' : 'bg-indigo-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (limitStatus.currentCount / limitStatus.maxAllowed) * 100)}%`,
                  }}
                />
              </div>
            )}
            {limitStatus.isAtLimit && (
              <p className="text-xs text-red-600">
                Limite atteinte. Passez à un plan supérieur pour soumettre plus de produits.
              </p>
            )}
          </div>

          {/* Features list */}
          {currentPlan && (
            <ul className="text-sm text-gray-600 space-y-1.5 pt-2 border-t border-gray-100">
              <FeatureRow
                enabled
                label={limitStatus.isUnlimited ? 'Produits illimités' : `Jusqu'à ${limitStatus.maxAllowed} produits`}
              />
              <FeatureRow enabled={currentPlan.rfq_priority_boost > 0} label={`Boost RFQ +${currentPlan.rfq_priority_boost} pts`} />
              <FeatureRow enabled={currentPlan.featured_badge} label="Badge Vedette dans la marketplace" />
              <FeatureRow enabled={currentPlan.verified_badge} label="Badge Vérifié" />
              <FeatureRow enabled={currentPlan.full_analytics} label="Analytiques complètes" />
              <FeatureRow enabled={currentPlan.priority_support} label="Support prioritaire" />
            </ul>
          )}
        </section>

        {/* Plans comparison */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Comparer les plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.slug === currentPlanSlug
              const style     = PLAN_STYLE[plan.slug] ?? PLAN_STYLE.free
              const isUpgrade = plan.display_order > (currentPlan?.display_order ?? 0)

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-xl border p-5 space-y-4 ${style.ring} ${isCurrent ? 'opacity-75' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{plan.name}</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {plan.price_mad_monthly === 0
                          ? 'Gratuit'
                          : `${plan.price_mad_monthly.toLocaleString('fr-FR')} MAD/mois`}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge} ${style.badgeTxt}`}>
                        Actuel
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500">{plan.description}</p>

                  <ul className="text-xs text-gray-600 space-y-1.5">
                    <li className="flex items-center gap-1.5">
                      <span className="text-green-500">✓</span>
                      {plan.max_products === 0 ? 'Produits illimités' : `Jusqu'à ${plan.max_products} produits`}
                    </li>
                    <FeatureItem enabled={plan.rfq_priority_boost > 0} label={`Boost RFQ +${plan.rfq_priority_boost} pts`} />
                    <FeatureItem enabled={plan.featured_badge} label="Badge Vedette" />
                    <FeatureItem enabled={plan.verified_badge} label="Badge Vérifié" />
                    <FeatureItem enabled={plan.full_analytics} label="Analytiques complètes" />
                    <FeatureItem enabled={plan.priority_support} label="Support prioritaire" />
                  </ul>

                  {isUpgrade && (
                    <a
                      href={`https://wa.me/${waNumber}?text=${waMsg(plan.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block w-full text-center text-sm font-medium py-2 rounded-lg transition-colors ${
                        plan.slug === 'enterprise'
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      Passer à {plan.name}
                    </a>
                  )}

                  {isCurrent && plan.slug !== 'free' && (
                    <p className="text-xs text-gray-400 text-center">
                      Contactez le support pour modifier votre abonnement.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Questions fréquentes</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-gray-900">Comment fonctionne la facturation ?</dt>
              <dd className="text-gray-500 mt-1">
                La facturation est mensuelle et gérée manuellement par notre équipe. Vous serez contacté par WhatsApp pour confirmer le paiement.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Qu&apos;est-ce que le boost RFQ ?</dt>
              <dd className="text-gray-500 mt-1">
                Lorsqu&apos;un grossiste envoie une demande d&apos;achat (RFQ), notre moteur vous attribue un score de correspondance. Les plans payants augmentent automatiquement votre score, améliorant votre position dans la liste des fournisseurs matchés.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Le badge Vedette est-il visible par les grossistes ?</dt>
              <dd className="text-gray-500 mt-1">
                Oui. Vos produits affichent un badge dans la marketplace, et les fournisseurs Vedette apparaissent en tête de liste.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Puis-je annuler à tout moment ?</dt>
              <dd className="text-gray-500 mt-1">
                Oui. Contactez notre équipe et nous résilierons votre abonnement sans frais supplémentaires.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  )
}

function FeatureRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${enabled ? 'text-gray-700' : 'text-gray-300 line-through'}`}>
      <span className={enabled ? 'text-green-500' : 'text-gray-300'}>
        {enabled ? '✓' : '✗'}
      </span>
      {label}
    </li>
  )
}

function FeatureItem({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${enabled ? 'text-gray-700' : 'text-gray-300'}`}>
      <span className={enabled ? 'text-green-500' : 'text-gray-200'}>{enabled ? '✓' : '✗'}</span>
      {label}
    </li>
  )
}
