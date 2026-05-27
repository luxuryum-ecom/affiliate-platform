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

  // Real-time stats — these will show zeros until orders are created
  const [
    { count: totalOrders },
    { count: deliveredOrders },
    { data: commissionRows },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('affiliate_id', user!.id),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('affiliate_id', user!.id)
      .eq('status', 'delivered'),
    supabase
      .from('commissions')
      .select('*')
      .eq('affiliate_id', user!.id) as unknown as Promise<{ data: Commission[] | null; error: unknown }>,
  ])

  const pendingCommissions = (commissionRows ?? [])
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const paidCommissions = (commissionRows ?? [])
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const stats = [
    { label: 'Commandes', value: String(totalOrders ?? 0) },
    { label: 'Livrées', value: String(deliveredOrders ?? 0) },
    { label: 'Commissions en attente', value: formatMAD(pendingCommissions) },
    { label: 'Commissions payées', value: formatMAD(paidCommissions) },
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

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
              <p className="mt-1.5 text-xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
            </div>
          ))}
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

        {/* Orders table — empty state */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Mes commandes</h2>
            <button
              disabled
              className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg opacity-40 cursor-not-allowed"
            >
              + Nouvelle commande
            </button>
          </div>

          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-400">
              Aucune commande pour le moment.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Le catalogue de produits est maintenant disponible.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
