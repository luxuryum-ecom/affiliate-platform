import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { CreatePayoutForm } from '@/components/admin/create-payout-form'
import type { Payout, Profile, PayoutStatus } from '@/types/database'

export const metadata = { title: 'Paiements affiliés — Administration' }

const STATUS_BADGE: Record<PayoutStatus, { label: string; cls: string }> = {
  pending:    { label: 'En attente',   cls: 'bg-amber-100 text-amber-700' },
  processing: { label: 'En cours',     cls: 'bg-blue-100 text-blue-700' },
  paid:       { label: 'Payé',         cls: 'bg-green-100 text-green-700' },
}

type PayoutRow = Payout & { affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null }

export default async function AdminPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  // All approved affiliates with their approved commission totals
  const [affiliatesRes, commissionsRes, payoutsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'affiliate')
      .eq('status', 'approved')
      .order('full_name') as unknown as Promise<{ data: Pick<Profile, 'id' | 'full_name' | 'phone'>[] | null; error: unknown }>,

    supabase
      .from('commissions')
      .select('affiliate_id, amount, status') as unknown as Promise<{
        data: { affiliate_id: string; amount: number; status: string }[] | null
        error: unknown
      }>,

    supabase
      .from('payouts')
      .select('*, affiliate:profiles!affiliate_id(id, full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(200) as unknown as Promise<{ data: PayoutRow[] | null; error: unknown }>,
  ])

  const affiliateRows = affiliatesRes.data ?? []
  const allCommissions = commissionsRes.data ?? []
  const payouts = payoutsRes.data ?? []

  // Build per-affiliate commission stats
  const approvedByAffiliate = allCommissions.reduce<
    Record<string, { total: number; count: number }>
  >((acc, c) => {
    if (c.status !== 'approved') return acc
    acc[c.affiliate_id] ??= { total: 0, count: 0 }
    acc[c.affiliate_id].total += Number(c.amount)
    acc[c.affiliate_id].count += 1
    return acc
  }, {})

  const affiliatesForForm = affiliateRows.map((a) => ({
    id: a.id,
    full_name: a.full_name,
    approvedCommissionTotal: approvedByAffiliate[a.id]?.total ?? 0,
    approvedCommissionCount: approvedByAffiliate[a.id]?.count ?? 0,
  }))

  // Summary totals
  const totalPaid = payouts
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0)
  const pendingApprovedTotal = Object.values(approvedByAffiliate).reduce(
    (s, v) => s + v.total,
    0
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm shrink-0">
              ← Dashboard
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">Paiements affiliés</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-gray-500 hidden sm:block">{profileData?.full_name}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-800">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700">Commissions approuvées (à payer)</p>
            <p className="mt-1 text-2xl font-bold text-amber-800 tabular-nums">
              {formatMAD(pendingApprovedTotal)}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {affiliatesForForm.filter((a) => a.approvedCommissionCount > 0).length} affilié(s)
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-700">Total paiements versés</p>
            <p className="mt-1 text-2xl font-bold text-green-800 tabular-nums">
              {formatMAD(totalPaid)}
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              {payouts.filter((p) => p.status === 'paid').length} virement(s)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Create payout form — left panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-20">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Enregistrer un paiement</h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Sélectionnez un affilié, entrez le montant versé et une référence de virement.
                Toutes ses commissions <strong>approuvées</strong> seront automatiquement marquées comme payées.
              </p>
              <CreatePayoutForm affiliates={affiliatesForForm} />
            </div>
          </div>

          {/* Payout history — right panel */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Historique ({payouts.length})
            </h2>

            {payouts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <p className="text-sm text-gray-400">Aucun paiement enregistré pour l&apos;instant.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {payouts.map((payout) => {
                  const badge = STATUS_BADGE[payout.status]
                  const affiliate = payout.affiliate
                  return (
                    <div key={payout.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-mono text-gray-400">
                              #{payout.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                          {affiliate && (
                            <p className="text-sm font-medium text-gray-900">
                              {affiliate.full_name}
                              {affiliate.phone && (
                                <span className="text-xs text-gray-400 font-normal ml-1.5">
                                  {affiliate.phone}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(payout.created_at).toLocaleDateString('fr-MA', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {payout.reference && (
                              <> · Réf&nbsp;: <span className="font-mono">{payout.reference}</span></>
                            )}
                            {payout.notes && <> · {payout.notes}</>}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold text-gray-900 tabular-nums">
                            {formatMAD(Number(payout.amount))}
                          </p>
                          {payout.paid_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              versé le{' '}
                              {new Date(payout.paid_at).toLocaleDateString('fr-MA', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
