import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { SupplierFinancialsForm } from '@/components/admin/supplier-financials-form'
import { SupplierPayoutForm, PAYOUT_STATUS_BADGE } from '@/components/admin/supplier-payout-form'
import type {
  SupplierQuoteRequest,
  SupplierProduct,
  SupplierPayoutHistory,
  SupplierPayoutStatus,
  SupplierQuoteRequestStatus,
  Profile,
} from '@/types/database'

export const metadata = { title: 'Devis fournisseur — Administration' }

const STATUS_BADGE: Record<SupplierQuoteRequestStatus, { label: string; cls: string }> = {
  new:       { label: 'Nouveau',    cls: 'bg-gray-100 text-gray-600' },
  studying:  { label: 'En étude',   cls: 'bg-amber-100 text-amber-700' },
  quoted:    { label: 'Devis émis', cls: 'bg-blue-100 text-blue-700' },
  approved:  { label: 'Approuvé',   cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rejeté',     cls: 'bg-red-100 text-red-600' },
}

type QuoteFull = SupplierQuoteRequest & {
  supplier_product: (SupplierProduct & {
    supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'> | null
  }) | null
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city' | 'company_name'> | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSupplierQuoteDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  const [quoteResult, historyResult] = await Promise.all([
    supabase
      .from('supplier_quote_requests')
      .select(`
        *,
        supplier_product:supplier_products!supplier_product_id(
          *,
          supplier:profiles!supplier_id(id, full_name, phone, city)
        ),
        buyer:profiles!buyer_id(id, full_name, phone, city, company_name)
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('supplier_payout_history')
      .select('*, changed_by_profile:profiles!changed_by(full_name)')
      .eq('supplier_quote_request_id', id)
      .order('changed_at', { ascending: false }),
  ])

  if (!quoteResult.data) notFound()

  const quote = quoteResult.data as unknown as QuoteFull
  const history = (historyResult.data ?? []) as (SupplierPayoutHistory & {
    changed_by_profile: Pick<Profile, 'full_name'> | null
  })[]

  const statusBadge = STATUS_BADGE[quote.status]
  const payoutBadge = PAYOUT_STATUS_BADGE[quote.supplier_payout_status]
  const totalClientAmount = (quote.quoted_unit_price_mad ?? 0) * quote.quantity_requested

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/supplier-quotes" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Devis fournisseurs
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
              {quote.supplier_product?.product_name ?? id}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{adminProfile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: quote details + supplier identity + buyer identity + payout history */}
          <div className="lg:col-span-2 space-y-4">

            {/* Quote info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h1 className="text-base font-semibold text-gray-900">
                  {quote.supplier_product?.product_name ?? 'Produit'}
                </h1>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payoutBadge.cls}`}>
                  {payoutBadge.label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-400 text-xs">Quantité demandée</dt>
                  <dd className="text-gray-900 font-medium">{quote.quantity_requested} u.</dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Destination</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.destination_country}{quote.destination_city ? ` — ${quote.destination_city}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Prix unitaire devis</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.quoted_unit_price_mad != null ? formatMAD(quote.quoted_unit_price_mad) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-xs">Total client</dt>
                  <dd className="text-gray-900 font-bold">{formatMAD(totalClientAmount)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-400 text-xs">Soumis le</dt>
                  <dd className="text-gray-900 font-medium">
                    {new Date(quote.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </dd>
                </div>
                {quote.buyer_notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 text-xs">Note acheteur</dt>
                    <dd className="text-gray-700 text-sm mt-0.5 bg-gray-50 rounded-lg px-3 py-2">
                      {quote.buyer_notes}
                    </dd>
                  </div>
                )}
                {quote.admin_notes && (
                  <div className="col-span-2">
                    <dt className="text-gray-400 text-xs">Notes admin internes</dt>
                    <dd className="text-gray-700 text-sm mt-0.5 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                      {quote.admin_notes}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Financial breakdown (admin only — never shown to supplier) */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">
                Décomposition financière — Admin uniquement
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-indigo-500 text-xs">Coût fournisseur</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.supplier_cost_mad != null ? formatMAD(quote.supplier_cost_mad) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-indigo-500 text-xs">Commission Mozouna</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.platform_commission_amount_mad != null
                      ? `${formatMAD(quote.platform_commission_amount_mad)} (${
                          quote.platform_commission_type === 'percent'
                            ? `${quote.platform_commission_value}%`
                            : `fixe ${formatMAD(quote.platform_commission_value ?? 0)}`
                        })`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-indigo-500 text-xs">Transport & douanes</dt>
                  <dd className="text-gray-900 font-medium">{formatMAD(quote.transport_customs_cost_mad)}</dd>
                </div>
                <div>
                  <dt className="text-indigo-500 text-xs">Reversement fournisseur</dt>
                  <dd className={`font-bold ${(quote.supplier_payout_amount_mad ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {quote.supplier_payout_amount_mad != null ? formatMAD(quote.supplier_payout_amount_mad) : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Supplier identity (admin only) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
                Identité fournisseur — Admin uniquement
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-amber-600 text-xs">Nom</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.supplier_product?.supplier?.full_name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">Téléphone</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.supplier_product?.supplier?.phone ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">Ville</dt>
                  <dd className="text-gray-900 font-medium">
                    {quote.supplier_product?.supplier?.city ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-amber-600 text-xs">Produit soumis</dt>
                  <dd className="text-gray-500 text-xs font-mono">{quote.supplier_product_id}</dd>
                </div>
              </dl>
            </div>

            {/* Buyer identity (admin only) */}
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-3">
                Identité acheteur — Admin uniquement
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-rose-500 text-xs">Nom</dt>
                  <dd className="text-gray-900 font-medium">{quote.buyer?.full_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-rose-500 text-xs">Téléphone</dt>
                  <dd className="text-gray-900 font-medium">{quote.buyer?.phone ?? '—'}</dd>
                </div>
                {quote.buyer?.company_name && (
                  <div className="col-span-2">
                    <dt className="text-rose-500 text-xs">Société</dt>
                    <dd className="text-gray-900 font-medium">{quote.buyer.company_name}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-rose-500 text-xs">WhatsApp</dt>
                  <dd className="text-gray-900 font-medium">{quote.whatsapp_number}</dd>
                </div>
              </dl>
            </div>

            {/* Payout history timeline */}
            {history.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Historique des reversements</h2>
                <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                  {history.map((h) => {
                    const prevBadge = h.previous_status ? PAYOUT_STATUS_BADGE[h.previous_status] : null
                    const newBadge = PAYOUT_STATUS_BADGE[h.new_status as SupplierPayoutStatus]
                    return (
                      <li key={h.id} className="ml-4">
                        <div className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white bg-gray-400" />
                        <p className="text-xs text-gray-400 mb-0.5">
                          {new Date(h.changed_at).toLocaleString('fr-FR')}
                          {h.changed_by_profile?.full_name && (
                            <span className="ml-1 text-gray-500">— {h.changed_by_profile.full_name}</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-800 flex flex-wrap items-center gap-1.5">
                          {prevBadge && (
                            <>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${prevBadge.cls}`}>{prevBadge.label}</span>
                              <span className="text-gray-400">→</span>
                            </>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${newBadge.cls}`}>{newBadge.label}</span>
                        </p>
                        {h.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{h.notes}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* Right: admin actions */}
          <div className="space-y-4">
            <SupplierFinancialsForm
              quoteRequestId={quote.id}
              quantityRequested={quote.quantity_requested}
              quotedUnitPriceMad={quote.quoted_unit_price_mad}
              supplierCostMad={quote.supplier_cost_mad}
              commissionType={quote.platform_commission_type}
              commissionValue={quote.platform_commission_value}
              commissionAmountMad={quote.platform_commission_amount_mad}
              transportCostMad={quote.transport_customs_cost_mad}
              payoutAmountMad={quote.supplier_payout_amount_mad}
            />
            <SupplierPayoutForm
              quoteRequestId={quote.id}
              currentStatus={quote.supplier_payout_status}
              payoutAmountMad={quote.supplier_payout_amount_mad}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
