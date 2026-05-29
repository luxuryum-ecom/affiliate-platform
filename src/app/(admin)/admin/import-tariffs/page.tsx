import Link from 'next/link'
import { getTariffs, SHIPPING_MODE_LABELS } from '@/app/actions/tariffs'
import { AddTariffForm, TariffRowActions } from '@/components/admin/tariff-row-actions'
import type { ImportTariff } from '@/types/database'

export const metadata = { title: 'Frais transport & douane — Administration' }

export default async function AdminImportTariffsPage() {
  const tariffs = await getTariffs()
  const active = tariffs.filter((t) => t.active)

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
            ← Admin
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Frais transport &amp; douane</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tarifs centralisés de transport et dédouanement par pays et mode d&apos;expédition.
          Ces frais <strong>ne comprennent pas</strong> le coût d&apos;achat du produit.
        </p>
      </div>

      {/* Clarification banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">Périmètre de ce tableau</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Ces tarifs représentent uniquement les <strong>frais de transport et de dédouanement</strong> vers le Maroc.
          Le coût d&apos;achat du produit (prix fournisseur) est géré séparément dans la fiche produit.
        </p>
      </div>

      {/* Summary cards — one per country */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre'] as const).map((country) => {
          const countryTariffs = active.filter((t) => t.country === country)
          return (
            <div key={country} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-2">{country}</p>
              {countryTariffs.length === 0 ? (
                <p className="text-xs text-gray-300 italic">—</p>
              ) : (
                <div className="space-y-1">
                  {countryTariffs.map((t) => (
                    <div key={t.id}>
                      <p className="text-xs text-gray-400 leading-none">{SHIPPING_MODE_LABELS[t.shipping_mode]}</p>
                      <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {Number(t.transport_customs_price_mad).toFixed(0)}&nbsp;MAD
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Ajouter un tarif</h2>
        <p className="text-xs text-gray-400 mb-4">
          Un seul tarif actif autorisé par combinaison pays + mode de transport.
        </p>
        <AddTariffForm />
      </div>

      {/* Tariffs table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Tarifs configurés ({tariffs.length})
          </h2>
          {tariffs.filter((t) => !t.active).length > 0 && (
            <span className="text-xs text-gray-400">
              {tariffs.filter((t) => !t.active).length} désactivé(s)
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
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Mode transport</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Frais transport & douane</th>
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

      {/* Usage instructions */}
      <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50 px-5 py-4">
        <p className="text-xs font-semibold text-purple-700 mb-1">
          Utilisation dans les fiches produit
        </p>
        <p className="text-xs text-purple-600 leading-relaxed">
          Sur chaque produit <strong>import sur demande</strong>, choisissez un pays d&apos;origine et un
          mode de transport. Activez <strong>« Tarif global »</strong> pour hériter automatiquement des
          frais ci-dessus, ou <strong>« Tarif personnalisé »</strong> pour saisir des frais propres au produit.
          Les grossistes voient les frais transport &amp; douane séparément du prix d&apos;achat.
        </p>
      </div>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function TariffTableRow({ tariff }: { tariff: ImportTariff }) {
  const unitLabel = tariff.unit === 'cbm' ? 'CBM' : 'kg'

  return (
    <tr className={tariff.active ? '' : 'bg-gray-50 opacity-60'}>
      <td className="px-5 py-3 font-medium text-gray-900">{tariff.country}</td>
      <td className="px-5 py-3 text-gray-700 text-xs">
        {SHIPPING_MODE_LABELS[tariff.shipping_mode]}
      </td>
      <td className="px-5 py-3 tabular-nums text-gray-900 font-medium">
        {Number(tariff.transport_customs_price_mad).toFixed(2)}&nbsp;MAD
        <span className="ml-1 text-gray-400 font-normal text-xs">/ {unitLabel}</span>
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
            tariff.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
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
