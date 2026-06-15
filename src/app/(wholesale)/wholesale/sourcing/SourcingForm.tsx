'use client'

import { useActionState } from 'react'
import { submitSourcingRequest } from '@/app/actions/sourcing'
import { SUPPLIER_CATEGORIES } from '@/types/database'

const COUNTRIES = ['Chine', 'Turquie', 'Égypte', 'Dubai', 'Maroc', 'Inde', 'Autre']

const initialState = { error: null, success: false }

interface SourcingFormLabels {
  fieldProduct: string
  fieldProductPlaceholder: string
  fieldCategory: string
  fieldCategoryPlaceholder: string
  fieldQty: string
  fieldQtyPlaceholder: string
  fieldBudget: string
  fieldBudgetPlaceholder: string
  fieldCountry: string
  fieldCountryNone: string
  fieldDeadline: string
  fieldNotes: string
  fieldNotesPlaceholder: string
  submit: string
  submitting: string
  successTitle: string
  successSubtitle: string
}

const INPUT = 'w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint'
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

export default function SourcingForm({ labels }: { labels: SourcingFormLabels }) {
  const [state, action, isPending] = useActionState(submitSourcingRequest, initialState)

  if (state.success) {
    return (
      <div className="bg-success-soft border border-success rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-success-fg mb-1">{labels.successTitle}</p>
        <p className="text-xs text-success-fg">{labels.successSubtitle}</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <div className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>
            {labels.fieldProduct} <span className="text-danger-fg">*</span>
          </label>
          <input
            name="product_name"
            type="text"
            required
            placeholder={labels.fieldProductPlaceholder}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>
            {labels.fieldCategory} <span className="text-danger-fg">*</span>
          </label>
          <select
            name="category"
            required
            className={INPUT}
          >
            <option value="">{labels.fieldCategoryPlaceholder}</option>
            {SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>
            {labels.fieldQty} <span className="text-danger-fg">*</span>
          </label>
          <input
            name="quantity"
            type="number"
            min={10}
            required
            placeholder={labels.fieldQtyPlaceholder}
            className={INPUT}
          />
        </div>

        <div>
          <label className={LABEL}>
            {labels.fieldBudget} <span className="text-danger-fg">*</span>
          </label>
          <input
            name="target_budget_mad"
            type="number"
            min={1}
            step={0.01}
            required
            placeholder={labels.fieldBudgetPlaceholder}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>
            {labels.fieldCountry}
          </label>
          <select
            name="target_country"
            className={INPUT}
          >
            <option value="">{labels.fieldCountryNone}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL}>
            {labels.fieldDeadline}
          </label>
          <input
            name="delivery_deadline"
            type="date"
            className={INPUT}
          />
        </div>
      </div>

      <div>
        <label className={LABEL}>
          {labels.fieldNotes}
        </label>
        <textarea
          name="notes"
          rows={3}
          placeholder={labels.fieldNotesPlaceholder}
          className={`${INPUT} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? labels.submitting : labels.submit}
      </button>
    </form>
  )
}
