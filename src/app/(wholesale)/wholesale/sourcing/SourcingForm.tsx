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

export default function SourcingForm({ labels }: { labels: SourcingFormLabels }) {
  const [state, action, isPending] = useActionState(submitSourcingRequest, initialState)

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-green-800 mb-1">{labels.successTitle}</p>
        <p className="text-xs text-green-600">{labels.successSubtitle}</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldProduct} <span className="text-red-500">*</span>
          </label>
          <input
            name="product_name"
            type="text"
            required
            placeholder={labels.fieldProductPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldCategory} <span className="text-red-500">*</span>
          </label>
          <select
            name="category"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
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
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldQty} <span className="text-red-500">*</span>
          </label>
          <input
            name="quantity"
            type="number"
            min={10}
            required
            placeholder={labels.fieldQtyPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldBudget} <span className="text-red-500">*</span>
          </label>
          <input
            name="target_budget_mad"
            type="number"
            min={1}
            step={0.01}
            required
            placeholder={labels.fieldBudgetPlaceholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldCountry}
          </label>
          <select
            name="target_country"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">{labels.fieldCountryNone}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {labels.fieldDeadline}
          </label>
          <input
            name="delivery_deadline"
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          {labels.fieldNotes}
        </label>
        <textarea
          name="notes"
          rows={3}
          placeholder={labels.fieldNotesPlaceholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? labels.submitting : labels.submit}
      </button>
    </form>
  )
}
