'use client'

import { useActionState } from 'react'
import { assignPlan, cancelSubscription } from '@/app/actions/premium'
import type { PremiumPlan } from '@/types/database'

type ActionResult = { error: string | null; success: boolean }
const init: ActionResult = { error: null, success: false }

// ── Assign Plan Form ─────────────────────────────────────────────────────────

export function AssignPlanForm({
  supplierId,
  plans,
  currentPlanSlug,
}: {
  supplierId: string
  plans: PremiumPlan[]
  currentPlanSlug: string
}) {
  const [state, action, isPending] = useActionState(assignPlan, init)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplier_id" value={supplierId} />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
        <select
          name="plan_slug"
          defaultValue={currentPlanSlug}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {plans.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} — {p.price_mad_monthly === 0 ? 'Gratuit' : `${p.price_mad_monthly} MAD/mois`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
        <select
          name="status"
          defaultValue="active"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="active">Actif</option>
          <option value="trial">Essai</option>
          <option value="expired">Expiré</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Expire le (optionnel)</label>
        <input
          type="date"
          name="expires_at"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (facturation)</label>
        <input
          type="text"
          name="notes"
          placeholder="ex: Payé par virement le 01/06"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-green-600">Plan mis à jour.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full text-sm bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Enregistrement…' : 'Assigner le plan'}
      </button>
    </form>
  )
}

// ── Cancel Subscription Form ──────────────────────────────────────────────────

export function CancelSubscriptionButton({ supplierId }: { supplierId: string }) {
  const [state, action, isPending] = useActionState(cancelSubscription, init)

  return (
    <form action={action}>
      <input type="hidden" name="supplier_id" value={supplierId} />
      {state.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {isPending ? 'Résiliation…' : 'Résilier'}
      </button>
    </form>
  )
}
