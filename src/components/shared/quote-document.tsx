import { formatCurrency } from '@/lib/utils'
import type { QuoteRequest, QuoteRequestWithDetails } from '@/types/database'

const LEGAL_NOTICE =
  `Les prix, frais de transport, frais de douane et délais de livraison communiqués sont des estimations basées sur les informations disponibles au moment de l'établissement du devis. Le transport international peut être impacté par la météo, la situation géopolitique, les contrôles douaniers, les retards transporteurs ou tout cas de force majeure. Les délais annoncés ne constituent pas un engagement ferme. Mozouna Group s'engage à effectuer les procédures légales nécessaires à l'importation et à la livraison de la marchandise, ainsi qu'à fournir la facture commerciale relative à la commande.`

type QuoteDocumentData = Pick<
  QuoteRequest,
  | 'id'
  | 'quoted_unit_price_mad'
  | 'quoted_quantity'
  | 'quoted_transport_total_mad'
  | 'quoted_shipping_mode'
  | 'quoted_delivery_delay'
  | 'quote_validity_date'
  | 'quote_public_note'
  | 'quote_prepared_at'
  | 'destination_country'
  | 'destination_city'
  | 'display_currency'
  | 'fx_rate_display_vs_mad'
> & {
  buyer: Pick<QuoteRequestWithDetails['buyer'], 'full_name' | 'company_name'>
  product: Pick<QuoteRequestWithDetails['product'], 'name' | 'origin_country'>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function QuoteDocument({ data }: { data: QuoteDocumentData }) {
  // Montants stockés en MAD (pivot = vérité contractuelle). Affichage dans la devise
  // du client au taux FIGÉ du devis. IMP-B : on arrondit le prix unitaire affiché puis
  // on dérive le sous-total/total de cette valeur, pour que unitaire × qté = sous-total
  // à l'affichage (cohérence du document légal). Le MAD pivot reste la référence.
  const displayCurrency = data.display_currency ?? 'MAD'
  const displayRate = data.fx_rate_display_vs_mad ?? 1
  const round2 = (n: number) => Math.round(n * 100) / 100
  const fmt = (n: number) => formatCurrency(n, displayCurrency)

  const quantity = data.quoted_quantity ?? 0
  const unitPrice = round2((data.quoted_unit_price_mad ?? 0) / displayRate)
  const transportTotal = round2((data.quoted_transport_total_mad ?? 0) / displayRate)
  const productSubtotal = round2(unitPrice * quantity)
  const grandTotal = round2(productSubtotal + transportTotal)

  const refNo = `DV-${data.id.slice(0, 8).toUpperCase()}`
  const preparedAt = data.quote_prepared_at ? formatDate(data.quote_prepared_at) : '—'
  const validUntil = data.quote_validity_date
    ? new Date(data.quote_validity_date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden max-w-3xl mx-auto print:shadow-none print:border-0 print:rounded-none">

      {/* ── Header ── */}
      <div className="bg-indigo-700 px-8 py-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold tracking-wide">Mozouna Group</p>
            <p className="text-indigo-200 text-xs mt-0.5">Import &amp; Distribution B2B — Maroc</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-indigo-200 uppercase tracking-widest">Devis</p>
            <p className="text-xl font-bold mt-0.5">{refNo}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 text-xs text-indigo-100">
          <div>
            <span className="block text-indigo-300 mb-0.5">Date d&apos;émission</span>
            <span className="font-medium text-white">{preparedAt}</span>
          </div>
          <div>
            <span className="block text-indigo-300 mb-0.5">Valide jusqu&apos;au</span>
            <span className="font-medium text-white">{validUntil}</span>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── Client block ── */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Adressé à</p>
            <p className="text-sm font-semibold text-gray-900">
              {data.buyer.company_name ?? data.buyer.full_name}
            </p>
            {data.buyer.company_name && (
              <p className="text-xs text-gray-500 mt-0.5">{data.buyer.full_name}</p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">
              {[data.destination_city, data.destination_country].filter(Boolean).join(', ')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Produit</p>
            <p className="text-sm font-medium text-gray-900">{data.product.name}</p>
            {data.product.origin_country && (
              <p className="text-xs text-gray-500 mt-0.5">Origine : {data.product.origin_country}</p>
            )}
          </div>
        </div>

        {/* ── Quote table ── */}
        <div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qté</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prix unit.</th>
                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sous-total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-3 text-gray-900 font-medium">{data.product.name}</td>
                <td className="py-3 px-3 text-right text-gray-700">{quantity}</td>
                <td className="py-3 px-3 text-right text-gray-700">{fmt(unitPrice)}</td>
                <td className="py-3 px-3 text-right font-semibold text-gray-900">{fmt(productSubtotal)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-3 text-gray-700">Transport &amp; Douane</td>
                <td className="py-3 px-3 text-right text-gray-400">—</td>
                <td className="py-3 px-3 text-right text-gray-400">—</td>
                <td className="py-3 px-3 text-right font-semibold text-gray-900">{fmt(transportTotal)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50">
                <td colSpan={3} className="py-3 px-3 text-sm font-bold text-indigo-900 text-right">
                  Total général
                </td>
                <td className="py-3 px-3 text-right text-base font-bold text-indigo-900">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Logistics details ── */}
        {(data.quoted_shipping_mode || data.quoted_delivery_delay) && (
          <div className="grid grid-cols-2 gap-4 border border-gray-100 rounded-xl p-4 bg-gray-50">
            {data.quoted_shipping_mode && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Mode de transport</p>
                <p className="text-sm text-gray-800">{data.quoted_shipping_mode}</p>
              </div>
            )}
            {data.quoted_delivery_delay && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Délai de livraison estimé</p>
                <p className="text-sm text-gray-800">{data.quoted_delivery_delay}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Public note ── */}
        {data.quote_public_note && (
          <div className="border-l-4 border-indigo-300 pl-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Note</p>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{data.quote_public_note}</p>
          </div>
        )}

        {/* ── Legal notice ── */}
        <div className="border-t border-gray-100 pt-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mentions légales</p>
          <p className="text-xs text-gray-500 leading-relaxed">{LEGAL_NOTICE}</p>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-xs text-gray-400">
          <span>Mozouna Group — Maroc</span>
          <span>{refNo}</span>
        </div>
      </div>
    </div>
  )
}
