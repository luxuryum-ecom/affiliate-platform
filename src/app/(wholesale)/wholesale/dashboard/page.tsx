import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions/auth'
import { formatMAD } from '@/lib/utils'
import { MozounaLogo } from '@/components/shared/branding'
import type { Profile, WholesaleOrder } from '@/types/database'

type QuoteCountRow = { status: string }
type SupplierQuoteCountRow = { status: string }

export const metadata = {
  title: 'Tableau de bord — Espace Grossiste',
}

export default async function WholesaleDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const [
    { count: totalOrders },
    { count: cartItemCount },
    { data: orderRows },
    { data: quoteStatusRows },
    { data: supplierQuoteRows },
    { count: pendingSampleCount },
  ] = await Promise.all([
    supabase
      .from('wholesale_orders')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', user!.id),
    supabase
      .from('wholesale_cart_items')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', user!.id),
    supabase
      .from('wholesale_orders')
      .select('*')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: WholesaleOrder[] | null; error: unknown }>,
    supabase
      .from('quote_requests')
      .select('status')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: QuoteCountRow[] | null; error: unknown }>,
    supabase
      .from('supplier_quote_requests')
      .select('status')
      .eq('buyer_id', user!.id) as unknown as Promise<{ data: SupplierQuoteCountRow[] | null; error: unknown }>,
    supabase
      .from('sample_requests')
      .select('*', { count: 'exact', head: true })
      .eq('wholesaler_id', user!.id)
      .eq('status', 'pending'),
  ])

  const totalSpend = (orderRows ?? [])
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + Number(o.total_amount), 0)

  const pendingOrders = (orderRows ?? []).filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length

  const quoteRows = quoteStatusRows ?? []
  const sqRows = supplierQuoteRows ?? []
  const preparedQuotes  = quoteRows.filter((q) => q.status === 'quote_prepared').length
                        + sqRows.filter((q) => q.status === 'quoted').length
  const acceptedQuotes  = quoteRows.filter((q) => q.status === 'accepted_by_client').length
                        + sqRows.filter((q) => q.status === 'approved').length
  const rejectedQuotes  = quoteRows.filter((q) => q.status === 'rejected_by_client').length
                        + sqRows.filter((q) => q.status === 'rejected').length

  const stats = [
    { label: 'Commandes passées', value: String(totalOrders ?? 0) },
    { label: 'En cours', value: String(pendingOrders) },
    { label: 'Articles dans le panier', value: String(cartItemCount ?? 0) },
    { label: 'Total dépensé', value: formatMAD(totalSpend) },
  ]

  const quoteStats = [
    { label: 'Devis prêts', value: String(preparedQuotes), cls: preparedQuotes > 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200', textCls: preparedQuotes > 0 ? 'text-indigo-700' : 'text-gray-900' },
    { label: 'Devis acceptés', value: String(acceptedQuotes), cls: 'bg-white border-gray-200', textCls: 'text-green-700' },
    { label: 'Devis refusés', value: String(rejectedQuotes), cls: 'bg-white border-gray-200', textCls: 'text-red-600' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MozounaLogo size="md" />
            <span className="hidden sm:block text-gray-300">|</span>
            <span className="hidden sm:block text-sm font-medium text-gray-600">Espace Grossiste</span>
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

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">
            Bonjour, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Commandez en gros et suivez vos livraisons.
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

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Catalogue produits</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Stock interne Mozouna — commande directe, livraison rapide. Paliers de prix grossiste.
              </p>
            </div>
            <Link
              href="/wholesale/products"
              className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              Voir le catalogue
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Mon panier</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {cartItemCount
                  ? `${cartItemCount} article${(cartItemCount as number) > 1 ? 's' : ''} en attente.`
                  : 'Votre panier est vide.'}
              </p>
            </div>
            <Link
              href="/wholesale/cart"
              className="text-xs px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Voir le panier
            </Link>
          </div>
        </div>

        {/* Orders CTA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Mes commandes</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendingOrders > 0
                ? `${pendingOrders} commande${pendingOrders > 1 ? 's' : ''} en cours.`
                : 'Suivez l\'état de vos commandes grossiste.'}
            </p>
          </div>
          <Link
            href="/wholesale/orders"
            className="text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Voir mes commandes →
          </Link>
        </div>

        {/* Supplier marketplace */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Marketplace fournisseurs</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Fournisseurs vérifiés — stock local (commande directe) ou import sur mesure (devis).
            </p>
          </div>
          <Link
            href="/wholesale/marketplace"
            className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            Explorer →
          </Link>
        </div>

        {/* Quote requests */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Demandes de devis</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Consultez vos demandes de devis pour les produits import.
              </p>
            </div>
            <Link
              href="/wholesale/quote-requests"
              className="text-xs px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 transition-colors whitespace-nowrap"
            >
              Mes devis →
            </Link>
          </div>
          {/* Quote decision counters */}
          <div className="grid grid-cols-3 gap-2">
            {quoteStats.map((qs) => (
              <div key={qs.label} className={`rounded-lg border p-3 ${qs.cls}`}>
                <p className="text-xs text-gray-500 leading-tight">{qs.label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${qs.textCls}`}>{qs.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sample requests */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Demandes d&apos;échantillons</h2>
              {(pendingSampleCount ?? 0) > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                  {pendingSampleCount}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {(pendingSampleCount ?? 0) > 0
                ? `${pendingSampleCount} demande${(pendingSampleCount as number) > 1 ? 's' : ''} en attente de traitement.`
                : 'Demandez des photos, vidéos ou échantillons physiques depuis la marketplace.'}
            </p>
          </div>
          <Link
            href="/wholesale/samples"
            className="text-xs px-4 py-2 bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap"
          >
            Mes demandes →
          </Link>
        </div>

        {/* Intelligent Sourcing */}
        <div className="bg-white rounded-xl border border-indigo-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-900">Sourcing intelligent</h2>
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">Nouveau</span>
            </div>
            <p className="text-xs text-gray-500">
              Décrivez votre besoin — notre équipe identifie les meilleurs fournisseurs et vous prépare un devis confidentiel.
            </p>
          </div>
          <Link
            href="/wholesale/sourcing"
            className="text-xs px-4 py-2 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 transition-colors whitespace-nowrap"
          >
            Faire une demande →
          </Link>
        </div>

        {/* Account / billing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Mon compte &amp; facturation</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Gérez vos informations de facturation (ICE, RC, adresse).
            </p>
          </div>
          <Link
            href="/wholesale/account"
            className="text-xs px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Modifier →
          </Link>
        </div>
      </main>
    </div>
  )
}
