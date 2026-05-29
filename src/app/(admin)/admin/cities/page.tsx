import Link from 'next/link'
import { getCities } from '@/app/actions/cities'
import { formatMAD } from '@/lib/utils'
import { CityRowActions, AddCityForm } from '@/components/admin/city-row-actions'
import type { City } from '@/types/database'

export const metadata = { title: 'Villes & frais livraison — Administration' }

export default async function AdminCitiesPage() {
  const cities = await getCities()

  const active   = cities.filter((c) => c.is_active)
  const inactive = cities.filter((c) => !c.is_active)

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/logistics" className="text-sm text-gray-400 hover:text-gray-600">
              ← Logistique
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Villes & frais de livraison</h1>
          <p className="mt-1 text-sm text-gray-500">
            Les frais par ville sont appliqués aux commandes COD. Les villes non listées
            utilisent le frais par défaut des paramètres logistiques.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Villes actives</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{active.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Frais min</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {active.length > 0
              ? formatMAD(Math.min(...active.map((c) => Number(c.delivery_fee_mad))))
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Frais max</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {active.length > 0
              ? formatMAD(Math.max(...active.map((c) => Number(c.delivery_fee_mad))))
              : '—'}
          </p>
        </div>
      </div>

      {/* Add city */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Ajouter une ville</h2>
        <AddCityForm />
      </div>

      {/* City table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Villes configurées ({cities.length})
          </h2>
        </div>

        {cities.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            Aucune ville configurée. Ajoutez-en une ci-dessus.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Ville</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Frais livraison</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 hidden sm:table-cell">Code coursier</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cities.map((city) => (
                <CityRow key={city.id} city={city} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inactive cities section */}
      {inactive.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {inactive.length} ville{inactive.length > 1 ? 's' : ''} désactivée{inactive.length > 1 ? 's' : ''} — visible dans le tableau ci-dessus avec le statut &quot;Inactif&quot;.
        </p>
      )}

      {/* Courier API notice */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-4">
        <p className="text-xs font-medium text-gray-500">🔌 Synchronisation API transporteur — prévue</p>
        <p className="mt-1 text-xs text-gray-400">
          Les champs <code className="rounded bg-gray-200 px-1 text-gray-600">courier_code</code>,{' '}
          <code className="rounded bg-gray-200 px-1 text-gray-600">courier_zone</code> et{' '}
          <code className="rounded bg-gray-200 px-1 text-gray-600">courier_fee_mad</code> sont réservés pour
          la synchronisation automatique des tarifs via l&apos;API du transporteur.
          <code className="rounded bg-gray-200 px-1 text-gray-600">delivery_fee_mad</code> reste
          toujours le frais opératif — l&apos;admin peut l&apos;écraser manuellement.
        </p>
      </div>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function CityRow({ city }: { city: City }) {
  return (
    <tr className={city.is_active ? '' : 'bg-gray-50 opacity-60'}>
      <td className="px-6 py-3 font-medium text-gray-900">{city.name}</td>
      <td className="px-6 py-3 tabular-nums text-gray-700">
        {formatMAD(Number(city.delivery_fee_mad))}
      </td>
      <td className="px-6 py-3 hidden sm:table-cell">
        {city.courier_code ? (
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {city.courier_code}
          </code>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-6 py-3">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            city.is_active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-400'
          }`}
        >
          {city.is_active ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td className="px-6 py-3 text-right">
        <CityRowActions city={city} />
      </td>
    </tr>
  )
}
