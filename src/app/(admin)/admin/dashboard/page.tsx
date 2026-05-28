import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import type { Profile } from '@/types/database'

export const metadata = {
  title: 'Tableau de bord — Administration',
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const isAdmin = profile?.role === 'admin'

  // Counts — admin sees all via RLS; agent sees only their scope
  const [
    { count: pendingUsers },
    { count: approvedAffiliates },
    { count: approvedWholesalers },
    { count: totalOrders },
    { count: todayOrders },
    { count: pendingWholesaleOrders },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'affiliate')
      .eq('status', 'approved'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'wholesaler')
      .eq('status', 'approved'),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
    supabase
      .from('wholesale_orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'confirmed', 'sourcing']),
  ])

  const platformStats = [
    {
      label: 'Affiliés actifs',
      value: String(approvedAffiliates ?? 0),
      highlight: false,
    },
    {
      label: 'Grossistes actifs',
      value: String(approvedWholesalers ?? 0),
      highlight: false,
    },
    {
      label: 'Inscriptions en attente',
      value: String(pendingUsers ?? 0),
      highlight: (pendingUsers ?? 0) > 0,
    },
    {
      label: 'Commandes aujourd\'hui',
      value: String(todayOrders ?? 0),
      highlight: false,
    },
    {
      label: 'Commandes COD (total)',
      value: String(totalOrders ?? 0),
      highlight: false,
    },
    {
      label: 'Commandes gros à traiter',
      value: String(pendingWholesaleOrders ?? 0),
      highlight: (pendingWholesaleOrders ?? 0) > 0,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-900 text-sm">Administration</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full capitalize">
              {profile?.role}
            </span>
          </div>
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

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vue d&apos;ensemble de la plateforme.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {platformStats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border p-4 ${
                stat.highlight
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-white border-gray-200'
              }`}
            >
              <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
              <p
                className={`mt-1.5 text-2xl font-bold tabular-nums ${
                  stat.highlight ? 'text-amber-700' : 'text-gray-900'
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
          {isAdmin && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                title: 'Approuver les inscriptions',
                description: 'Valider ou rejeter les nouveaux comptes.',
                badge: pendingUsers ?? 0,
                href: '/admin/users',
              },
              {
                title: 'Gérer les produits',
                description: 'Ajouter, modifier ou désactiver des produits.',
                badge: null,
                href: '/admin/products',
              },
              {
                title: 'Commandes COD',
                description: 'Suivre et mettre à jour les statuts de livraison.',
                badge: null,
                href: '/admin/orders',
              },
              {
                title: 'Commandes grossiste',
                description: 'Gérer les commandes B2B et convertir les paniers.',
                badge: pendingWholesaleOrders ?? 0,
                href: '/admin/wholesale-orders',
              },
            ].map((action) => (
              <div
                key={action.title}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{action.title}</h3>
                  {action.badge != null && action.badge > 0 && (
                    <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      {action.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-4">{action.description}</p>
                {action.href ? (
                  <Link
                    href={action.href}
                    className="inline-block text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Ouvrir →
                  </Link>
                ) : (
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg opacity-40 cursor-not-allowed"
                  >
                    Bientôt →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
