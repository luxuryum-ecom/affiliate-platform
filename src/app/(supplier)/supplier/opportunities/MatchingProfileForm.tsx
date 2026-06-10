'use client'

import { useActionState } from 'react'
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

  const defaultCategories = existing?.categories.join(', ') ?? ''
  const defaultCountries  = existing?.countries_served.join(', ') ?? ''

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</div>
      )}
      {state.success && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          Profil sauvegardé. Le moteur RFQ utilisera ces données pour les prochains matchings.
        </div>
      )}

      {/* Type */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Type de fournisseur</label>
        <select
          name="supplier_type"
          defaultValue={existing?.supplier_type ?? 'international'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="morocco">🇲🇦 Local Maroc</option>
          <option value="international">🌍 International</option>
        </select>
      </div>

      {/* Categories */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Catégories maîtrisées <span className="font-normal text-gray-400">(séparées par virgule)</span></label>
        <input
          name="categories"
          type="text"
          defaultValue={defaultCategories}
          placeholder="ex: Électronique, Textile, Cosmétique"
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
        <label className="block text-xs font-semibold text-gray-700 mb-2">Pays desservis <span className="font-normal text-gray-400">(séparés par virgule)</span></label>
        <input
          name="countries_served"
          type="text"
          defaultValue={defaultCountries}
          placeholder="ex: Maroc, France, Global"
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
          <label className="block text-xs font-semibold text-gray-700 mb-2">MOQ minimum (unités)</label>
          <input
            name="moq_min"
            type="number"
            min={0}
            defaultValue={existing?.moq_min ?? ''}
            placeholder="ex: 50"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">MOQ maximum (unités)</label>
          <input
            name="moq_max"
            type="number"
            min={0}
            defaultValue={existing?.moq_max ?? ''}
            placeholder="ex: 10000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Capacity + Lead time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Capacité de production (unités/mois)</label>
          <input
            name="production_capacity"
            type="number"
            min={0}
            defaultValue={existing?.production_capacity ?? ''}
            placeholder="ex: 5000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Délai min (jours)</label>
          <input
            name="lead_time_days_min"
            type="number"
            min={0}
            defaultValue={existing?.lead_time_days_min ?? ''}
            placeholder="ex: 7"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Délai max (jours)</label>
          <input
            name="lead_time_days_max"
            type="number"
            min={0}
            defaultValue={existing?.lead_time_days_max ?? ''}
            placeholder="ex: 30"
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
            <span className="text-sm text-gray-700">Capacité d&apos;export international</span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Sauvegarde...' : 'Sauvegarder le profil RFQ'}
      </button>
    </form>
  )
}
