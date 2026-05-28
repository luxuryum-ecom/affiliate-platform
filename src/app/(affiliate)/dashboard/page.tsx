import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import type { Profile, Commission } from '@/types/database'

export const metadata = {
  title: 'Tableau de bord — Espace Affilié',
}

export default async function AffiliateDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  // Detailed order stats per status + commissions
  const [
    { data: orderRows },
    { data: commissionRows },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('status')
      .eq('affiliate_id', user!.id) as unknown as Promise<{ data: { status: string }[] | null; error: unknown }>,
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id) as unknown as Promise<{ data: Commission[] | null; error: unknown }>,
  ])

  const orders = orderRows ?? []
  const commissions = commissionRows ?? []

  const countByStatus = (status: string) => orders.filter((o) => o.status === status).length

  const pendingCommissions = commissions
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const approvedCommissions = commissions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const paidCommissions = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const totalDue = pendingCommissions + approvedCommissions

  const orderStats = [
    { label: 'Total commandes',        value: String(orders.length) },
    { label: 'Confirmées',             value: String(countByStatus('confirmed')) },
    { label: 'Expédiées',              value: String(countByStatus('shipped')) },
    { label: 'Livrées',                value: String(countByStatus('delivered')) },
    { label: 'Retournées / Annulées',  value: String(countByStatus('returned') + countByStatus('cancelled')) },
  ]

  const commissionStats = [
    { label: 'Commissions gagnées',    value: formatMAD(pendingCommissions + approvedCommissions + paidCommissions), highlight: false },
    { label: 'Commissions payées',     value: formatMAD(paidCommissions),   highlight: false },
    { label: 'Montant dû (à payer)',   value: formatMAD(totalDue),          highlight: totalDue > 0 },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">Espace Affilié</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">
            Bonjour, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Voici un résumé de votre activité.
          </p>
        </div>

        {/* Order stats */}
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Commandes
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            {orderStats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
                <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Commission stats */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Commissions
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {commissionStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl border p-4 ${
                  stat.highlight
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
                <p className={`mt-1.5 text-xl font-bold tabular-nums ${
                  stat.highlight ? 'text-amber-700' : 'text-gray-900'
                }`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Catalog CTA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Catalogue produits</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Parcourez les produits, copiez vos liens affiliés et partagez-les.
            </p>
          </div>
          <Link
            href="/affiliate/products"
            className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Voir le catalogue
          </Link>
        </div>

        {/* Orders CTA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Mes commandes</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Suivez vos commandes et consultez vos commissions.
            </p>
          </div>
          <Link
            href="/affiliate/orders"
            className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Voir mes commandes →
          </Link>
        </div>
      </main>
    </div>
  )
}
