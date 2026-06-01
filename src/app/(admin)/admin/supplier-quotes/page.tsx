import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { labelPurchaseProfile, labelVolumeTier } from '@/lib/rfq-buyer-intake'
import { PAYOUT_STATUS_BADGE } from '@/components/admin/supplier-payout-form'
import type { SupplierQuoteRequest, SupplierProduct, SupplierQuoteRequestStatus, SupplierPayoutStatus, Profile } from '@/types/database'

export const metadata = { title: 'Devis fournisseurs — Administration' }

const STATUS_BADGE: Record<SupplierQuoteRequestStatus, { label: string; cls: string }> = {
  new:       { label: 'Nouveau',    cls: 'bg-gray-100 text-gray-600' },
  studying:  { label: 'En étude',   cls: 'bg-amber-100 text-amber-700' },
  quoted:    { label: 'Devis émis', cls: 'bg-blue-100 text-blue-700' },
  approved:  { label: 'Approuvé',   cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rejeté',     cls: 'bg-red-100 text-red-600' },
}

type QuoteRow = SupplierQuoteRequest & {
  supplier_product: Pick<SupplierProduct, 'id' | 'product_name' | 'supplier_id'> & {
    supplier: Pick<Profile, 'id' | 'full_name'> | null
  } | null
}

interface PageProps {
  searchParams: Promise<{ payout?: string }>
}

export default async function AdminSupplierQuotesPage({ searchParams }: PageProps) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single() as { data: Pick<Profile, 'full_name'> | null; error: unknown }

  let query = supabase
    .from('supplier_quote_requests')
    .select(`
      *,
      supplier_product:supplier_products!supplier_product_id(
        id, product_name, supplier_id,
        supplier:profiles!supplier_id(id, full_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.payout) {
    query = query.eq('supplier_payout_status', filters.payout)
  }

  const { data } = await query
  const quotes = (data ?? []) as unknown as QuoteRow[]

  // Analytics summary
  const totalDue = quotes
    .filter((q) => ['pending', 'partially_paid'].includes(q.supplier_payout_status))
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
  const totalPaid = quotes
    .filter((q) => q.supplier_payout_status === 'paid')
    .reduce((s, q) => s + (q.supplier_payout_amount_mad ?? 0), 0)
  const totalCommission = quotes
    .reduce((s, q) => s + (q.platform_commission_amount_mad ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-900 text-sm">Devis fournisseurs</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/supplier-analytics" className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
              Analytics →
            </Link>
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Analytics strip */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">À verser</p>
            <p className="text-xl font-bold text-amber-600 tabular-nums">{formatMAD(totalDue)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Versé</p>
            <p className="text-xl font-bold text-green-600 tabular-nums">{formatMAD(totalPaid)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Commission Mozouna</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums">{formatMAD(totalCommission)}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          {(['', 'not_due', 'pending', 'partially_paid', 'paid'] as const).map((s) => (
            <Link
              key={s}
              href={s ? `/admin/supplier-quotes?payout=${s}` : '/admin/supplier-quotes'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (filters.payout ?? '') === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s === '' ? 'Tous' : PAYOUT_STATUS_BADGE[s as SupplierPayoutStatus].label}
            </Link>
          ))}
        </div>

        {quotes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">Aucun devis fournisseur.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {quotes.map((q) => {
              const payoutBadge = PAYOUT_STATUS_BADGE[q.supplier_payout_status]
              const statusBadge = STATUS_BADGE[q.status]
              return (
                <div key={q.id} className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">
                        {q.supplier_product?.product_name ?? 'Produit inconnu'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                        {statusBadge.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${payoutBadge.cls}`}>
                        {payoutBadge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                      <span>Fournisseur : {q.supplier_product?.supplier?.full_name ?? '—'}</span>
                      <span className="text-gray-300">·</span>
                      <span>{q.quantity_requested} u.</span>
                      {q.buyer_purchase_profile && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{labelPurchaseProfile(q.buyer_purchase_profile)}</span>
                        </>
                      )}
                      {q.buyer_volume_tier && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{labelVolumeTier(q.buyer_volume_tier)}</span>
                        </>
                      )}
                      {q.quoted_unit_price_mad != null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span>{formatMAD(q.quoted_unit_price_mad)}/u</span>
                        </>
                      )}
                      {q.supplier_payout_amount_mad != null && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="font-medium text-gray-700">
                            Reversement : {formatMAD(q.supplier_payout_amount_mad)}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(q.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <Link
                    href={`/admin/supplier-quotes/${q.id}`}
                    className="shrink-0 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                  >
                    Détail →
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
