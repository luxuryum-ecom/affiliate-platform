import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMAD } from '@/lib/utils'
import {
  getPremiumPlans,
  getAllSuppliersForAdmin,
} from '@/app/actions/premium'
import { AssignPlanForm, CancelSubscriptionButton } from './PremiumAssignClient'
import type { PremiumPlan } from '@/types/database'

export const metadata = { title: 'Premium — Admin' }

const PLAN_COLORS: Record<string, string> = {
  free:         'bg-gray-100 text-gray-600',
  professional: 'bg-indigo-100 text-indigo-700',
  enterprise:   'bg-amber-100 text-amber-700',
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trial:     'bg-blue-100 text-blue-700',
  expired:   'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default async function AdminPremiumPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [plans, suppliers] = await Promise.all([
    getPremiumPlans(),
    getAllSuppliersForAdmin(),
  ])

  // Revenue KPIs
  const now = new Date()
  const activeSubs = suppliers.filter((s) => {
    const sub = s.subscription
    if (!sub || sub.plan.price_mad_monthly === 0) return false
    // Exclude if expires_at is in the past (status may still be 'active' in DB)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Admin</a>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Monétisation Premium</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-indigo-700 tabular-nums">{formatMAD(mrr)}</p>
            <p className="text-xs text-gray-500 mt-1">MRR estimé</p>
            <p className="text-xs text-gray-400 mt-0.5">{paidCount} abonné{paidCount !== 1 ? 's' : ''} actif{paidCount !== 1 ? 's' : ''} non expirés</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
            <p className="text-xs text-gray-500 mt-1">Abonnés payants</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-blue-600">{trialCount}</p>
            <p className="text-xs text-gray-500 mt-1">En essai</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-2xl font-bold text-gray-500">{freeCount}</p>
            <p className="text-xs text-gray-500 mt-1">Plan gratuit (sans abonnement)</p>
          </div>
        </div>

        {/* MRR breakdown */}
        {(activeSubs.length > 0 || expiredByDate.length > 0) && (
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Détail MRR</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Fournisseur</th>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 font-medium">Prix/mois</th>
                    <th className="px-4 py-2.5 font-medium">Expire le</th>
                    <th className="px-4 py-2.5 font-medium">MRR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeSubs.map(({ supplier, subscription: sub }) => (
                    <tr key={supplier.id} className="text-gray-700">
                      <td className="px-4 py-2.5 font-medium">{supplier.full_name}</td>
                      <td className="px-4 py-2.5">{sub!.plan.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatMAD(sub!.plan.price_mad_monthly)}</td>
                      <td className="px-4 py-2.5">
                        {sub!.expires_at
                          ? new Date(sub!.expires_at).toLocaleDateString('fr-FR')
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-green-700 font-medium">✓ inclus</span>
                      </td>
                    </tr>
                  ))}
                  {expiredByDate.map(({ supplier, subscription: sub }) => (
                    <tr key={supplier.id} className="text-gray-400 bg-red-50">
                      <td className="px-4 py-2.5">{supplier.full_name}</td>
                      <td className="px-4 py-2.5">{sub!.plan.name}</td>
                      <td className="px-4 py-2.5 tabular-nums line-through">{formatMAD(sub!.plan.price_mad_monthly)}</td>
                      <td className="px-4 py-2.5 text-red-500">
                        {new Date(sub!.expires_at!).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-red-500 font-medium">✗ expiré</span>
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
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Plans disponibles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        {/* Supplier list */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Fournisseurs ({suppliers.length})
          </h2>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {suppliers.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Aucun fournisseur approuvé.</p>
            )}
            {suppliers.map(({ supplier, subscription }) => {
              const planSlug = subscription?.plan.slug ?? 'free'
              const planName = subscription?.plan.name ?? 'Gratuit'
              const status   = subscription?.status ?? 'active'

              return (
                <details key={supplier.id} className="group">
                  <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{supplier.full_name}</p>
                        <p className="text-xs text-gray-500">{supplier.phone} · {supplier.city ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[planSlug] ?? 'bg-gray-100 text-gray-600'}`}>
                        {planName}
                      </span>
                      {subscription && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {status === 'active' ? 'Actif' : status === 'trial' ? 'Essai' : status === 'expired' ? 'Expiré' : 'Résilié'}
                        </span>
                      )}
                      <span className="text-gray-400 group-open:rotate-180 transition-transform text-xs">▼</span>
                    </div>
                  </summary>

                  <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
                    {/* Subscription details */}
                    {subscription && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <p>Depuis : {new Date(subscription.started_at).toLocaleDateString('fr-FR')}</p>
                        {subscription.expires_at && (
                          <p>Expire le : {new Date(subscription.expires_at).toLocaleDateString('fr-FR')}</p>
                        )}
                        {subscription.notes && <p>Notes : {subscription.notes}</p>}
                      </div>
                    )}

                    {/* Assign form */}
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

function PlanCard({ plan }: { plan: PremiumPlan }) {
  const colorMap: Record<string, string> = {
    free:         'border-gray-200',
    professional: 'border-indigo-300 ring-1 ring-indigo-200',
    enterprise:   'border-amber-300 ring-1 ring-amber-200',
  }

  return (
    <div className={`bg-white rounded-xl border p-5 space-y-3 ${colorMap[plan.slug] ?? 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{plan.name}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">
            {plan.price_mad_monthly === 0
              ? 'Gratuit'
              : `${plan.price_mad_monthly.toLocaleString('fr-FR')} MAD/mois`}
          </p>
        </div>
        {plan.verified_badge && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Vérifié</span>
        )}
        {!plan.verified_badge && plan.featured_badge && (
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Vedette</span>
        )}
      </div>

      <p className="text-xs text-gray-500">{plan.description}</p>

      <ul className="text-xs text-gray-600 space-y-1">
        <li>{plan.max_products === 0 ? 'Produits illimités' : `Jusqu'à ${plan.max_products} produits`}</li>
        {plan.rfq_priority_boost > 0 && <li>Boost RFQ +{plan.rfq_priority_boost} pts</li>}
        {plan.featured_badge && <li>Badge Vedette dans la marketplace</li>}
        {plan.verified_badge && <li>Badge Vérifié</li>}
        {plan.full_analytics && <li>Analytiques complètes</li>}
        {plan.priority_support && <li>Support prioritaire</li>}
      </ul>
    </div>
  )
}
