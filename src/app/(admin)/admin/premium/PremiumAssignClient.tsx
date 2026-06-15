'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
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
  const t  = useTranslations('admin.premium')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(assignPlan, init)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="supplier_id" value={supplierId} />

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{tc('type')}</label>
        <select
          name="plan_slug"
          defaultValue={currentPlanSlug}
          className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {plans.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} — {p.price_mad_monthly === 0 ? t('planFree') : t('planPricePerMonth', { price: p.price_mad_monthly })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('statusLabel')}</label>
        <select
          name="status"
          defaultValue="active"
          className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          <option value="active">{t('statusActive')}</option>
          <option value="trial">{t('statusTrial')}</option>
          <option value="expired">{t('statusExpired')}</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('mrrColExpires')}</label>
        <input
          type="date"
          name="expires_at"
          className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">{tc('note')}</label>
        <input
          type="text"
          name="notes"
          className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      {state.error && (
        <p className="text-xs text-danger-fg">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-success-fg">{tc('save')}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full text-sm bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? tc('saving') : tc('save')}
      </button>
    </form>
  )
}

// ── Cancel Subscription Form ──────────────────────────────────────────────────

export function CancelSubscriptionButton({ supplierId }: { supplierId: string }) {
  const t  = useTranslations('admin.premium')
  const tc = useTranslations('admin.common')
  const [state, action, isPending] = useActionState(cancelSubscription, init)

  return (
    <form action={action}>
      <input type="hidden" name="supplier_id" value={supplierId} />
      {state.error && (
        <p className="text-xs text-danger-fg mb-1">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-danger-fg hover:opacity-80 disabled:opacity-50 transition-opacity"
      >
        {isPending ? tc('updating') : t('cancelSubscription')}
      </button>
    </form>
  )
}
