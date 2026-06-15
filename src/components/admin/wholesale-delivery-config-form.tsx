'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { setWholesaleDeliveryConfig } from '@/app/actions/orders'
import { formatMAD } from '@/lib/utils'
import type { WholesaleDeliveryCostHandling, WholesaleLogisticsMode } from '@/types/database'

// Couleur du badge d'état de collecte — CSS seulement, libellés via t().
const HANDLING_OPTIONS: WholesaleDeliveryCostHandling[] = [
  'rebilled_client',
  'supplier_billed',
  'supplier_free',
]
const LOGISTICS_OPTIONS: WholesaleLogisticsMode[] = ['pickup_by_runner', 'supplier_fleet']

interface Props {
  orderId: string
  currentHandling: WholesaleDeliveryCostHandling | null
  currentLogisticsMode: WholesaleLogisticsMode | null
  deliveryCost: number
  deliveryRebill: number
  rebillCollected: boolean
  collectedAmount: number | null
}

const initial = { error: null, success: false }

export function WholesaleDeliveryConfigForm({
  orderId,
  currentHandling,
  currentLogisticsMode,
  deliveryCost,
  deliveryRebill,
  rebillCollected,
  collectedAmount,
}: Props) {
  const t    = useTranslations('admin.wholesaleDeliveryForm')
  const tc   = useTranslations('admin.common')
  const tErr = useTranslations() // racine → résout les clés errors.*
  const [state, action, isPending] = useActionState(setWholesaleDeliveryConfig, initial)

  // État local PURE UI : pilote l'affichage conditionnel des champs montant.
  // Aucun calcul financier côté client (RÈGLE ABSOLUE n°1).
  const [handling, setHandling] = useState<string>(currentHandling ?? '')

  // cost_event_uuid : généré UNE SEULE FOIS par instance de formulaire (stable
  // au retry → idempotence DELTA côté RPC). Ne PAS régénérer à chaque render.
  const [costEventUuid] = useState(() => crypto.randomUUID())

  const showAmounts = handling === 'rebilled_client'

  return (
    <div className="bg-surface rounded-xl border border-line p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{t('heading')}</h2>

      {/* État de collecte (lecture seule) — la collecte est automatique (raccord paiement). */}
      {rebillCollected ? (
        <p className="text-xs text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
          {t('rebillCollected', { amount: formatMAD(collectedAmount ?? 0) })}
        </p>
      ) : currentHandling === 'rebilled_client' && deliveryRebill > 0 ? (
        <p className="text-xs text-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
          {t('rebillNotCollected')}
        </p>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="cost_event_uuid" value={costEventUuid} />

        {/* Mode logistique (optionnel) */}
        <div>
          <label className="block text-xs text-muted mb-1">{t('logisticsModeLabel')}</label>
          <select
            name="logistics_mode"
            defaultValue={currentLogisticsMode ?? ''}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="">{t('logisticsModeNone')}</option>
            {LOGISTICS_OPTIONS.map((m) => (
              <option key={m} value={m}>{t(`mode.${m}`)}</option>
            ))}
          </select>
        </div>

        {/* Traitement du coût livraison (3 cas) */}
        <div>
          <label className="block text-xs text-muted mb-1">{t('handlingLabel')}</label>
          <select
            name="delivery_cost_handling"
            value={handling}
            onChange={(e) => setHandling(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
          >
            <option value="" disabled>{t('handlingPlaceholder')}</option>
            {HANDLING_OPTIONS.map((h) => (
              <option key={h} value={h}>{t(`handling.${h}`)}</option>
            ))}
          </select>
        </div>

        {showAmounts ? (
          <>
            {/* Coût transport réel (décaissement Mozouna → livreur) */}
            <div>
              <label className="block text-xs text-muted mb-1">{t('deliveryCostLabel')}</label>
              <div className="relative">
                <input
                  type="number"
                  name="delivery_cost_mad"
                  defaultValue={deliveryCost || ''}
                  min={0}
                  step={0.01}
                  placeholder="0"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">MAD</span>
              </div>
            </div>

            {/* Refacturation client (≥ coût — invariant validé côté serveur) */}
            <div>
              <label className="block text-xs text-muted mb-1">{t('deliveryRebillLabel')}</label>
              <div className="relative">
                <input
                  type="number"
                  name="delivery_rebill_mad"
                  defaultValue={deliveryRebill || ''}
                  min={0}
                  step={0.01}
                  placeholder="0"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm pr-14 bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">MAD</span>
              </div>
              <p className="text-[11px] text-faint mt-1">{t('deliveryRebillHint')}</p>
            </div>
          </>
        ) : handling === 'supplier_billed' || handling === 'supplier_free' ? (
          <p className="text-xs text-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
            {t('supplierBearsCost')}
          </p>
        ) : null}

        {state.error && (
          <p className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-3 py-2">
            {tErr(state.error)}
          </p>
        )}
        {state.success && (
          <p className="text-xs text-success-fg bg-success-soft border border-success rounded-lg px-3 py-2">
            {t('saved')}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || handling === ''}
          className="w-full py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? tc('saving') : t('submit')}
        </button>
      </form>
    </div>
  )
}
