'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { upsertMatchingProfile } from '@/app/actions/rfq-engine'
import type { SupplierMatchingProfile } from '@/types/database'

const initial = { error: null, success: false }

const ALL_CATEGORIES = [
  'Électronique', 'Textile', 'Cosmétique', 'Alimentaire', 'Sport & Outdoor',
  'Maison & Décoration', 'Jouets', 'Auto & Moto', 'Santé & Bien-être', 'Industriel',
  'Informatique', 'Mode & Accessoires', 'Bagagerie', 'Agriculture', 'Autre',
]

const ALL_COUNTRIES = [
  'Maroc', 'Chine', 'Turquie', 'Espagne', 'France', 'Italie', 'Inde',
  'Bangladesh', 'Vietnam', 'Portugal', 'Allemagne', 'Pays-Bas', 'Global',
]

export default function MatchingProfileForm({ existing }: { existing: SupplierMatchingProfile | null }) {
  const [state, action, isPending] = useActionState(upsertMatchingProfile, initial)
  const t = useTranslations('supplier.matchingProfileForm')

  const defaultCategories = existing?.categories.join(', ') ?? ''
  const defaultCountries  = existing?.countries_served.join(', ') ?? ''

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{t('errorField')} : {state.error}</div>
      )}
      {state.success && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          {t('successMessage')}
        </div>
      )}

      {/* Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">{t('supplierTypeLabel')}</label>
        <select
          name="supplier_type"
          defaultValue={existing?.supplier_type ?? 'international'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="morocco">🇲🇦 {t('supplierTypeMorocco')}</option>
          <option value="international">🌍 {t('supplierTypeInternational')}</option>
        </select>
      </div>

      {/* Categories */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          {t('categoriesLabel')} <span className="font-normal text-gray-400">({t('categoriesHint')})</span>
        </label>
        <input
          name="categories"
          type="text"
          defaultValue={defaultCategories}
          placeholder={t('categoriesPlaceholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {ALL_CATEGORIES.map((c) => (
            <span key={c} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full cursor-default">{c}</span>
          ))}
        </div>
      </div>

      {/* Countries */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          {t('countriesLabel')} <span className="font-normal text-gray-400">({t('countriesHint')})</span>
        </label>
        <input
          name="countries_served"
          type="text"
          defaultValue={defaultCountries}
          placeholder={t('countriesPlaceholder')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {ALL_COUNTRIES.map((c) => (
            <span key={c} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full cursor-default">{c}</span>
          ))}
        </div>
      </div>

      {/* MOQ */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">{t('moqMinLabel')}</label>
          <input
            name="moq_min"
            type="number"
            min={0}
            defaultValue={existing?.moq_min ?? ''}
            placeholder={t('moqMinPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">{t('moqMaxLabel')}</label>
          <input
            name="moq_max"
            type="number"
            min={0}
            defaultValue={existing?.moq_max ?? ''}
            placeholder={t('moqMaxPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Capacity + Lead time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">{t('capacityLabel')}</label>
          <input
            name="production_capacity"
            type="number"
            min={0}
            defaultValue={existing?.production_capacity ?? ''}
            placeholder={t('capacityPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">{t('leadTimeMinLabel')}</label>
          <input
            name="lead_time_days_min"
            type="number"
            min={0}
            defaultValue={existing?.lead_time_days_min ?? ''}
            placeholder={t('leadTimeMinPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">{t('leadTimeMaxLabel')}</label>
          <input
            name="lead_time_days_max"
            type="number"
            min={0}
            defaultValue={existing?.lead_time_days_max ?? ''}
            placeholder={t('leadTimeMaxPlaceholder')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              name="export_capable"
              type="checkbox"
              value="true"
              defaultChecked={existing?.export_capable ?? false}
              className="w-4 h-4 rounded accent-gray-900"
            />
            <span className="text-sm text-gray-700">{t('exportCapableLabel')}</span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('saving') : t('ctaSave')}
      </button>
    </form>
  )
}
