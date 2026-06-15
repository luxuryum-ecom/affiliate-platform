'use client'

import { useActionState } from 'react'
import { submitWholesaleOrder } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'

interface SubmitOrderLabels {
  deliverySection: string
  deliveryOptional: string
  fieldCity: string
  fieldCityPlaceholder: string
  fieldAddress: string
  fieldAddressPlaceholder: string
  fieldNotes: string
  fieldNotesPlaceholder: string
  submitOrder: string
  submittingOrder: string
}

const defaultLabels: SubmitOrderLabels = {
  deliverySection: 'Informations de livraison',
  deliveryOptional: '(optionnel)',
  fieldCity: 'Ville',
  fieldCityPlaceholder: 'Ex: Casablanca',
  fieldAddress: 'Adresse',
  fieldAddressPlaceholder: 'Ex: 123 Rue Mohammed V',
  fieldNotes: "Note pour l'équipe",
  fieldNotesPlaceholder: 'Délai souhaité, instructions spéciales, variantes…',
  submitOrder: 'Soumettre la commande grossiste',
  submittingOrder: 'Envoi de la commande…',
}

const INPUT = 'w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint'

const initialState: ActionState = { error: null, success: false }

export function SubmitWholesaleOrderForm({ labels = defaultLabels }: { labels?: SubmitOrderLabels }) {
  const [state, action, isPending] = useActionState(submitWholesaleOrder, initialState)

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {/* Delivery details */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            {labels.deliverySection}{' '}
            <span className="font-normal normal-case text-faint">{labels.deliveryOptional}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">{labels.fieldCity}</label>
              <input
                name="city"
                placeholder={labels.fieldCityPlaceholder}
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">{labels.fieldAddress}</label>
              <input
                name="address"
                placeholder={labels.fieldAddressPlaceholder}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">{labels.fieldNotes}</label>
            <textarea
              name="buyer_notes"
              rows={2}
              placeholder={labels.fieldNotesPlaceholder}
              className={`${INPUT} resize-none`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? labels.submittingOrder : labels.submitOrder}
        </button>
      </form>

      {state.error && (
        <p className="text-sm text-danger-fg bg-danger-soft border border-danger px-3 py-2 rounded-lg">
          {state.error}
        </p>
      )}
    </div>
  )
}
