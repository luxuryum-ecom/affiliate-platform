import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { CommissionStatusForm } from '@/components/admin/commission-status-form'
import { BulkApproveButton } from '@/components/admin/bulk-approve-button'
import type { Commission, Profile, Order, CommissionStatus } from '@/types/database'

export const metadata = { title: 'Commissions affiliés — Administration' }

const STATUS_BADGE: Record<CommissionStatus, { label: string; cls: string }> = {
  pending:  { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvée',  cls: 'bg-blue-100 text-blue-700' },
  paid:     { label: 'Payée',      cls: 'bg-green-100 text-green-700' },
}

type CommissionRow = Commission & {
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
  order: Pick<Order, 'id' | 'customer_name' | 'customer_city' | 'quantity' | 'total_amount' | 'status' | 'created_at'> | null
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    affiliate_id?: string
  }>
}

const STATUSES: CommissionStatus[] = ['pending', 'approved', 'paid']

export default async function AdminCommissionsPage({ searchParams }: PageProps) {
  const { status: filterStatus, affiliate_id } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single() as { data: { full_name: string } | null; error: unknown }

  // Affiliates for filter dropdown
  const { data: affiliateRows } = (await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'affiliate')
    .eq('status', 'approved')
    .order('full_name')) as { data: { id: string; full_name: string }[] | null; error: unknown }
  const affiliates = affiliateRows ?? []

  // Build commissions query
  let query = supabase
    .from('commissions')
    .select(`
      *,
      affiliate:profiles!affiliate_id(id, full_name, phone),
      order:orders!order_id(id, customer_name, customer_city, quantity, total_amount, status, created_at)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  if (filterStatus && STATUSES.includes(filterStatus as CommissionStatus)) {
    query = query.eq('status', filterStatus)
  }
  if (affiliate_id) {
    query = query.eq('affiliate_id', affiliate_id)
  }

  const { data: rows } = (await query) as { data: CommissionRow[] | null; error: unknown }
  const list = rows ?? []

  // Totals over full dataset (unfiltered)
  const { data: allRows } = (await supabase
    .from('commissions')
    .select('status, amount')) as { data: { status: CommissionStatus; amount: number }[] | null; error: unknown }
  const all = allRows ?? []

  const totalPending  = all.filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0)
  const totalApproved = all.filter((c) => c.status === 'approved').reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid     = all.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0)
  const countMap = all.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  const isFiltered = !!(filterStatus || affiliate_id)

  // IDs of pending commissions in the current view — passed to bulk-approve button.
  const pendingIdsInView = list
    .filter((c) => c.status === 'pending')
    .map((c) => c.id)

  function buildHref(params: { status?: string; affiliate_id?: string }) {
    const p = new URLSearchParams()
    if (params.status) p.set('status', params.status)
    if (params.affiliate_id) p.set('affiliate_id', params.affiliate_id)
    const s = p.toString()
    return `/admin/commissions${s ? `?${s}` : ''}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm shrink-0">
              ← Dashboard
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="font-semibold text-gray-900 text-sm truncate">Commissions affiliés</span>
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

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700">En attente</p>
            <p className="mt-1 text-xl font-bold text-amber-800 tabular-nums">{formatMAD(totalPending)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{countMap.pending ?? 0} commission{(countMap.pending ?? 0) !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-700">Approuvées</p>
            <p className="mt-1 text-xl font-bold text-blue-800 tabular-nums">{formatMAD(totalApproved)}</p>
            <p className="text-xs text-blue-600 mt-0.5">{countMap.approved ?? 0} commission{(countMap.approved ?? 0) !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-700">Payées</p>
            <p className="mt-1 text-xl font-bold text-green-800 tabular-nums">{formatMAD(totalPaid)}</p>
            <p className="text-xs text-green-600 mt-0.5">{countMap.paid ?? 0} commission{(countMap.paid ?? 0) !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Affiliate filter */}
        {affiliates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 shrink-0">Affilié&nbsp;:</span>
            <Link
              href={buildHref({ status: filterStatus })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !affiliate_id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Tous
            </Link>
            {affiliates.map((a) => (
              <Link
                key={a.id}
                href={buildHref({ status: filterStatus, affiliate_id: a.id })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  affiliate_id === a.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a.full_name}
              </Link>
            ))}
          </div>
        )}

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link
            href={buildHref({ affiliate_id })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !filterStatus
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tous ({all.length})
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s, affiliate_id })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterStatus === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {STATUS_BADGE[s].label} ({countMap[s] ?? 0})
            </Link>
          ))}
        </div>

        {/* Results header + bulk action */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-xs text-gray-500">
            {list.length} commission{list.length !== 1 ? 's' : ''}
            {isFiltered ? ' (filtré)' : ''}
          </p>
          <BulkApproveButton pendingIds={pendingIdsInView} />
        </div>

        {/* Commission list */}
        {list.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">
              Aucune commission{isFiltered ? ' pour ce filtre' : ''}.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {list.map((commission) => {
              const badge = STATUS_BADGE[commission.status]
              const order = commission.order
              const affiliate = commission.affiliate

              return (
                <div key={commission.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">

                    {/* Left: commission info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-xs font-mono text-gray-400">
                          #{commission.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-bold text-gray-900 tabular-nums ml-auto sm:ml-0">
                          {formatMAD(Number(commission.amount))}
                        </span>
                      </div>

                      {/* Affiliate */}
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

                      {/* Order details */}
                      {order && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Commande{' '}
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-blue-600 hover:underline font-mono"
                          >
                            #{order.id.slice(0, 8).toUpperCase()}
                          </Link>
                          {' · '}{order.customer_name}
                          {' · '}{order.customer_city}
                          {' · '}×{order.quantity}
                          {' · '}<strong className="text-gray-700">{formatMAD(order.total_amount)}</strong>
                        </p>
                      )}

                      <p className="text-xs text-gray-400 mt-0.5">
                        Créée le{' '}
                        {new Date(commission.created_at).toLocaleDateString('fr-MA', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {commission.paid_at && (
                          <> · Payée le {new Date(commission.paid_at).toLocaleDateString('fr-MA', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}</>
                        )}
                      </p>
                    </div>

                    {/* Right: action buttons */}
                    <div className="shrink-0">
                      <CommissionStatusForm commission={commission} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
