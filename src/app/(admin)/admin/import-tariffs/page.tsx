import Link from 'next/link'
import { getTariffs } from '@/app/actions/tariffs'
import { AddTariffForm, TariffRowActions } from '@/components/admin/tariff-row-actions'
import type { ImportTariff } from '@/types/database'

export const metadata = { title: 'Tarifs import — Administration' }

const PRICING_MODE_LABELS: Record<string, string> = {
  door_to_door_per_kg:    'Porte-à-porte / kg',
  sea_freight_cbm_or_kg:  'Fret maritime (CBM ou kg)',
}

export default async function AdminImportTariffsPage() {
  const tariffs = await getTariffs()

  const active   = tariffs.filter((t) => t.active)
  const inactive = tariffs.filter((t) => !t.active)

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
              ← Admin
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tarifs d&apos;import</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tarifs centralisés par pays d&apos;origine. Les produits <em>import sur demande</em> peuvent
            hériter de ces tarifs automatiquement.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre'] as const).map((country) => {
          const t = active.find((x) => x.country === country)
          return (
            <div key={country} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{country}</p>
              {t ? (
                <>
                  <p className="mt-2 text-lg font-bold text-gray-900">
                    {Number(t.price_mad).toFixed(2)} MAD
                  </p>
                  <p className="text-xs text-gray-500">/ {t.unit === 'cbm' ? 'CBM' : 'kg'}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-400 italic">Non configuré</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Add form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Ajouter un tarif</h2>
        <AddTariffForm />
      </div>

      {/* Tariffs table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Tarifs configurés ({tariffs.length})
          </h2>
          {inactive.length > 0 && (
            <span className="text-xs text-gray-400">
              {inactive.length} désactivé{inactive.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {tariffs.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            Aucun tarif configuré. Ajoutez-en un ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Pays</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Mode</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Prix</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 hidden md:table-cell">Délai</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 hidden lg:table-cell">Notes</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Statut</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tariffs.map((tariff) => (
                  <TariffTableRow key={tariff.id} tariff={tariff} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage note */}
      <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50 px-5 py-4">
        <p className="text-xs font-medium text-purple-700">
          Comment utiliser ces tarifs ?
        </p>
        <p className="mt-1 text-xs text-purple-600 leading-relaxed">
          Lors de la création ou modification d&apos;un produit <strong>import sur demande</strong>,
          choisissez <strong>« Tarif global »</strong> pour hériter automatiquement du tarif de ce pays.
          Choisissez <strong>« Tarif personnalisé »</strong> pour définir des tarifs spécifiques au produit.
          Les pages grossiste affichent automatiquement les données du tarif actif pour ce pays.
        </p>
      </div>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function TariffTableRow({ tariff }: { tariff: ImportTariff }) {
  return (
    <tr className={tariff.active ? '' : 'bg-gray-50 opacity-60'}>
      <td className="px-5 py-3 font-medium text-gray-900">{tariff.country}</td>
      <td className="px-5 py-3 text-gray-600 text-xs">
        {PRICING_MODE_LABELS[tariff.pricing_mode] ?? tariff.pricing_mode}
      </td>
      <td className="px-5 py-3 tabular-nums text-gray-900 font-medium">
        {Number(tariff.price_mad).toFixed(2)}&nbsp;MAD
        <span className="ml-1 text-gray-400 font-normal text-xs">
          / {tariff.unit === 'cbm' ? 'CBM' : 'kg'}
        </span>
      </td>
      <td className="px-5 py-3 hidden md:table-cell text-gray-600">
        {tariff.delivery_days != null ? `${tariff.delivery_days} j` : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-5 py-3 hidden lg:table-cell text-gray-500 text-xs max-w-[200px] truncate">
        {tariff.notes ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-5 py-3">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            tariff.active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-400'
          }`}
        >
          {tariff.active ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <TariffRowActions tariff={tariff} />
      </td>
    </tr>
  )
}
