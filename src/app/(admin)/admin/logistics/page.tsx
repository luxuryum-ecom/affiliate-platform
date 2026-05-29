import { getLogisticsSettings } from '@/app/actions/logistics'
import { LogisticsForm } from '@/components/admin/logistics-form'
import { formatMAD } from '@/lib/utils'

export const metadata = { title: 'Logistique — Administration' }

export default async function AdminLogisticsPage() {
  const settings = await getLogisticsSettings()

  const defaults = {
    id: 'default',
    casablanca_delivery_fee_mad: 25,
    default_delivery_fee_mad: 40,
    return_fee_mad: 10,
    api_config: {},
    updated_at: new Date().toISOString(),
    updated_by: null,
  }

  const current = settings ?? defaults

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logistique COD</h1>
        <p className="mt-1 text-sm text-gray-500">
          Frais de livraison et de retour appliqués aux commandes COD affiliés.
        </p>
      </div>

      {/* Current values summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Casablanca
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMAD(current.casablanca_delivery_fee_mad)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Frais de livraison</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Autres villes
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMAD(current.default_delivery_fee_mad)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Frais de livraison</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Retour
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMAD(current.return_fee_mad)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Frais de retour (toutes villes)</p>
        </div>
      </div>

      {/* Commission formula reference */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          Formule commission affilié
        </p>
        <p className="mt-2 font-mono text-sm text-blue-900">
          Commission = prix_vente − coût_usine − marge_plateforme
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;− frais_livraison − frais_confirmation − frais_emballage
        </p>
        <p className="mt-2 text-xs text-blue-700">
          Le frais de livraison est résolu automatiquement selon la ville du client au moment de la commande.
        </p>
      </div>

      {/* Edit form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-gray-900">
          Modifier les paramètres
        </h2>
        <LogisticsForm settings={current} />
      </div>

      {/* Future API integration notice */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-4">
        <p className="text-xs font-medium text-gray-500">
          🔌 Intégration API transporteur — prévue
        </p>
        <p className="mt-1 text-xs text-gray-400">
          La structure est prête pour une intégration future avec une API de livraison (Amana, Chronopost Maroc, etc.).
          Le champ <code className="rounded bg-gray-200 px-1 text-gray-600">api_config</code> sur chaque commande est réservé à cet usage.
        </p>
      </div>
    </div>
  )
}
